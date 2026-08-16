-- مرحله ۱۲: سخت‌سازی امنیت چندکاربره، محدودسازی Storage و به‌روزرسانی RPCها
-- این فایل را پس از migrationهای قبلی در Supabase SQL Editor اجرا کنید.
-- هدف: داده هر کاربر فقط برای همان auth.uid() قابل خواندن/نوشتن باشد.

alter table customers add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table products add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table invoices add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table payments add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table stock_movements add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table invoice_items add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table expenses add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table business_settings add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();

create index if not exists idx_customers_user_id on customers (user_id);
create index if not exists idx_products_user_id on products (user_id);
create index if not exists idx_invoices_user_id on invoices (user_id);
create index if not exists idx_payments_user_id on payments (user_id);
create index if not exists idx_stock_movements_user_id on stock_movements (user_id);
create index if not exists idx_invoice_items_user_id on invoice_items (user_id);
create index if not exists idx_expenses_user_id on expenses (user_id);
create index if not exists idx_business_settings_user_id on business_settings (user_id);

-- هر کاربر باید تنظیمات کسب‌وکار مستقل داشته باشد. کلاینت از id=user_id برای upsert استفاده می‌کند.
alter table business_settings alter column id set default auth.uid()::text;
create unique index if not exists idx_business_settings_user_id_unique on business_settings (user_id);

-- اگر دیتابیس قبلاً تک‌کاربره بوده، مقدار user_id رکوردهای قدیمی را دستی با id کاربر اصلی پر کنید.
-- مثال امن‌تر: update customers set user_id = 'USER_UUID' where user_id is null;

create or replace view customer_balances as
select
  c.id as customer_id,
  c.user_id,
  c.name,
  c.phone,
  c.address,
  coalesce(inv.total, 0) as total_invoiced,
  coalesce(pay.total, 0) as total_paid,
  coalesce(inv.total, 0) - coalesce(pay.total, 0) as balance
from customers c
left join (
  select customer_id, user_id, sum(total_amount) as total from invoices group by customer_id, user_id
) inv on inv.customer_id = c.id and inv.user_id = c.user_id
left join (
  select customer_id, user_id, sum(amount) as total from payments group by customer_id, user_id
) pay on pay.customer_id = c.id and pay.user_id = c.user_id;

create or replace function private_user_policy(table_name text) returns void
language plpgsql
as $$
begin
  execute format('drop policy if exists %I on %I', 'authenticated full access ' || table_name, table_name);
  execute format('drop policy if exists %I on %I', table_name || ' own rows', table_name);
  execute format('create policy %I on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', table_name || ' own rows', table_name);
end;
$$;

select private_user_policy('customers');
select private_user_policy('products');
select private_user_policy('invoices');
select private_user_policy('payments');
select private_user_policy('stock_movements');
select private_user_policy('invoice_items');
select private_user_policy('expenses');
select private_user_policy('business_settings');
drop function private_user_policy(text);

-- Storage: فایل لوگو باید زیر پوشه uid کاربر ذخیره شود: {auth.uid()}/logo.webp
update storage.buckets set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'] where id = 'logos';

drop policy if exists "public read logos" on storage.objects;
create policy "public read logos" on storage.objects
  for select using (bucket_id = 'logos');

