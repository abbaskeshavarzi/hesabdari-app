-- Priority 2 — Full production security audit hardening
-- Revoke anonymous Data API access, make sensitive writes RPC-only,
-- and enforce organization/role permissions inside exposed RPCs.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

revoke all on table public.account_balances, public.customer_balances,
  public.customer_transactions, public.financial_account_balances,
  public.general_ledger, public.supplier_balances from anon;
grant select on table public.account_balances, public.customer_balances,
  public.customer_transactions, public.financial_account_balances,
  public.general_ledger, public.supplier_balances to authenticated;

revoke insert, update, delete, truncate on table
  public.invoices, public.invoice_items, public.payments, public.expenses,
  public.stock_movements, public.warehouse_stock,
  public.journal_entries, public.journal_lines
from authenticated;

grant select on table
  public.invoices, public.invoice_items, public.payments, public.expenses,
  public.stock_movements, public.warehouse_stock,
  public.journal_entries, public.journal_lines
to authenticated;

revoke execute on function public.create_invoice_with_items(uuid,text,date,date,text,text,jsonb,text,numeric,numeric,numeric) from public, anon;
revoke execute on function public.update_draft_invoice_with_items(uuid,uuid,text,date,date,text,jsonb,text,numeric,numeric,numeric) from public, anon;
revoke execute on function public.post_invoice(uuid) from public, anon;
revoke execute on function public.void_invoice(uuid) from public, anon;
revoke execute on function public.delete_invoice(uuid) from public, anon;
revoke execute on function public.delete_invoice_and_restore_stock(uuid) from public, anon;
revoke execute on function public.create_payment(text,uuid,uuid,uuid,uuid,numeric,date,text,text,text) from public, anon;
revoke execute on function public.reverse_payment(uuid,text) from public, anon;
revoke execute on function public.stock_receive(uuid,uuid,numeric,text) from public, anon;
revoke execute on function public.stock_issue(uuid,uuid,numeric,text) from public, anon;
revoke execute on function public.stock_adjust(uuid,uuid,numeric,text) from public, anon;
revoke execute on function public.stock_transfer(uuid,uuid,uuid,numeric,text) from public, anon;
revoke execute on function public.post_expense(text,numeric,date,uuid,uuid,text) from public, anon;
revoke execute on function public.post_journal_entry(date,text,jsonb) from public, anon;
revoke execute on function public.get_reports_data(date,date,integer,integer) from public, anon;
revoke execute on function public.get_cash_flow_transactions(date,date,integer,integer) from public, anon;
revoke execute on function public.get_inventory_report_page(integer,integer) from public, anon;

