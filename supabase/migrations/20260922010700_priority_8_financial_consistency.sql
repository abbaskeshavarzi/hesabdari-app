-- Priority 8: financial consistency hardening.
-- Safe/additive. No destructive data migration.
update public.invoices set payment_status='PARTIALLY_PAID' where payment_status='PARTIAL';

create or replace function public._post_sale_journal(p_invoice_id uuid,p_reversal boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.current_user_organization_id(); v_entry uuid; v_total numeric; v_ar uuid; v_sales uuid;
begin
 if v_org is null then raise exception 'سازمان فعال یافت نشد.'; end if;
 select total_amount into v_total from public.invoices where id=p_invoice_id and organization_id=v_org and status in ('POSTED','VOIDED') for update;
 if not found or v_total<=0 then return null; end if;
 select id into v_ar from public.chart_of_accounts where organization_id=v_org and code='1200' and account_type='ASSET' and is_active limit 1;
 select id into v_sales from public.chart_of_accounts where organization_id=v_org and code='4100' and account_type='REVENUE' and is_active limit 1;
 if v_ar is null or v_sales is null then raise exception 'حساب‌های 1200 و 4100 برای ثبت فروش وجود ندارند.'; end if;
 if exists(select 1 from public.journal_entries where organization_id=v_org and source_type=case when p_reversal then 'INVOICE_VOID' else 'INVOICE' end and source_id=p_invoice_id and status='POSTED') then return null; end if;
 insert into public.journal_entries(organization_id,entry_date,description,source_type,source_id,status,created_by)
 select v_org,current_date,case when p_reversal then 'ابطال فاکتور ' else 'فروش فاکتور ' end||coalesce(invoice_number,''),case when p_reversal then 'INVOICE_VOID' else 'INVOICE' end,p_invoice_id,'POSTED',auth.uid()
 from public.invoices where id=p_invoice_id returning id into v_entry;
 if not p_reversal then
  insert into public.journal_lines(organization_id,journal_entry_id,account_id,debit,credit,description) values(v_org,v_entry,v_ar,v_total,0,'حساب دریافتنی فروش'),(v_org,v_entry,v_sales,0,v_total,'درآمد فروش');
 else
  insert into public.journal_lines(organization_id,journal_entry_id,account_id,debit,credit,description) values(v_org,v_entry,v_sales,v_total,0,'برگشت درآمد فروش'),(v_org,v_entry,v_ar,0,v_total,'برگشت حساب دریافتنی');
 end if;
 return v_entry;
end; $$;

create or replace function public._post_payment_journal(p_payment_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.current_user_organization_id(); p public.payments%rowtype; v_entry uuid; v_cash uuid; v_ar uuid; v_ap uuid; v_debit uuid; v_credit uuid;
begin
 select * into p from public.payments where id=p_payment_id and organization_id=v_org;
 if not found then raise exception 'تراکنش مالی یافت نشد.'; end if;
 select id into v_cash from public.chart_of_accounts where organization_id=v_org and code='1100' and account_type='ASSET' and is_active limit 1;
 if p.direction='RECEIPT' then
  select id into v_ar from public.chart_of_accounts where organization_id=v_org and code='1200' and account_type='ASSET' and is_active limit 1; v_debit:=v_cash; v_credit:=v_ar;
 else
  select id into v_ap from public.chart_of_accounts where organization_id=v_org and code='2100' and account_type='LIABILITY' and is_active limit 1; v_debit:=v_ap; v_credit:=v_cash;
 end if;
 if v_debit is null or v_credit is null then raise exception 'حساب متناظر تراکنش مالی وجود ندارد.'; end if;
 if exists(select 1 from public.journal_entries where organization_id=v_org and source_type='PAYMENT' and source_id=p_payment_id and status='POSTED') then return null; end if;
 insert into public.journal_entries(organization_id,entry_date,description,source_type,source_id,status,created_by)
 values(v_org,p.payment_date,coalesce(p.note,'تراکنش مالی'),'PAYMENT',p_payment_id,'POSTED',coalesce(p.created_by,auth.uid())) returning id into v_entry;
 insert into public.journal_lines(organization_id,journal_entry_id,account_id,debit,credit,description) values(v_org,v_entry,v_debit,p.amount,0,'ثبت تراکنش مالی'),(v_org,v_entry,v_credit,0,p.amount);
 return v_entry;
end; $$;

create or replace function public.post_invoice(p_invoice_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.current_user_organization_id(); v_status text;
begin
 if auth.uid() is null or v_org is null or not private.has_permission('invoices.post',v_org) then raise exception 'دسترسی ثبت نهایی فاکتور مجاز نیست.'; end if;
 select status into v_status from public.invoices where id=p_invoice_id and organization_id=v_org for update;
 if v_status is null then raise exception 'فاکتور مورد نظر یافت نشد.'; end if;
 if v_status<>'DRAFT' then raise exception 'فقط فاکتور DRAFT قابل ثبت نهایی است.'; end if;
 perform public._apply_invoice_stock(p_invoice_id,-1,'SALE');
 update public.invoices set status='POSTED' where id=p_invoice_id and organization_id=v_org;
 perform public._post_sale_journal(p_invoice_id,false);
 return p_invoice_id;
end; $$;

create or replace function public.void_invoice(p_invoice_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.current_user_organization_id(); v_status text;
begin
 if auth.uid() is null or v_org is null or not private.has_permission('invoices.void',v_org) then raise exception 'دسترسی ابطال فاکتور مجاز نیست.'; end if;
 select status into v_status from public.invoices where id=p_invoice_id and organization_id=v_org for update;
 if v_status is null then raise exception 'فاکتور مورد نظر یافت نشد.'; end if;
 if v_status='VOIDED' then return p_invoice_id; end if;
 if v_status='POSTED' then perform public._apply_invoice_stock(p_invoice_id,1,'RETURN'); perform public._post_sale_journal(p_invoice_id,true); end if;
 update public.invoices set status='VOIDED' where id=p_invoice_id and organization_id=v_org;
 return p_invoice_id;
end; $$;

create or replace function public._assert_journal_entry_balanced()
returns trigger language plpgsql set search_path='' as $$
declare v_entry uuid:=coalesce(new.journal_entry_id,old.journal_entry_id); v_org uuid:=coalesce(new.organization_id,old.organization_id); v_debit numeric; v_credit numeric;
begin
 select coalesce(sum(debit),0),coalesce(sum(credit),0) into v_debit,v_credit from public.journal_lines where journal_entry_id=v_entry and organization_id=v_org;
 if exists(select 1 from public.journal_entries where id=v_entry and status='POSTED') and v_debit<>v_credit then raise exception 'Journal entry is not balanced: debit=% credit=%',v_debit,v_credit; end if;
 return null;
end; $$;
drop trigger if exists trg_assert_journal_entry_balanced on public.journal_lines;
create constraint trigger trg_assert_journal_entry_balanced after insert or update or delete on public.journal_lines deferrable initially deferred for each row execute function public._assert_journal_entry_balanced();

create or replace function public.financial_reconciliation()
returns jsonb language plpgsql security invoker set search_path='public','private' as $$
declare v_org uuid:=private.current_user_organization_id(); v_debit numeric; v_credit numeric; v_bad_journals bigint; v_bad_invoices bigint; v_bad_stock bigint; v_negative_stock bigint;
begin
 if v_org is null then raise exception 'سازمان فعال یافت نشد.'; end if;
 select coalesce(sum(l.debit),0),coalesce(sum(l.credit),0) into v_debit,v_credit from public.journal_entries e join public.journal_lines l on l.journal_entry_id=e.id and l.organization_id=v_org where e.organization_id=v_org and e.status='POSTED';
 select count(*) into v_bad_journals from (select e.id from public.journal_entries e join public.journal_lines l on l.journal_entry_id=e.id and l.organization_id=v_org where e.organization_id=v_org and e.status='POSTED' group by e.id having sum(l.debit)<>sum(l.credit))x;
 select count(*) into v_bad_invoices from (select i.id from public.invoices i left join public.payments p on p.invoice_id=i.id and p.organization_id=v_org where i.organization_id=v_org and i.status='POSTED' group by i.id,i.total_amount,i.payment_status having i.payment_status='PAID' and i.total_amount<>coalesce(sum(case when p.direction='RECEIPT' and p.transaction_kind='POSTED' then p.amount when p.direction='RECEIPT' and p.transaction_kind='REVERSAL' then -p.amount when p.direction='PAYMENT' and p.transaction_kind='POSTED' then -p.amount when p.direction='PAYMENT' and p.transaction_kind='REVERSAL' then p.amount else 0 end),0))x;
 select count(*) into v_bad_stock from (select ws.warehouse_id,ws.product_id from public.warehouse_stock ws left join public.stock_movements sm on sm.organization_id=v_org and sm.warehouse_id=ws.warehouse_id and sm.product_id=ws.product_id where ws.organization_id=v_org group by ws.warehouse_id,ws.product_id,ws.quantity having ws.quantity<>coalesce(sum(sm.change_qty),0))x;
 select count(*) into v_negative_stock from public.warehouse_stock where organization_id=v_org and quantity<0;
 return jsonb_build_object('organization_id',v_org,'journal',jsonb_build_object('total_debit',v_debit,'total_credit',v_credit,'balanced',v_debit=v_credit,'unbalanced_entries',v_bad_journals),'invoice_payments',jsonb_build_object('invalid_posted_invoices',v_bad_invoices),'inventory',jsonb_build_object('stock_vs_movements_mismatches',v_bad_stock,'negative_stock_rows',v_negative_stock),'generated_at',now());
end; $$;
revoke execute on function public._post_sale_journal(uuid,boolean) from public,anon,authenticated;
revoke execute on function public._post_payment_journal(uuid) from public,anon,authenticated;
grant execute on function public.financial_reconciliation() to authenticated;
