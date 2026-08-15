-- مرحله ۹: افزودن قابلیت تخفیف به فاکتورها
-- این فایل را در Supabase Dashboard > SQL Editor اجرا کنید

-- ستون‌های جدید برای نگهداری اطلاعات تخفیف هر فاکتور
alter table invoices add column if not exists discount_type text default 'amount';
alter table invoices add column if not exists discount_value numeric default 0;
alter table invoices add column if not exists discount_amount numeric default 0;

-- چون امضای تابع قبلی تغییر می‌کند، ابتدا نسخه‌ی قبلی حذف می‌شود تا در Supabase
-- دو تابع هم‌نام با پارامترهای متفاوت باقی نماند (که باعث خطای ابهام می‌شود)
drop function if exists create_invoice_with_items(uuid, text, date, text, text, jsonb);

create or replace function create_invoice_with_items(
  p_customer_id uuid,
  p_invoice_number text,
  p_issue_date date,
  p_description text,
  p_status text,
  p_items jsonb,
  p_discount_type text default 'amount',
  p_discount_value numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_total numeric := 0;
  item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_product_name text;
  v_stock numeric;
begin
  if p_customer_id is null then
    raise exception 'انتخاب مشتری الزامی است.';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'حداقل یک قلم کالا لازم است.';
  end if;

  select coalesce(sum((i->>'quantity')::numeric * coalesce((i->>'unit_price')::numeric, 0)), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) i;

  if p_discount_type = 'percent' then
    v_discount_amount := v_subtotal * coalesce(p_discount_value, 0) / 100;
  else
    v_discount_amount := coalesce(p_discount_value, 0);
  end if;

  -- تخفیف نباید منفی باشد یا از مبلغ کل فاکتور بیشتر شود
  if v_discount_amount < 0 then
    v_discount_amount := 0;
  end if;
  if v_discount_amount > v_subtotal then
    v_discount_amount := v_subtotal;
  end if;

  v_total := v_subtotal - v_discount_amount;

  insert into invoices (
    customer_id, invoice_number, issue_date, total_amount, description, status,
    discount_type, discount_value, discount_amount
  )
  values (
    p_customer_id, p_invoice_number, p_issue_date, v_total, p_description, coalesce(p_status, 'معوق'),
    coalesce(p_discount_type, 'amount'), coalesce(p_discount_value, 0), v_discount_amount
  )
  returning id into v_invoice_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(item->>'product_id', '')::uuid;
    v_quantity := (item->>'quantity')::numeric;
    v_unit_price := coalesce((item->>'unit_price')::numeric, 0);
    v_product_name := item->>'product_name';

    insert into invoice_items (invoice_id, product_id, product_name, quantity, unit_price)
    values (v_invoice_id, v_product_id, v_product_name, v_quantity, v_unit_price);

    if v_product_id is not null then
      select stock_qty into v_stock from products where id = v_product_id for update;

      if v_stock is null then
        raise exception 'کالای «%» یافت نشد.', v_product_name;
      end if;

      if v_stock < v_quantity then
        raise exception 'موجودی «%» کافی نیست (موجودی فعلی: %).', v_product_name, v_stock;
      end if;

      update products set stock_qty = stock_qty - v_quantity where id = v_product_id;

      insert into stock_movements (product_id, change_qty, reason)
      values (v_product_id, -v_quantity, 'فروش در فاکتور ' || coalesce(p_invoice_number, ''));
    end if;
  end loop;

  return v_invoice_id;
end;
$$;

revoke all on function create_invoice_with_items(uuid, text, date, text, text, jsonb, text, numeric) from public;
grant execute on function create_invoice_with_items(uuid, text, date, text, text, jsonb, text, numeric) to authenticated;
