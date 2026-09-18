-- Stage 8: Database-first reports and dashboard
create index if not exists invoices_org_issue_date_idx on public.invoices(organization_id, issue_date desc);
create index if not exists invoices_org_status_issue_date_idx on public.invoices(organization_id, status, issue_date desc);
create index if not exists invoice_items_org_invoice_idx on public.invoice_items(organization_id, invoice_id);
create index if not exists invoice_items_org_product_idx on public.invoice_items(organization_id, product_id);
create index if not exists payments_org_date_direction_idx on public.payments(organization_id, payment_date desc, direction);
create index if not exists expenses_org_date_idx on public.expenses(organization_id, expense_date desc);
create index if not exists warehouse_stock_org_product_idx on public.warehouse_stock(organization_id, product_id);
create index if not exists journal_entries_org_date_status_idx on public.journal_entries(organization_id, entry_date desc, status);
create index if not exists journal_lines_org_account_entry_idx on public.journal_lines(organization_id, account_id, journal_entry_id);

drop function if exists public.get_reports_data(date,date,integer,integer);

create or replace function public.get_reports_data(
  p_from date,p_to date,p_page integer default 1,p_page_size integer default 25
) returns jsonb
language plpgsql security definer set search_path=public,private as $$
declare
 v_org uuid:=private.current_user_organization_id();
 v_page integer:=greatest(coalesce(p_page,1),1);
 v_size integer:=least(greatest(coalesce(p_page_size,25),1),100);
 v_offset integer:=(v_page-1)*v_size;
 v_sales numeric:=0; v_expenses numeric:=0; v_receipts numeric:=0; v_payments numeric:=0;
 v_profit numeric:=0; v_receivables numeric:=0; v_payables numeric:=0;
 v_sales_count bigint:=0; v_expense_count bigint:=0; v_receipt_count bigint:=0; v_payment_count bigint:=0;
 v_sales_rows jsonb:='[]'::jsonb; v_expense_rows jsonb:='[]'::jsonb; v_receipt_rows jsonb:='[]'::jsonb; v_payment_rows jsonb:='[]'::jsonb;
 v_daily jsonb:='[]'::jsonb; v_monthly jsonb:='[]'::jsonb; v_yearly jsonb:='[]'::jsonb;
 v_top_customers jsonb:='[]'::jsonb; v_top_products jsonb:='[]'::jsonb; v_inventory jsonb:='[]'::jsonb;
 v_pnl jsonb:='[]'::jsonb; v_cashflow jsonb:='[]'::jsonb;