drop policy if exists "authenticated manage logos" on storage.objects;
create policy "authenticated manage own logos" on storage.objects
  for all using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function create_invoice_with_items(
  p_customer_id uuid,
  p_invoice_number text,
  p_issue_date date,
  p_description text,
  p_status text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_total numeric := 0;
  item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_product_name text;
  v_stock numeric;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'ورود به حساب الزامی است.'; end if;
  if p_customer_id is null then raise exception 'انتخاب مشتری الزامی است.'; end if;
  if not exists (select 1 from customers where id = p_customer_id and user_id = v_user_id) then
    raise exception 'مشتری مورد نظر یافت نشد.';
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'حداقل یک قلم کالا لازم است.'; end if;

  select coalesce(sum((i->>'quantity')::numeric * coalesce((i->>'unit_price')::numeric, 0)), 0)
  into v_total
  from jsonb_array_elements(p_items) i;

  insert into invoices (customer_id, invoice_number, issue_date, total_amount, description, status, user_id)
  values (p_customer_id, p_invoice_number, p_issue_date, v_total, p_description, coalesce(p_status, 'معوق'), v_user_id)
  returning id into v_invoice_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(item->>'product_id', '')::uuid;
    v_quantity := (item->>'quantity')::numeric;
    v_unit_price := coalesce((item->>'unit_price')::numeric, 0);
    v_product_name := item->>'product_name';

    insert into invoice_items (invoice_id, product_id, product_name, quantity, unit_price, user_id)
    values (v_invoice_id, v_product_id, v_product_name, v_quantity, v_unit_price, v_user_id);

    if v_product_id is not null then
      select stock_qty into v_stock from products where id = v_product_id and user_id = v_user_id for update;
      if v_stock is null then raise exception 'کالای «%» یافت نشد.', v_product_name; end if;
      if v_stock < v_quantity then raise exception 'موجودی «%» کافی نیست (موجودی فعلی: %).', v_product_name, v_stock; end if;
      update products set stock_qty = stock_qty - v_quantity where id = v_product_id and user_id = v_user_id;
      insert into stock_movements (product_id, change_qty, reason, user_id)
      values (v_product_id, -v_quantity, 'فروش در فاکتور ' || coalesce(p_invoice_number, ''), v_user_id);
    end if;
  end loop;

  return v_invoice_id;
end;
$$;

create or replace function delete_invoice_and_restore_stock(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  v_invoice_number text;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'ورود به حساب الزامی است.'; end if;
  select invoice_number into v_invoice_number from invoices where id = p_invoice_id and user_id = v_user_id;
  if v_invoice_number is null then raise exception 'فاکتور مورد نظر یافت نشد.'; end if;

  for item in select product_id, quantity from invoice_items where invoice_id = p_invoice_id and product_id is not null and user_id = v_user_id
  loop
    update products set stock_qty = stock_qty + item.quantity where id = item.product_id and user_id = v_user_id;
    insert into stock_movements (product_id, change_qty, reason, user_id)
    values (item.product_id, item.quantity, 'بازگشت موجودی از حذف فاکتور ' || coalesce(v_invoice_number, ''), v_user_id);
  end loop;

  delete from invoices where id = p_invoice_id and user_id = v_user_id;
end;
$$;

create or replace function get_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_start date := date_trunc('month', current_date)::date;
  v_total_customers int;
  v_total_owed numeric;
  v_month_sales numeric;
  v_monthly_chart jsonb;
  v_top_debtors jsonb;
  v_overdue jsonb;
  v_recent jsonb;
begin
  if v_user_id is null then raise exception 'ورود به حساب الزامی است.'; end if;

  select count(*) into v_total_customers from customers where user_id = v_user_id;

  select coalesce(sum(balance), 0) into v_total_owed
  from customer_balances
  where user_id = v_user_id and balance > 0;

  select coalesce(sum(total_amount), 0) into v_month_sales
  from invoices
  where user_id = v_user_id and issue_date >= v_month_start;

  select coalesce(jsonb_agg(x order by x.month_start), '[]'::jsonb) into v_monthly_chart
  from (
    select
      (v_month_start - (n * interval '1 month'))::date as month_start,
      coalesce((
        select sum(total_amount) from invoices
        where user_id = v_user_id
          and issue_date >= (v_month_start - (n * interval '1 month'))::date
          and issue_date < (v_month_start - (n * interval '1 month') + interval '1 month')::date
      ), 0) as total
    from generate_series(0, 5) as n
  ) x;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_top_debtors
  from (
    select customer_id, name, balance
    from customer_balances
    where user_id = v_user_id and balance > 0
    order by balance desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_overdue
  from (
    select inv.id, inv.invoice_number, c.name as customer_name, inv.total_amount, inv.issue_date, (current_date - inv.issue_date) as days_overdue
    from invoices inv
    left join customers c on c.id = inv.customer_id and c.user_id = v_user_id
    where inv.user_id = v_user_id
      and coalesce(inv.status, 'معوق') <> 'پرداخت‌شده'
      and inv.issue_date < (current_date - 30)
    order by inv.issue_date asc
    limit 5
  ) t;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_recent
  from (
    select inv.id, inv.invoice_number, inv.total_amount, inv.issue_date, c.name as customer_name
    from invoices inv
    left join customers c on c.id = inv.customer_id and c.user_id = v_user_id
    where inv.user_id = v_user_id
    order by inv.issue_date desc
    limit 5
  ) t;

  return jsonb_build_object(
    'total_customers', v_total_customers,
    'total_owed', v_total_owed,
    'month_sales', v_month_sales,
    'monthly_chart', v_monthly_chart,
    'top_debtors', v_top_debtors,
    'overdue_invoices', v_overdue,
    'recent_invoices', v_recent
  );
end;
$$;

revoke all on function create_invoice_with_items(uuid, text, date, text, text, jsonb) from public;
grant execute on function create_invoice_with_items(uuid, text, date, text, text, jsonb) to authenticated;
revoke all on function delete_invoice_and_restore_stock(uuid) from public;
grant execute on function delete_invoice_and_restore_stock(uuid) to authenticated;
revoke all on function get_dashboard_stats() from public;
grant execute on function get_dashboard_stats() to authenticated;
