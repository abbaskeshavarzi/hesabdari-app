-- مرحله ۷: تابع دیتابیسی برای ثبت اتمیک فاکتور + کسر موجودی
-- این فایل را در Supabase Dashboard > SQL Editor اجرا کنید
--
-- چرا این تابع لازم است؟
-- قبلاً ثبت فاکتور، ثبت اقلام، و کسر موجودی هرکدام یک درخواست جدا به دیتابیس بودند.
-- این باعث می‌شد در صورت قطع اینترنت وسط کار، یا ثبت هم‌زمان دو فاکتور، موجودی
-- انبار به‌اشتباه محاسبه بشه یا فاکتور ناقص ثبت بشه.
-- این تابع همه‌ی این مراحل را در یک تراکنش دیتابیسی انجام می‌دهد: یا همه با هم
-- موفق می‌شوند، یا هیچ‌کدام (و موجودی هم با قفل ردیف، از ثبت هم‌زمان اشتباه جلوگیری می‌کند).

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
begin
  if p_customer_id is null then
    raise exception 'انتخاب مشتری الزامی است.';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'حداقل یک قلم کالا لازم است.';
  end if;

  select coalesce(sum((i->>'quantity')::numeric * coalesce((i->>'unit_price')::numeric, 0)), 0)
  into v_total
  from jsonb_array_elements(p_items) i;

  insert into invoices (customer_id, invoice_number, issue_date, total_amount, description, status)
  values (p_customer_id, p_invoice_number, p_issue_date, v_total, p_description, coalesce(p_status, 'معوق'))
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
      -- قفل ردیف کالا تا از کسر هم‌زمان و اشتباه موجودی جلوگیری بشه
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

-- فقط کاربر لاگین‌کرده اجازه‌ی اجرای این تابع را دارد
revoke all on function create_invoice_with_items(uuid, text, date, text, text, jsonb) from public;
grant execute on function create_invoice_with_items(uuid, text, date, text, text, jsonb) to authenticated;