grant execute on function public.create_invoice_with_items(uuid,text,date,date,text,text,jsonb,text,numeric,numeric,numeric) to authenticated;
grant execute on function public.update_draft_invoice_with_items(uuid,uuid,text,date,date,text,jsonb,text,numeric,numeric,numeric) to authenticated;
grant execute on function public.post_invoice(uuid) to authenticated;
grant execute on function public.void_invoice(uuid) to authenticated;
grant execute on function public.delete_invoice(uuid) to authenticated;
grant execute on function public.delete_invoice_and_restore_stock(uuid) to authenticated;
grant execute on function public.create_payment(text,uuid,uuid,uuid,uuid,numeric,date,text,text,text) to authenticated;
grant execute on function public.reverse_payment(uuid,text) to authenticated;
grant execute on function public.stock_receive(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.stock_issue(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.stock_adjust(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.stock_transfer(uuid,uuid,uuid,numeric,text) to authenticated;
grant execute on function public.post_expense(text,numeric,date,uuid,uuid,text) to authenticated;
grant execute on function public.post_journal_entry(date,text,jsonb) to authenticated;
grant execute on function public.get_reports_data(date,date,integer,integer) to authenticated;
grant execute on function public.get_cash_flow_transactions(date,date,integer,integer) to authenticated;
grant execute on function public.get_inventory_report_page(integer,integer) to authenticated;

create or replace function public.create_invoice_with_items(
  p_customer_id uuid, p_invoice_number text, p_issue_date date, p_due_date date,
  p_description text, p_status text, p_items jsonb,
  p_discount_type text default 'amount', p_discount_value numeric default 0,
  p_tax_rate numeric default null, p_shipping_amount numeric default 0
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_org uuid := (select private.current_user_organization_id());
  v_invoice uuid; v_subtotal numeric := 0; v_discount numeric := 0;
  v_tax_rate numeric := 0; v_tax numeric := 0; v_shipping numeric := greatest(0,coalesce(p_shipping_amount,0));
  v_total numeric := 0; v_status text := coalesce(nullif(p_status,''),'DRAFT'); v_number text := nullif(btrim(p_invoice_number),'');
  v_tax_enabled boolean := false; v_default_tax numeric := 0; item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_name text;
begin
  if (select auth.uid()) is null then raise exception 'کاربر وارد نشده است.'; end if;
  if v_org is null then raise exception 'سازمان فعال یافت نشد.'; end if;
  if not private.has_permission('invoices.create',v_org) then raise exception 'دسترسی ایجاد فاکتور مجاز نیست.'; end if;
  if v_status='POSTED' and not private.has_permission('invoices.post',v_org) then raise exception 'دسترسی ثبت نهایی فاکتور مجاز نیست.'; end if;
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
  insert into public.invoices(organization_id,customer_id,invoice_number,issue_date,due_date,subtotal_amount,total_amount,description,status,discount_type,discount_value,discount_amount,tax_rate,tax_amount,shipping_amount,payment_status)
  values(v_org,p_customer_id,v_number,p_issue_date,p_due_date,v_subtotal,v_total,p_description,v_status,p_discount_type,coalesce(p_discount_value,0),v_discount,v_tax_rate,v_tax,v_shipping,'UNPAID') returning id into v_invoice;
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

create or replace function public.update_draft_invoice_with_items(
  p_invoice_id uuid, p_customer_id uuid, p_invoice_number text, p_issue_date date, p_due_date date,
  p_description text, p_items jsonb, p_discount_type text default 'amount', p_discount_value numeric default 0,
  p_tax_rate numeric default null, p_shipping_amount numeric default 0
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_org uuid := (select private.current_user_organization_id()); v_status text;
  v_tax_enabled boolean:=false; v_default_tax numeric:=0; v_subtotal numeric:=0; v_discount numeric:=0; v_tax_rate numeric:=0; v_tax numeric:=0;
  v_shipping numeric:=greatest(0,coalesce(p_shipping_amount,0)); v_total numeric:=0; v_number text:=nullif(btrim(p_invoice_number),''); item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_name text;
begin
  if (select auth.uid()) is null then raise exception 'کاربر وارد نشده است.'; end if;
  if v_org is null or not private.has_permission('invoices.update',v_org) then raise exception 'دسترسی ویرایش فاکتور مجاز نیست.'; end if;
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
 if (select auth.uid()) is null or v_org is null or not private.has_permission('invoices.post',v_org) then raise exception 'دسترسی ثبت نهایی فاکتور مجاز نیست.'; end if;
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
 if (select auth.uid()) is null or v_org is null or not private.has_permission('invoices.void',v_org) then raise exception 'دسترسی ابطال فاکتور مجاز نیست.'; end if;
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
 if (select auth.uid()) is null or v_org is null or not private.has_permission('invoices.delete',v_org) then raise exception 'دسترسی حذف فاکتور مجاز نیست.'; end if;
 select i.status into v_status from public.invoices i where i.id=p_invoice_id and i.organization_id=v_org for update;
 if v_status is null then raise exception 'فاکتور مورد نظر یافت نشد.'; end if;
 if v_status<>'DRAFT' then raise exception 'فاکتور ثبت‌شده یا باطل‌شده قابل حذف نیست؛ برای حذف اثر مالی از ابطال استفاده کنید.'; end if;
 delete from public.invoices where id=p_invoice_id and organization_id=v_org;
end; $$;

create or replace function public.create_payment(p_direction text,p_customer_id uuid,p_supplier_id uuid,p_invoice_id uuid,p_financial_account_id uuid,p_amount numeric,p_payment_date date,p_payment_method text,p_tracking_number text,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.current_user_organization_id(); v_id uuid; v_invoice_customer uuid; v_invoice_total numeric; v_paid numeric;
begin
 if v_org is null or not private.has_permission('payments.create',v_org) then raise exception 'دسترسی ثبت دریافت/پرداخت مجاز نیست.'; end if;
 if p_direction not in ('RECEIPT','PAYMENT') then raise exception 'نوع تراکنش مالی نامعتبر است.'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'مبلغ تراکنش باید بیشتر از صفر باشد.'; end if;
 if p_payment_method not in ('CASH','CARD','BANK_TRANSFER','CHECK','OTHER') then raise exception 'روش پرداخت نامعتبر است.'; end if;
 perform 1 from public.financial_accounts where id=p_financial_account_id and organization_id=v_org and is_active=true for update;
 if not found then raise exception 'حساب مالی انتخاب‌شده معتبر یا فعال نیست.'; end if;
 if p_direction='RECEIPT' then
   if p_customer_id is null or p_supplier_id is not null then raise exception 'دریافت باید به یک مشتری متصل باشد.'; end if;
 else
   if p_supplier_id is null or p_customer_id is not null then raise exception 'پرداخت باید به یک تأمین‌کننده متصل باشد.'; end if;
   if p_invoice_id is not null then raise exception 'پرداخت تأمین‌کننده فعلاً به فاکتور خرید متصل نمی‌شود.'; end if;
 end if;
 if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id and organization_id=v_org) then raise exception 'مشتری انتخاب‌شده معتبر نیست.'; end if;
 if p_supplier_id is not null and not exists(select 1 from public.suppliers where id=p_supplier_id and organization_id=v_org) then raise exception 'تأمین‌کننده انتخاب‌شده معتبر نیست.'; end if;
 if p_invoice_id is not null then
   select customer_id,total_amount into v_invoice_customer,v_invoice_total from public.invoices where id=p_invoice_id and organization_id=v_org and status='POSTED' for update;
   if not found or v_invoice_customer is distinct from p_customer_id then raise exception 'فاکتور یا مشتری پرداخت معتبر نیست.'; end if;
   select coalesce(sum(case when direction='RECEIPT' and transaction_kind='POSTED' then amount when direction='PAYMENT' and transaction_kind='REVERSAL' then amount when direction='PAYMENT' and transaction_kind='POSTED' then -amount when direction='RECEIPT' and transaction_kind='REVERSAL' then -amount else 0 end),0) into v_paid from public.payments where organization_id=v_org and invoice_id=p_invoice_id;
   if p_amount>greatest(v_invoice_total-v_paid,0) then raise exception 'مبلغ دریافت از مانده فاکتور بیشتر است.'; end if;
 end if;
 insert into public.payments(organization_id,direction,transaction_kind,customer_id,supplier_id,financial_account_id,invoice_id,amount,payment_date,payment_method,tracking_number,note,created_by)
 values(v_org,p_direction,'POSTED',p_customer_id,p_supplier_id,p_financial_account_id,p_invoice_id,p_amount,coalesce(p_payment_date,current_date),p_payment_method,nullif(trim(p_tracking_number),''),nullif(trim(p_note),''),auth.uid()) returning id into v_id;
 if p_invoice_id is not null then
   select coalesce(sum(case when direction='RECEIPT' and transaction_kind='POSTED' then amount when direction='PAYMENT' and transaction_kind='REVERSAL' then amount when direction='PAYMENT' and transaction_kind='POSTED' then -amount when direction='RECEIPT' and transaction_kind='REVERSAL' then -amount else 0 end),0) into v_paid from public.payments where organization_id=v_org and invoice_id=p_invoice_id;
   update public.invoices set payment_status=case when v_paid>=total_amount then 'PAID' when v_paid>0 then 'PARTIAL' else 'UNPAID' end where id=p_invoice_id and organization_id=v_org;
 end if;
 return v_id;
end; $$;

create or replace function public.reverse_payment(p_payment_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.current_user_organization_id(); v_original public.payments%rowtype; v_id uuid; v_new_direction text; v_invoice_paid numeric;
begin
 if v_org is null or not private.has_permission('payments.reverse',v_org) then raise exception 'دسترسی برگشت تراکنش مجاز نیست.'; end if;
 select * into v_original from public.payments where id=p_payment_id and organization_id=v_org and transaction_kind='POSTED' for update;
 if not found then raise exception 'تراکنش قابل برگشت یافت نشد.'; end if;
 if exists(select 1 from public.payments where reversed_payment_id=p_payment_id) then raise exception 'این تراکنش قبلاً برگشت خورده است.'; end if;
 perform 1 from public.financial_accounts where id=v_original.financial_account_id and organization_id=v_org for update;
 v_new_direction:=case when v_original.direction='RECEIPT' then 'PAYMENT' else 'RECEIPT' end;
 insert into public.payments(organization_id,direction,transaction_kind,customer_id,supplier_id,financial_account_id,invoice_id,amount,payment_date,payment_method,tracking_number,note,reversed_payment_id,created_by)
 values(v_org,v_new_direction,'REVERSAL',v_original.customer_id,v_original.supplier_id,v_original.financial_account_id,v_original.invoice_id,v_original.amount,current_date,v_original.payment_method,v_original.tracking_number,coalesce(nullif(trim(p_reason),''),'برگشت تراکنش'),v_original.id,auth.uid()) returning id into v_id;
 if v_original.invoice_id is not null then
   select coalesce(sum(case when direction='RECEIPT' and transaction_kind='POSTED' then amount when direction='PAYMENT' and transaction_kind='REVERSAL' then amount when direction='PAYMENT' and transaction_kind='POSTED' then -amount when direction='RECEIPT' and transaction_kind='REVERSAL' then -amount else 0 end),0) into v_invoice_paid from public.payments where organization_id=v_org and invoice_id=v_original.invoice_id;
   update public.invoices set payment_status=case when v_invoice_paid>=total_amount then 'PAID' when v_invoice_paid>0 then 'PARTIAL' else 'UNPAID' end where id=v_original.invoice_id and organization_id=v_org;
 end if;
 return v_id;
end; $$;

create or replace function public.stock_receive(p_warehouse_id uuid,p_product_id uuid,p_quantity numeric,p_reason text default 'ورود کالا') returns numeric language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.current_user_organization_id(); begin
 if v_org is null or not private.has_permission('inventory.create',v_org) then raise exception 'دسترسی ورود کالا مجاز نیست.'; end if;
 if p_quantity<=0 then raise exception 'مقدار ورود باید بیشتر از صفر باشد.'; end if;
 return public._change_stock(p_warehouse_id,p_product_id,p_quantity,'IN',p_reason);
end; $$;

create or replace function public.stock_issue(p_warehouse_id uuid,p_product_id uuid,p_quantity numeric,p_reason text default 'خروج کالا') returns numeric language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.current_user_organization_id(); begin
 if v_org is null or not private.has_permission('inventory.create',v_org) then raise exception 'دسترسی خروج کالا مجاز نیست.'; end if;
 if p_quantity<=0 then raise exception 'مقدار خروج باید بیشتر از صفر باشد.'; end if;
 return public._change_stock(p_warehouse_id,p_product_id,-p_quantity,'OUT',p_reason);
end; $$;

create or replace function public.stock_adjust(p_warehouse_id uuid,p_product_id uuid,p_delta numeric,p_reason text default 'اصلاح موجودی') returns numeric language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.current_user_organization_id(); begin
 if v_org is null or not private.has_permission('inventory.adjust',v_org) then raise exception 'دسترسی اصلاح موجودی مجاز نیست.'; end if;
 return public._change_stock(p_warehouse_id,p_product_id,p_delta,'ADJUSTMENT',p_reason);
end; $$;

create or replace function public.stock_transfer(p_from_warehouse_id uuid,p_to_warehouse_id uuid,p_product_id uuid,p_quantity numeric,p_reason text default 'انتقال بین انبارها') returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.current_user_organization_id(); v_transfer uuid:=gen_random_uuid(); v_from_qty numeric; v_to_qty numeric; v_name text; v_first uuid; v_second uuid;
begin
 if v_org is null or not private.has_permission('inventory.transfer',v_org) then raise exception 'دسترسی انتقال موجودی مجاز نیست.'; end if;
 if p_quantity<=0 then raise exception 'مقدار انتقال باید بیشتر از صفر باشد.'; end if;
 if p_from_warehouse_id=p_to_warehouse_id then raise exception 'انبار مبدأ و مقصد باید متفاوت باشند.'; end if;
 select name into v_name from public.products where id=p_product_id and organization_id=v_org and is_active=true;
 if v_name is null then raise exception 'کالای مورد نظر یافت نشد یا غیرفعال است.'; end if;
 if not exists(select 1 from public.warehouses where id=p_from_warehouse_id and organization_id=v_org and is_active=true) or not exists(select 1 from public.warehouses where id=p_to_warehouse_id and organization_id=v_org and is_active=true) then raise exception 'انبار مبدأ یا مقصد معتبر نیست.'; end if;
 perform public._ensure_warehouse_stock(v_org,p_from_warehouse_id,p_product_id); perform public._ensure_warehouse_stock(v_org,p_to_warehouse_id,p_product_id);
 if p_from_warehouse_id<p_to_warehouse_id then v_first:=p_from_warehouse_id; v_second:=p_to_warehouse_id; else v_first:=p_to_warehouse_id; v_second:=p_from_warehouse_id; end if;
 perform 1 from public.warehouse_stock where warehouse_id=v_first and product_id=p_product_id for update;
 perform 1 from public.warehouse_stock where warehouse_id=v_second and product_id=p_product_id for update;
 select quantity into v_from_qty from public.warehouse_stock where warehouse_id=p_from_warehouse_id and product_id=p_product_id;
 select quantity into v_to_qty from public.warehouse_stock where warehouse_id=p_to_warehouse_id and product_id=p_product_id;
 if v_from_qty<p_quantity then raise exception 'موجودی «%» در انبار مبدأ کافی نیست (موجودی فعلی: %).',v_name,v_from_qty; end if;
 update public.warehouse_stock set quantity=v_from_qty-p_quantity,updated_at=now() where warehouse_id=p_from_warehouse_id and product_id=p_product_id;
 update public.warehouse_stock set quantity=v_to_qty+p_quantity,updated_at=now() where warehouse_id=p_to_warehouse_id and product_id=p_product_id;
 insert into public.stock_movements(organization_id,warehouse_id,product_id,change_qty,quantity,movement_type,reason,transfer_id,created_by) values(v_org,p_from_warehouse_id,p_product_id,-p_quantity,p_quantity,'TRANSFER_OUT',p_reason,v_transfer,auth.uid()),(v_org,p_to_warehouse_id,p_product_id,p_quantity,p_quantity,'TRANSFER_IN',p_reason,v_transfer,auth.uid());
 return v_transfer;
end; $$;

create or replace function public.post_expense(p_category text,p_amount numeric,p_expense_date date,p_financial_account_id uuid,p_expense_account_id uuid,p_description text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.current_user_organization_id(); v_expense_id uuid; v_entry_id uuid; v_cash_account uuid;
begin
 if v_org is null or not private.has_permission('expenses.create',v_org) then raise exception 'دسترسی ثبت هزینه مجاز نیست.'; end if;
 if p_amount<=0 then raise exception 'Expense amount must be positive'; end if;
 if not exists(select 1 from public.financial_accounts where id=p_financial_account_id and organization_id=v_org and is_active) then raise exception 'Invalid financial account'; end if;
 if not exists(select 1 from public.chart_of_accounts where id=p_expense_account_id and organization_id=v_org and account_type='EXPENSE' and is_active) then raise exception 'Invalid expense account'; end if;
 select id into v_cash_account from public.chart_of_accounts where organization_id=v_org and account_type='ASSET' and code='1100' and is_active limit 1;
 if v_cash_account is null then raise exception 'Default asset account 1100 is missing'; end if;
 insert into public.expenses(category,amount,expense_date,description,organization_id,financial_account_id,expense_account_id,status,transaction_kind,created_by) values(p_category,p_amount,p_expense_date,p_description,v_org,p_financial_account_id,p_expense_account_id,'POSTED','POSTED',auth.uid()) returning id into v_expense_id;
 insert into public.journal_entries(organization_id,entry_date,description,source_type,source_id,status,created_by) values(v_org,p_expense_date,p_description,'EXPENSE',v_expense_id,'POSTED',auth.uid()) returning id into v_entry_id;
 insert into public.journal_lines(organization_id,journal_entry_id,account_id,debit,credit,description) values(v_org,v_entry_id,p_expense_account_id,p_amount,0,p_description),(v_org,v_entry_id,v_cash_account,0,p_description);
 return v_expense_id;
end; $$;

create or replace function public.post_journal_entry(p_entry_date date,p_description text,p_lines jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid:=private.current_user_organization_id(); v_entry uuid; v_debit numeric; v_credit numeric; v_line jsonb;
begin
 if v_org is null or not private.has_permission('financial_accounts.manage',v_org) then raise exception 'دسترسی ثبت سند حسابداری مجاز نیست.'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<2 then raise exception 'At least two journal lines are required'; end if;
 select coalesce(sum((x->>'debit')::numeric),0),coalesce(sum((x->>'credit')::numeric),0) into v_debit,v_credit from jsonb_array_elements(p_lines)x;
 if v_debit<>v_credit or v_debit<=0 then raise exception 'Journal entry must be balanced'; end if;
 insert into public.journal_entries(organization_id,entry_date,description,source_type,status,created_by) values(v_org,p_entry_date,p_description,'MANUAL','POSTED',auth.uid()) returning id into v_entry;
 for v_line in select * from jsonb_array_elements(p_lines) loop
   if not exists(select 1 from public.chart_of_accounts where id=(v_line->>'account_id')::uuid and organization_id=v_org and is_active) then raise exception 'Invalid account'; end if;
   insert into public.journal_lines(organization_id,journal_entry_id,account_id,debit,credit,description) values(v_org,v_entry,(v_line->>'account_id')::uuid,coalesce((v_line->>'debit')::numeric,0),coalesce((v_line->>'credit')::numeric,0),v_line->>'description');
 end loop;
 return v_entry;
end; $$;

-- Reporting RPCs enforce their existing role permissions at the database boundary.
create or replace function public.get_reports_data(p_from date,p_to date,p_page integer default 1,p_page_size integer default 25)
returns jsonb language plpgsql set search_path='public','private' as $$
declare v_org uuid:=private.current_user_organization_id(); v_page integer:=greatest(coalesce(p_page,1),1); v_size integer:=least(greatest(coalesce(p_page_size,25),1),100); v_offset integer:=(v_page-1)*v_size; v_sales numeric:=0; v_expenses numeric:=0; v_receipts numeric:=0; v_payments numeric:=0; v_profit numeric:=0; v_receivables numeric:=0; v_payables numeric:=0; v_sales_count bigint:=0; v_expense_count bigint:=0; v_receipt_count bigint:=0; v_payment_count bigint:=0; v_sales_rows jsonb:='[]'; v_expense_rows jsonb:='[]'; v_receipt_rows jsonb:='[]'; v_payment_rows jsonb:='[]'; v_daily jsonb:='[]'; v_monthly jsonb:='[]'; v_yearly jsonb:='[]'; v_top_customers jsonb:='[]'; v_top_products jsonb:='[]'; v_inventory jsonb:='[]'; v_pnl jsonb:='[]'; v_cashflow jsonb:='[]';
begin
 if v_org is null or not private.has_permission('reports.view',v_org) then raise exception 'دسترسی گزارش‌ها مجاز نیست.'; end if;
 if p_from is null or p_to is null or p_from>p_to then raise exception 'بازه تاریخ نامعتبر است.'; end if;
 select coalesce(sum(i.total_amount),0),count(*) into v_sales,v_sales_count from public.invoices i where i.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to;
 select coalesce(sum(e.amount),0),count(*) into v_expenses,v_expense_count from public.expenses e where e.organization_id=v_org and e.status='POSTED' and e.transaction_kind='POSTED' and e.expense_date between p_from and p_to;
 select coalesce(sum(case when p.direction='RECEIPT' and p.transaction_kind='POSTED' then p.amount when p.direction='RECEIPT' and p.transaction_kind='REVERSAL' then -p.amount else 0 end),0),coalesce(sum(case when p.direction='PAYMENT' and p.transaction_kind='POSTED' then p.amount when p.direction='PAYMENT' and p.transaction_kind='REVERSAL' then -p.amount else 0 end),0),count(*) filter(where p.direction='RECEIPT'),count(*) filter(where p.direction='PAYMENT') into v_receipts,v_payments,v_receipt_count,v_payment_count from public.payments p where p.organization_id=v_org and p.payment_date between p_from and p_to;
 select coalesce(sum(case when a.account_type='REVENUE' then l.credit-l.debit when a.account_type='EXPENSE' then -(l.debit-l.credit) else 0 end),0) into v_profit from public.journal_entries je join public.journal_lines l on l.journal_entry_id=je.id and l.organization_id=v_org join public.chart_of_accounts a on a.id=l.account_id and a.organization_id=v_org where je.organization_id=v_org and je.status='POSTED' and je.entry_date between p_from and p_to;
 select coalesce(sum(balance),0) into v_receivables from public.customer_balances where organization_id=v_org and balance>0;
 select coalesce(sum(balance),0) into v_payables from public.supplier_balances where organization_id=v_org and balance>0;
 select coalesce(jsonb_agg(x order by x.sales_day),'[]') into v_daily from (select i.issue_date sales_day,sum(i.total_amount) total,count(*) invoice_count from public.invoices i where i.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to group by i.issue_date)x;
 select coalesce(jsonb_agg(x order by x.month_start),'[]') into v_monthly from (select date_trunc('month',i.issue_date)::date month_start,sum(i.total_amount) total,count(*) invoice_count from public.invoices i where i.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to group by 1)x;
 select coalesce(jsonb_agg(x order by x.year_start),'[]') into v_yearly from (select date_trunc('year',i.issue_date)::date year_start,sum(i.total_amount) total,count(*) invoice_count from public.invoices i where i.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to group by 1)x;
 select coalesce(jsonb_agg(x),'[]') into v_top_customers from (select c.id customer_id,c.name,sum(i.total_amount) total,count(*) invoice_count from public.invoices i join public.customers c on c.id=i.customer_id and c.organization_id=v_org where i.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to and i.customer_id is not null group by c.id,c.name order by total desc limit 10)x;
 select coalesce(jsonb_agg(x),'[]') into v_top_products from (select coalesce(ii.product_id::text,'') product_id,ii.product_name name,sum(ii.quantity) quantity,sum(ii.quantity*ii.unit_price) revenue from public.invoice_items ii join public.invoices i on i.id=ii.invoice_id and i.organization_id=v_org where ii.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to group by ii.product_id,ii.product_name order by revenue desc limit 10)x;
 select coalesce(jsonb_agg(x order by x.name),'[]') into v_inventory from (select p.id product_id,p.name,p.unit,p.min_stock,coalesce(sum(ws.quantity),0) quantity,coalesce(sum(ws.quantity),0)<p.min_stock low_stock from public.products p left join public.warehouse_stock ws on ws.product_id=p.id and ws.organization_id=v_org where p.organization_id=v_org group by p.id,p.name,p.unit,p.min_stock)x;
 select coalesce(jsonb_agg(x order by x.account_type,x.code),'[]') into v_pnl from (select a.code,a.name,a.account_type,coalesce(sum(l.debit),0) debit,coalesce(sum(l.credit),0) credit,case when a.account_type='REVENUE' then coalesce(sum(l.credit-l.debit),0) when a.account_type='EXPENSE' then coalesce(sum(l.debit-l.credit),0) else 0 end amount from public.chart_of_accounts a join public.journal_lines l on l.account_id=a.id and l.organization_id=v_org join public.journal_entries je on je.id=l.journal_entry_id and je.organization_id=v_org and je.status='POSTED' where a.organization_id=v_org and a.account_type in ('REVENUE','EXPENSE') and je.entry_date between p_from and p_to group by a.id,a.code,a.name,a.account_type)x;
 select coalesce(jsonb_agg(x order by x.flow_day),'[]') into v_cashflow from (select flow_day,sum(receipts) receipts,sum(payments) payments,sum(expenses) expenses,sum(receipts)-sum(payments)-sum(expenses) net from (select p.payment_date flow_day,case when p.direction='RECEIPT' and p.transaction_kind='POSTED' then p.amount when p.direction='RECEIPT' and p.transaction_kind='REVERSAL' then -p.amount else 0 end receipts,case when p.direction='PAYMENT' and p.transaction_kind='POSTED' then p.amount when p.direction='PAYMENT' and p.transaction_kind='REVERSAL' then -p.amount else 0 end payments,0::numeric expenses from public.payments p where p.organization_id=v_org and p.payment_date between p_from and p_to union all select e.expense_date,0::numeric,0::numeric,e.amount from public.expenses e where e.organization_id=v_org and e.status='POSTED' and e.transaction_kind='POSTED' and e.expense_date between p_from and p_to)q group by flow_day)x;
 select coalesce(jsonb_agg(x),'[]') into v_sales_rows from (select i.id,i.invoice_number,i.issue_date,i.total_amount,i.payment_status,c.name customer_name from public.invoices i left join public.customers c on c.id=i.customer_id and c.organization_id=v_org where i.organization_id=v_org and i.status='POSTED' and i.issue_date between p_from and p_to order by i.issue_date desc,i.created_at desc offset v_offset limit v_size)x;
 select coalesce(jsonb_agg(x),'[]') into v_expense_rows from (select e.id,e.expense_date,e.category,e.amount,e.description from public.expenses e where e.organization_id=v_org and e.status='POSTED' and e.transaction_kind='POSTED' and e.expense_date between p_from and p_to order by e.expense_date desc,e.created_at desc offset v_offset limit v_size)x;
 select coalesce(jsonb_agg(x),'[]') into v_receipt_rows from (select p.id,p.payment_date,p.amount,p.payment_method,p.tracking_number,c.name customer_name from public.payments p left join public.customers c on c.id=p.customer_id and c.organization_id=v_org where p.organization_id=v_org and p.direction='RECEIPT' and p.payment_date between p_from and p_to order by p.payment_date desc,p.created_at desc offset v_offset limit v_size)x;
 select coalesce(jsonb_agg(x),'[]') into v_payment_rows from (select p.id,p.payment_date,p.amount,p.payment_method,p.tracking_number,s.name supplier_name from public.payments p left join public.suppliers s on s.id=p.supplier_id and s.organization_id=v_org where p.organization_id=v_org and p.direction='PAYMENT' and p.payment_date between p_from and p_to order by p.payment_date desc,p.created_at desc offset v_offset limit v_size)x;
 return jsonb_build_object('summary',jsonb_build_object('sales',v_sales,'expenses',v_expenses,'receipts',v_receipts,'payments',v_payments,'profit',v_profit,'receivables',v_receivables,'payables',v_payables,'sales_count',v_sales_count,'expense_count',v_expense_count,'receipt_count',v_receipt_count,'payment_count',v_payment_count),'sales_daily',v_daily,'sales_monthly',v_monthly,'sales_yearly',v_yearly,'top_customers',v_top_customers,'top_products',v_top_products,'inventory',v_inventory,'profit_loss',v_pnl,'cash_flow',v_cashflow,'sales_rows',v_sales_rows,'expense_rows',v_expense_rows,'receipt_rows',v_receipt_rows,'payment_rows',v_payment_rows,'page',v_page,'page_size',v_size);
end; $$;

create or replace function public.get_cash_flow_transactions(p_from date,p_to date,p_page integer default 1,p_page_size integer default 25)
returns jsonb language plpgsql set search_path='public','private' as $$
declare v_org uuid:=private.current_user_organization_id(); v_page integer:=greatest(coalesce(p_page,1),1); v_size integer:=least(greatest(coalesce(p_page_size,25),1),100); v_offset integer:=(v_page-1)*v_size; v_count bigint;
begin
 if v_org is null or not private.has_permission('reports.view',v_org) then raise exception 'دسترسی گزارش‌ها مجاز نیست.'; end if;
 select count(*) into v_count from (select p.id from public.payments p where p.organization_id=v_org and p.payment_date between p_from and p_to union all select e.id from public.expenses e where e.organization_id=v_org and e.status='POSTED' and e.transaction_kind='POSTED' and e.expense_date between p_from and p_to)q;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(x) from (select * from (select p.id,'دریافت' kind,p.payment_date flow_date,p.amount,p.payment_method,p.tracking_number,c.name party_name from public.payments p left join public.customers c on c.id=p.customer_id and c.organization_id=v_org where p.organization_id=v_org and p.payment_date between p_from and p_to union all select p.id,'پرداخت',p.payment_date,p.amount,p.payment_method,p.tracking_number,s.name from public.payments p left join public.suppliers s on s.id=p.supplier_id and s.organization_id=v_org where p.organization_id=v_org and p.payment_date between p_from and p_to union all select e.id,'هزینه',e.expense_date,e.amount,null,null,e.category from public.expenses e where e.organization_id=v_org and e.status='POSTED' and e.transaction_kind='POSTED' and e.expense_date between p_from and p_to)q order by flow_date desc offset v_offset limit v_size)x),'[]'),'count',v_count,'page',v_page,'page_size',v_size);
end; $$;

create or replace function public.get_inventory_report_page(p_page integer default 1,p_page_size integer default 25)
returns jsonb language plpgsql set search_path='public','private' as $$
declare v_org uuid:=private.current_user_organization_id(); v_page integer:=greatest(coalesce(p_page,1),1); v_size integer:=least(greatest(coalesce(p_page_size,25),1),100); v_offset integer:=(v_page-1)*v_size; v_count bigint;
begin
 if v_org is null or not private.has_permission('inventory.view',v_org) then raise exception 'دسترسی گزارش موجودی مجاز نیست.'; end if;
 select count(*) into v_count from public.products where organization_id=v_org;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(x) from (select p.id product_id,p.name,p.unit,p.min_stock,coalesce(sum(ws.quantity),0) quantity,coalesce(sum(ws.quantity),0)<p.min_stock low_stock from public.products p left join public.warehouse_stock ws on ws.product_id=p.id and ws.organization_id=v_org where p.organization_id=v_org group by p.id,p.name,p.unit,p.min_stock order by p.name offset v_offset limit v_size)x),'[]'),'count',v_count,'page',v_page,'page_size',v_size);
end; $$;

revoke execute on function public._change_stock(uuid,uuid,numeric,text,text,text,uuid) from public,anon,authenticated;
revoke execute on function public._ensure_warehouse_stock(uuid,uuid,uuid) from public,anon,authenticated;
revoke execute on function private.current_user_organization_id() from public,anon;
grant execute on function private.current_user_organization_id() to authenticated;
