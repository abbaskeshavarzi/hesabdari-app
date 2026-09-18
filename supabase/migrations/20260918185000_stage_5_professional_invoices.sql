-- Stage 5: Professional invoices
-- DRAFT -> POSTED -> VOIDED. Only database RPCs may mutate invoice financial/inventory state.

alter table public.business_settings add column if not exists tax_enabled boolean not null default false;
alter table public.business_settings add column if not exists tax_rate numeric not null default 0;
alter table public.business_settings drop constraint if exists business_settings_tax_rate_check;
alter table public.business_settings add constraint business_settings_tax_rate_check check (tax_rate between 0 and 100);

alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists subtotal_amount numeric not null default 0;
alter table public.invoices add column if not exists tax_rate numeric not null default 0;
alter table public.invoices add column if not exists tax_amount numeric not null default 0;
alter table public.invoices add column if not exists shipping_amount numeric not null default 0;
alter table public.invoices add column if not exists payment_status text not null default 'UNPAID';

alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices drop constraint if exists invoices_payment_status_check;
alter table public.invoices drop constraint if exists invoices_amounts_nonnegative_check;

update public.invoices set payment_status=case status when 'پرداخت‌شده' then 'PAID' when 'نیمه‌پرداخت' then 'PARTIALLY_PAID' else 'UNPAID' end where status in ('معوق','نیمه‌پرداخت','پرداخت‌شده');
update public.invoices set status='POSTED' where status in ('معوق','نیمه‌پرداخت','پرداخت‌شده');
update public.invoices set due_date=coalesce(due_date,issue_date),subtotal_amount=case when subtotal_amount=0 then total_amount+coalesce(discount_amount,0) else subtotal_amount end,tax_rate=coalesce(tax_rate,0),tax_amount=coalesce(tax_amount,0),shipping_amount=coalesce(shipping_amount,0),payment_status=coalesce(payment_status,'UNPAID');

alter table public.invoices alter column due_date set default current_date;
alter table public.invoices alter column due_date set not null;
alter table public.invoices add constraint invoices_status_check check(status in ('DRAFT','POSTED','VOIDED'));
alter table public.invoices add constraint invoices_payment_status_check check(payment_status in ('UNPAID','PARTIALLY_PAID','PAID'));
alter table public.invoices add constraint invoices_amounts_nonnegative_check check(subtotal_amount>=0 and discount_value>=0 and discount_amount>=0 and tax_rate between 0 and 100 and tax_amount>=0 and shipping_amount>=0 and total_amount>=0);

alter table public.invoice_items drop constraint if exists invoice_items_quantity_positive_check;
alter table public.invoice_items add constraint invoice_items_quantity_positive_check check(quantity>0);
alter table public.invoice_items drop constraint if exists invoice_items_unit_price_nonnegative_check;
alter table public.invoice_items add constraint invoice_items_unit_price_nonnegative_check check(unit_price>=0);

create unique index if not exists invoices_org_invoice_number_uidx on public.invoices(organization_id,invoice_number) where invoice_number is not null and btrim(invoice_number)<>'';
create index if not exists invoices_org_status_date_idx on public.invoices(organization_id,status,issue_date desc);
create index if not exists invoices_org_customer_date_idx on public.invoices(organization_id,customer_id,issue_date desc);

revoke insert,update,delete on public.invoices from authenticated;
revoke insert,update,delete on public.invoice_items from authenticated;
grant select on public.invoices to authenticated;
grant select on public.invoice_items to authenticated;