begin
 if v_org is null then raise exception 'حساب سازمانی فعال یافت نشد.'; end if;
 if p_from is null or p_to is null or p_from>p_to then raise exception 'بازه تاریخ نامعتبر است.'; end if;

 select coalesce(sum(i.total_amount),0),count(*) into v_sales,v_sales_count from invoices i where i.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to;
 select coalesce(sum(e.amount),0),count(*) into v_expenses,v_expense_count from expenses e where e.organization_id=v_org and e.status='POSTED' and e.transaction_kind='POSTED' and e.expense_date between p_from and p_to;
 select coalesce(sum(case when p.direction='RECEIPT' and p.transaction_kind='POSTED' then p.amount when p.direction='RECEIPT' and p.transaction_kind='REVERSAL' then -p.amount else 0 end),0),
        coalesce(sum(case when p.direction='PAYMENT' and p.transaction_kind='POSTED' then p.amount when p.direction='PAYMENT' and p.transaction_kind='REVERSAL' then -p.amount else 0 end),0),
        count(*) filter(where p.direction='RECEIPT'),count(*) filter(where p.direction='PAYMENT')
   into v_receipts,v_payments,v_receipt_count,v_payment_count
   from payments p where p.organization_id=v_org and p.payment_date between p_from and p_to;

 select coalesce(sum(case when a.account_type='REVENUE' then l.credit-l.debit when a.account_type='EXPENSE' then -(l.debit-l.credit) else 0 end),0)
   into v_profit
   from journal_entries je join journal_lines l on l.journal_entry_id=je.id and l.organization_id=v_org
   join chart_of_accounts a on a.id=l.account_id and a.organization_id=v_org
  where je.organization_id=v_org and je.status='POSTED' and je.entry_date between p_from and p_to;

 select coalesce(sum(balance),0) into v_receivables from customer_balances where organization_id=v_org and balance>0;
 select coalesce(sum(balance),0) into v_payables from supplier_balances where organization_id=v_org and balance>0;

 select coalesce(jsonb_agg(x order by x.sales_day),'[]'::jsonb) into v_daily from
 (select i.issue_date sales_day,sum(i.total_amount) total,count(*) invoice_count from invoices i where i.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to group by i.issue_date)x;
 select coalesce(jsonb_agg(x order by x.month_start),'[]'::jsonb) into v_monthly from
 (select date_trunc('month',i.issue_date)::date month_start,sum(i.total_amount) total,count(*) invoice_count from invoices i where i.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to group by 1)x;
 select coalesce(jsonb_agg(x order by x.year_start),'[]'::jsonb) into v_yearly from
 (select date_trunc('year',i.issue_date)::date year_start,sum(i.total_amount) total,count(*) invoice_count from invoices i where i.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to group by 1)x;

 select coalesce(jsonb_agg(x),'[]'::jsonb) into v_top_customers from
 (select c.id customer_id,c.name,sum(i.total_amount) total,count(*) invoice_count from invoices i join customers c on c.id=i.customer_id and c.organization_id=v_org
  where i.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to and i.customer_id is not null group by c.id,c.name order by total desc limit 10)x;

 select coalesce(jsonb_agg(x),'[]'::jsonb) into v_top_products from
 (select coalesce(ii.product_id::text,'') product_id,ii.product_name name,sum(ii.quantity) quantity,sum(ii.quantity*ii.unit_price) revenue
  from invoice_items ii join invoices i on i.id=ii.invoice_id and i.organization_id=v_org
  where ii.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to group by ii.product_id,ii.product_name order by revenue desc limit 10)x;

 select coalesce(jsonb_agg(x order by x.name),'[]'::jsonb) into v_inventory from
 (select p.id product_id,p.name,p.unit,p.min_stock,coalesce(sum(ws.quantity),0) quantity,coalesce(sum(ws.quantity),0)<p.min_stock low_stock
  from products p left join warehouse_stock ws on ws.product_id=p.id and ws.organization_id=v_org where p.organization_id=v_org group by p.id,p.name,p.unit,p.min_stock)x;

 select coalesce(jsonb_agg(x order by x.account_type,x.code),'[]'::jsonb) into v_pnl from
 (select a.code,a.name,a.account_type,coalesce(sum(l.debit),0) debit,coalesce(sum(l.credit),0) credit,
   case when a.account_type='REVENUE' then coalesce(sum(l.credit-l.debit),0) when a.account_type='EXPENSE' then coalesce(sum(l.debit-l.credit),0) else 0 end amount
  from chart_of_accounts a join journal_lines l on l.account_id=a.id and l.organization_id=v_org join journal_entries je on je.id=l.journal_entry_id and je.organization_id=v_org and je.status='POSTED'
  where a.organization_id=v_org and a.account_type in('REVENUE','EXPENSE') and je.entry_date between p_from and p_to
  group by a.id,a.code,a.name,a.account_type)x;

 select coalesce(jsonb_agg(x order by x.flow_day),'[]'::jsonb) into v_cashflow from
 (select flow_day,sum(receipts) receipts,sum(payments) payments,sum(expenses) expenses,sum(receipts)-sum(payments)-sum(expenses) net from
  (select p.payment_date flow_day,
    case when p.direction='RECEIPT' and p.transaction_kind='POSTED' then p.amount when p.direction='RECEIPT' and p.transaction_kind='REVERSAL' then -p.amount else 0 end receipts,
    case when p.direction='PAYMENT' and p.transaction_kind='POSTED' then p.amount when p.direction='PAYMENT' and p.transaction_kind='REVERSAL' then -p.amount else 0 end payments,0::numeric expenses
   from payments p where p.organization_id=v_org and p.payment_date between p_from and p_to
   union all
   select e.expense_date,0::numeric,0::numeric,e.amount from expenses e where e.organization_id=v_org and e.status='POSTED' and e.transaction_kind='POSTED' and e.expense_date between p_from and p_to)q group by flow_day)x;

 select coalesce(jsonb_agg(x),'[]'::jsonb) into v_sales_rows from
 (select i.id,i.invoice_number,i.issue_date,i.total_amount,i.payment_status,c.name customer_name from invoices i left join customers c on c.id=i.customer_id and c.organization_id=v_org
  where i.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to order by i.issue_date desc,i.created_at desc offset v_offset limit v_size)x;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into v_expense_rows from
 (select e.id,e.expense_date,e.category,e.amount,e.description from expenses e where e.organization_id=v_org and e.status='POSTED' and e.transaction_kind='POSTED' and e.expense_date between p_from and p_to order by e.expense_date desc,e.created_at desc offset v_offset limit v_size)x;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into v_receipt_rows from
 (select p.id,p.payment_date,p.amount,p.payment_method,p.tracking_number,c.name customer_name from payments p left join customers c on c.id=p.customer_id and c.organization_id=v_org
  where p.organization_id=v_org and p.direction='RECEIPT' and p.payment_date between p_from and p_to order by p.payment_date desc,p.created_at desc offset v_offset limit v_size)x;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into v_payment_rows from
 (select p.id,p.payment_date,p.amount,p.payment_method,p.tracking_number,s.name supplier_name from payments p left join suppliers s on s.id=p.supplier_id and s.organization_id=v_org
  where p.organization_id=v_org and p.direction='PAYMENT' and p.payment_date between p_from and p_to order by p.payment_date desc,p.created_at desc offset v_offset limit v_size)x;

 return jsonb_build_object('summary',jsonb_build_object('sales',v_sales,'expenses',v_expenses,'receipts',v_receipts,'payments',v_payments,'profit',v_profit,'receivables',v_receivables,'payables',v_payables,'sales_count',v_sales_count,'expense_count',v_expense_count,'receipt_count',v_receipt_count,'payment_count',v_payment_count),
  'sales_daily',v_daily,'sales_monthly',v_monthly,'sales_yearly',v_yearly,'top_customers',v_top_customers,'top_products',v_top_products,'inventory',v_inventory,'profit_loss',v_pnl,'cash_flow',v_cashflow,
  'sales_rows',v_sales_rows,'expense_rows',v_expense_rows,'receipt_rows',v_receipt_rows,'payment_rows',v_payment_rows,'page',v_page,'page_size',v_size);
end;
$$;

revoke all on function public.get_reports_data(date,date,integer,integer) from public;
grant execute on function public.get_reports_data(date,date,integer,integer) to authenticated;