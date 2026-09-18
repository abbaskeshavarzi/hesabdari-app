-- Stage 8 pagination helpers for cash flow and inventory reports
create or replace function public.get_cash_flow_transactions(p_from date,p_to date,p_page integer default 1,p_page_size integer default 25)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare v_org uuid:=private.current_user_organization_id(); v_page integer:=greatest(coalesce(p_page,1),1); v_size integer:=least(greatest(coalesce(p_page_size,25),1),100); v_offset integer:=(v_page-1)*v_size; v_count bigint;
begin
 if v_org is null then raise exception 'حساب سازمانی فعال یافت نشد.'; end if;
 select count(*) into v_count from (select p.id from payments p where p.organization_id=v_org and p.payment_date between p_from and p_to union all select e.id from expenses e where e.organization_id=v_org and e.status='POSTED' and e.transaction_kind='POSTED' and e.expense_date between p_from and p_to) q;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(x) from (select * from (
 select p.id,'دریافت' kind,p.payment_date flow_date,p.amount,p.payment_method,p.tracking_number,c.name party_name from payments p left join customers c on c.id=p.customer_id and c.organization_id=v_org where p.organization_id=v_org and p.payment_date between p_from and p_to
 union all select p.id,'پرداخت',p.payment_date,p.amount,p.payment_method,p.tracking_number,s.name from payments p left join suppliers s on s.id=p.supplier_id and s.organization_id=v_org where p.organization_id=v_org and p.payment_date between p_from and p_to
 union all select e.id,'هزینه',e.expense_date,e.amount,null,null,e.category from expenses e where e.organization_id=v_org and e.status='POSTED' and e.transaction_kind='POSTED' and e.expense_date between p_from and p_to
 ) q order by flow_date desc offset v_offset limit v_size) x),'[]'::jsonb),'count',v_count,'page',v_page,'page_size',v_size);
end; $$;
revoke all on function public.get_cash_flow_transactions(date,date,integer,integer) from public;
grant execute on function public.get_cash_flow_transactions(date,date,integer,integer) to authenticated;

create or replace function public.get_inventory_report_page(p_page integer default 1,p_page_size integer default 25)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare v_org uuid:=private.current_user_organization_id(); v_page integer:=greatest(coalesce(p_page,1),1); v_size integer:=least(greatest(coalesce(p_page_size,25),1),100); v_offset integer:=(v_page-1)*v_size; v_count bigint;
begin
 if v_org is null then raise exception 'حساب سازمانی فعال یافت نشد.'; end if;
 select count(*) into v_count from products where organization_id=v_org;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(x) from (select p.id product_id,p.name,p.unit,p.min_stock,coalesce(sum(ws.quantity),0) quantity,coalesce(sum(ws.quantity),0)<p.min_stock low_stock from products p left join warehouse_stock ws on ws.product_id=p.id and ws.organization_id=v_org where p.organization_id=v_org group by p.id,p.name,p.unit,p.min_stock order by p.name offset v_offset limit v_size) x),'[]'::jsonb),'count',v_count,'page',v_page,'page_size',v_size);
end; $$;
revoke all on function public.get_inventory_report_page(integer,integer) from public;
grant execute on function public.get_inventory_report_page(integer,integer) to authenticated;