create or replace function public._invoice_change_stock(p_organization_id uuid,p_invoice_id uuid,p_warehouse_id uuid,p_product_id uuid,p_delta numeric,p_movement_type text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_qty numeric; v_name text;
begin
 select p.name into v_name from public.products p where p.id=p_product_id and p.organization_id=p_organization_id and p.is_active=true;
 if v_name is null then raise exception 'کالای مورد نظر یافت نشد یا غیرفعال است.'; end if;
 insert into public.warehouse_stock(organization_id,warehouse_id,product_id,quantity) values(p_organization_id,p_warehouse_id,p_product_id,0) on conflict(warehouse_id,product_id) do nothing;
 select ws.quantity into v_qty from public.warehouse_stock ws where ws.organization_id=p_organization_id and ws.warehouse_id=p_warehouse_id and ws.product_id=p_product_id for update;
 if v_qty+p_delta<0 then raise exception 'موجودی «%» کافی نیست (موجودی فعلی: %).',v_name,v_qty; end if;
 update public.warehouse_stock set quantity=v_qty+p_delta,updated_at=now() where organization_id=p_organization_id and warehouse_id=p_warehouse_id and product_id=p_product_id;
 insert into public.stock_movements(organization_id,warehouse_id,product_id,change_qty,quantity,movement_type,reason,reference_type,reference_id,created_by) values(p_organization_id,p_warehouse_id,p_product_id,p_delta,abs(p_delta),p_movement_type,p_reason,'invoice',p_invoice_id,auth.uid());
end; $$;

create or replace function public._apply_invoice_stock(p_invoice_id uuid,p_delta_sign numeric,p_movement_type text)
returns void language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_wh uuid; v_no text; item record;
begin
 select i.organization_id,i.invoice_number into v_org,v_no from public.invoices i where i.id=p_invoice_id and i.organization_id=(select private.current_user_organization_id()) for update;
 if v_org is null then raise exception 'فاکتور مورد نظر یافت نشد.'; end if;
 select w.id into v_wh from public.warehouses w where w.organization_id=v_org and w.is_active=true and w.code='MAIN' order by w.created_at limit 1;
 if v_wh is null then select w.id into v_wh from public.warehouses w where w.organization_id=v_org and w.is_active=true order by w.created_at limit 1; end if;
 if v_wh is null then raise exception 'انبار فعالی برای ثبت عملیات فاکتور وجود ندارد.'; end if;
 for item in select ii.product_id,ii.quantity from public.invoice_items ii where ii.invoice_id=p_invoice_id and ii.organization_id=v_org and ii.product_id is not null order by ii.product_id loop
  perform public._invoice_change_stock(v_org,p_invoice_id,v_wh,item.product_id,item.quantity*p_delta_sign,p_movement_type,case when p_delta_sign<0 then 'فروش در فاکتور ' else 'برگشت موجودی فاکتور ' end||coalesce(v_no,''));
 end loop;
end; $$;

drop function if exists public.create_invoice_with_items(uuid,text,date,text,text,jsonb);
drop function if exists public.create_invoice_with_items(uuid,text,date,text,text,jsonb,text,numeric);
drop function if exists public.create_invoice_with_items(uuid,text,date,date,text,text,jsonb,text,numeric,numeric,numeric);
create or replace function public.create_invoice_with_items(p_customer_id uuid,p_invoice_number text,p_issue_date date,p_due_date date,p_description text,p_status text,p_items jsonb,p_discount_type text default 'amount',p_discount_value numeric default 0,p_tax_rate numeric default null,p_shipping_amount numeric default 0)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=(select private.current_user_organization_id()); v_invoice uuid; v_subtotal numeric:=0; v_discount numeric:=0; v_tax_rate numeric:=0; v_tax numeric:=0; v_shipping numeric:=greatest(0,coalesce(p_shipping_amount,0)); v_total numeric:=0; v_status text:=coalesce(nullif(p_status,''),'DRAFT'); v_number text:=nullif(btrim(p_invoice_number),''); v_tax_enabled boolean:=false; v_default_tax numeric:=0; item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_name text;
begin
 if (select auth.uid()) is null then raise exception 'کاربر وارد نشده است.'; end if;
 if v_org is null then raise exception 'سازمان فعال یافت نشد.'; end if;
 if p_customer_id is null then raise exception 'انتخاب مشتری الزامی است.'; end if;
 if p_issue_date is null then raise exception 'تاریخ صدور الزامی است.'; end if;
 if p_due_date is null then p_due_date:=p_issue_date; end if;
 if p_due_date<p_issue_date then raise exception 'تاریخ سررسید نمی‌تواند قبل از تاریخ صدور باشد.'; end if;
 if v_status not in ('DRAFT','POSTED') then raise exception 'وضعیت اولیه فاکتور فقط DRAFT یا POSTED است.'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'حداقل یک قلم کالا لازم است.'; end if;
 if p_discount_type not in ('amount','percent') then raise exception 'نوع تخفیف نامعتبر است.'; end if;
 if coalesce(p_discount_value,0)<0 then raise exception 'مبلغ تخفیف نمی‌تواند منفی باشد.'; end if;
 if not exists(select 1 from public.customers c where c.id=p_customer_id and c.organization_id=v_org) then raise exception 'مشتری مورد نظر یافت نشد.'; end if;
 select coalesce(bs.tax_enabled,false),greatest(0,least(100,coalesce(bs.tax_rate,0))) into v_tax_enabled,v_default_tax from public.business_settings bs where bs.organization_id=v_org and bs.id='default';
 v_tax_rate:=case when v_tax_enabled then greatest(0,least(100,coalesce(p_tax_rate,v_default_tax))) else 0 end;
 select coalesce(sum((i->>'quantity')::numeric*coalesce((i->>'unit_price')::numeric,0)),0) into v_subtotal from jsonb_array_elements(p_items)i;
 if p_discount_type='percent' then v_discount:=v_subtotal*coalesce(p_discount_value,0)/100; else v_discount:=coalesce(p_discount_value,0); end if;
 v_discount:=greatest(0,least(v_discount,v_subtotal)); v_tax:=greatest(0,(v_subtotal-v_discount)*v_tax_rate/100); v_total:=v_subtotal-v_discount+v_tax+v_shipping;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 if v_number is null then select (coalesce(max(nullif(regexp_replace(i.invoice_number,'[^0-9]','','g'),'')::bigint),1000)+1)::text into v_number from public.invoices i where i.organization_id=v_org; end if;
 insert into public.invoices(organization_id,customer_id,invoice_number,issue_date,due_date,subtotal_amount,total_amount,description,status,discount_type,discount_value,discount_amount,tax_rate,tax_amount,shipping_amount,payment_status) values(v_org,p_customer_id,v_number,p_issue_date,p_due_date,v_subtotal,v_total,p_description,v_status,p_discount_type,coalesce(p_discount_value,0),v_discount,v_tax_rate,v_tax,v_shipping,'UNPAID') returning id into v_invoice;
 for item in select * from jsonb_array_elements(p_items) loop
  v_pid:=nullif(item->>'product_id','')::uuid; v_qty:=coalesce((item->>'quantity')::numeric,0); v_price:=coalesce((item->>'unit_price')::numeric,0); v_name:=btrim(coalesce(item->>'product_name',''));
  if v_name='' then raise exception 'شرح کالا الزامی است.'; end if;
  if v_qty<=0 then raise exception 'مقدار کالای «%» نامعتبر است.',v_name; end if;
  if v_price<0 then raise exception 'قیمت کالای «%» نمی‌تواند منفی باشد.',v_name; end if;
  if v_pid is not null and not exists(select 1 from public.products p where p.id=v_pid and p.organization_id=v_org and p.is_active=true) then raise exception 'کالای «%» یافت نشد یا غیرفعال است.',v_name; end if;
  insert into public.invoice_items(organization_id,invoice_id,product_id,product_name,quantity,unit_price) values(v_org,v_invoice,v_pid,v_name,v_qty,v_price);
 end loop;
 if v_status='POSTED' then perform public._apply_invoice_stock(v_invoice,-1,'SALE'); end if;
 return v_invoice;
end; $$;

create or replace function public.update_draft_invoice_with_items(p_invoice_id uuid,p_customer_id uuid,p_invoice_number text,p_issue_date date,p_due_date date,p_description text,p_items jsonb,p_discount_type text default 'amount',p_discount_value numeric default 0,p_tax_rate numeric default null,p_shipping_amount numeric default 0)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=(select private.current_user_organization_id()); v_status text; v_tax_enabled boolean:=false; v_default_tax numeric:=0; v_subtotal numeric:=0; v_discount numeric:=0; v_tax_rate numeric:=0; v_tax numeric:=0; v_shipping numeric:=greatest(0,coalesce(p_shipping_amount,0)); v_total numeric:=0; v_number text:=nullif(btrim(p_invoice_number),''); item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_name text;
begin
 if (select auth.uid()) is null then raise exception 'کاربر وارد نشده است.'; end if;
 select i.status into v_status from public.invoices i where i.id=p_invoice_id and i.organization_id=v_org for update;
 if v_status is null then raise exception 'فاکتور مورد نظر یافت نشد.'; end if;
 if v_status<>'DRAFT' then raise exception 'فقط فاکتور پیش‌نویس قابل ویرایش است.'; end if;
 if p_due_date is null then p_due_date:=p_issue_date; end if;
 if p_due_date<p_issue_date then raise exception 'تاریخ سررسید نمی‌تواند قبل از تاریخ صدور باشد.'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'حداقل یک قلم کالا لازم است.'; end if;
 if p_discount_type not in ('amount','percent') then raise exception 'نوع تخفیف نامعتبر است.'; end if;
 if coalesce(p_discount_value,0)<0 then raise exception 'مبلغ تخفیف نمی‌تواند منفی باشد.'; end if;
 if not exists(select 1 from public.customers c where c.id=p_customer_id and c.organization_id=v_org) then raise exception 'مشتری مورد نظر یافت نشد.'; end if;
 select coalesce(bs.tax_enabled,false),greatest(0,least(100,coalesce(bs.tax_rate,0))) into v_tax_enabled,v_default_tax from public.business_settings bs where bs.organization_id=v_org and bs.id='default';
 v_tax_rate:=case when v_tax_enabled then greatest(0,least(100,coalesce(p_tax_rate,v_default_tax))) else 0 end;
 select coalesce(sum((i->>'quantity')::numeric*coalesce((i->>'unit_price')::numeric,0)),0) into v_subtotal from jsonb_array_elements(p_items)i;
 if p_discount_type='percent' then v_discount:=v_subtotal*coalesce(p_discount_value,0)/100; else v_discount:=coalesce(p_discount_value,0); end if;
 v_discount:=greatest(0,least(v_discount,v_subtotal)); v_tax:=greatest(0,(v_subtotal-v_discount)*v_tax_rate/100); v_total:=v_subtotal-v_discount+v_tax+v_shipping;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 if v_number is null then select (coalesce(max(nullif(regexp_replace(i.invoice_number,'[^0-9]','','g'),'')::bigint),1000)+1)::text into v_number from public.invoices i where i.organization_id=v_org and i.id<>p_invoice_id; end if;
 delete from public.invoice_items where invoice_id=p_invoice_id and organization_id=v_org;
 for item in select * from jsonb_array_elements(p_items) loop
  v_pid:=nullif(item->>'product_id','')::uuid; v_qty:=coalesce((item->>'quantity')::numeric,0); v_price:=coalesce((item->>'unit_price')::numeric,0); v_name:=btrim(coalesce(item->>'product_name',''));
  if v_name='' or v_qty<=0 or v_price<0 then raise exception 'یکی از اقلام فاکتور نامعتبر است.'; end if;
  if v_pid is not null and not exists(select 1 from public.products p where p.id=v_pid and p.organization_id=v_org and p.is_active=true) then raise exception 'کالای «%» یافت نشد یا غیرفعال است.',v_name; end if;
  insert into public.invoice_items(organization_id,invoice_id,product_id,product_name,quantity,unit_price) values(v_org,p_invoice_id,v_pid,v_name,v_qty,v_price);
 end loop;
 update public.invoices set customer_id=p_customer_id,invoice_number=v_number,issue_date=p_issue_date,due_date=p_due_date,subtotal_amount=v_subtotal,total_amount=v_total,description=p_description,discount_type=p_discount_type,discount_value=coalesce(p_discount_value,0),discount_amount=v_discount,tax_rate=v_tax_rate,tax_amount=v_tax,shipping_amount=v_shipping where id=p_invoice_id and organization_id=v_org;
 return p_invoice_id;
end; $$;

create or replace function public.post_invoice(p_invoice_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=(select private.current_user_organization_id()); v_status text;
begin
 if (select auth.uid()) is null then raise exception 'کاربر وارد نشده است.'; end if;
 select i.status into v_status from public.invoices i where i.id=p_invoice_id and i.organization_id=v_org for update;
 if v_status is null then raise exception 'فاکتور مورد نظر یافت نشد.'; end if;
 if v_status<>'DRAFT' then raise exception 'فقط فاکتور DRAFT قابل ثبت نهایی است.'; end if;
 perform public._apply_invoice_stock(p_invoice_id,-1,'SALE');
 update public.invoices set status='POSTED' where id=p_invoice_id and organization_id=v_org;
 return p_invoice_id;
end; $$;

create or replace function public.void_invoice(p_invoice_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=(select private.current_user_organization_id()); v_status text;
begin
 if (select auth.uid()) is null then raise exception 'کاربر وارد نشده است.'; end if;
 select i.status into v_status from public.invoices i where i.id=p_invoice_id and i.organization_id=v_org for update;
 if v_status is null then raise exception 'فاکتور مورد نظر یافت نشد.'; end if;
 if v_status='VOIDED' then return p_invoice_id; end if;
 if v_status='POSTED' then perform public._apply_invoice_stock(p_invoice_id,1,'RETURN'); end if;
 update public.invoices set status='VOIDED' where id=p_invoice_id and organization_id=v_org;
 return p_invoice_id;
end; $$;

create or replace function public.delete_invoice(p_invoice_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_org uuid:=(select private.current_user_organization_id()); v_status text;
begin
 if (select auth.uid()) is null then raise exception 'کاربر وارد نشده است.'; end if;
 select i.status into v_status from public.invoices i where i.id=p_invoice_id and i.organization_id=v_org for update;
 if v_status is null then raise exception 'فاکتور مورد نظر یافت نشد.'; end if;
 if v_status<>'DRAFT' then raise exception 'فاکتور ثبت‌شده یا باطل‌شده قابل حذف نیست؛ برای حذف اثر مالی از ابطال استفاده کنید.'; end if;
 delete from public.invoices where id=p_invoice_id and organization_id=v_org;
end; $$;

create or replace function public.delete_invoice_and_restore_stock(p_invoice_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform public.delete_invoice(p_invoice_id); end; $$;

drop view if exists public.customer_balances;
create view public.customer_balances with(security_invoker=true) as
select c.id customer_id,c.organization_id,c.name,c.phone,c.mobile,c.address,c.economic_code,c.customer_code,c.notes,c.created_at,c.updated_at,
coalesce(inv.total_invoiced,0::numeric)-coalesce(pay.total_paid,0::numeric) balance
from public.customers c
left join (select organization_id,customer_id,sum(total_amount) total_invoiced from public.invoices where status='POSTED' and customer_id is not null group by organization_id,customer_id) inv on inv.organization_id=c.organization_id and inv.customer_id=c.id
left join (select organization_id,customer_id,sum(amount) total_paid from public.payments where customer_id is not null group by organization_id,customer_id) pay on pay.organization_id=c.organization_id and pay.customer_id=c.id;

grant select on public.customer_balances to authenticated;
create or replace view public.customer_transactions with(security_invoker=true) as
select i.organization_id,i.customer_id,i.id transaction_id,i.issue_date transaction_date,'invoice'::text transaction_type,coalesce(i.invoice_number,'') reference,i.total_amount amount,i.description note
from public.invoices i where i.customer_id is not null and i.status='POSTED'
union all
select p.organization_id,p.customer_id,p.id transaction_id,p.payment_date transaction_date,'payment'::text transaction_type,''::text reference,p.amount amount,p.note
from public.payments p where p.customer_id is not null;
grant select on public.customer_transactions to authenticated;

revoke all on function public._invoice_change_stock(uuid,uuid,uuid,uuid,numeric,text,text) from public,anon,authenticated;
revoke all on function public._apply_invoice_stock(uuid,numeric,text) from public,anon,authenticated;
revoke all on function public.create_invoice_with_items(uuid,text,date,date,text,text,jsonb,text,numeric,numeric,numeric) from public,anon;
revoke all on function public.update_draft_invoice_with_items(uuid,uuid,text,date,date,text,jsonb,text,numeric,numeric,numeric) from public,anon;
revoke all on function public.post_invoice(uuid) from public,anon;
revoke all on function public.void_invoice(uuid) from public,anon;
revoke all on function public.delete_invoice(uuid) from public,anon;
revoke all on function public.delete_invoice_and_restore_stock(uuid) from public,anon;
grant execute on function public.create_invoice_with_items(uuid,text,date,date,text,text,jsonb,text,numeric,numeric,numeric) to authenticated;
grant execute on function public.update_draft_invoice_with_items(uuid,uuid,text,date,date,text,jsonb,text,numeric,numeric,numeric) to authenticated;
grant execute on function public.post_invoice(uuid) to authenticated;
grant execute on function public.void_invoice(uuid) to authenticated;
grant execute on function public.delete_invoice(uuid) to authenticated;
grant execute on function public.delete_invoice_and_restore_stock(uuid) to authenticated;
