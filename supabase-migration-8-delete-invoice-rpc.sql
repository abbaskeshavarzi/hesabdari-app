-- مرحله ۸: تابع دیتابیسی برای حذف فاکتور همراه با بازگرداندن موجودی کالا
-- این فایل را در Supabase Dashboard > SQL Editor اجرا کنید
--
-- چرا این تابع لازم است؟
-- تا الان وقتی فاکتوری حذف می‌شد، موجودی کالاهایی که در آن فاکتور فروخته شده بودند
-- برنمی‌گشت (چون فقط سطر فاکتور حذف می‌شد، بدون اصلاح انبار). این تابع همه‌ی
-- اقلام فاکتور را می‌خواند، موجودی هرکدام را برمی‌گرداند، در تاریخچه‌ی انبار ثبت
-- می‌کند، و بعد خود فاکتور را حذف می‌کند — همه در یک تراکنش امن.

create or replace function delete_invoice_and_restore_stock(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  v_invoice_number text;
begin
  select invoice_number into v_invoice_number from invoices where id = p_invoice_id;

  if v_invoice_number is null then
    raise exception 'فاکتور مورد نظر یافت نشد.';
  end if;

  for item in
    select product_id, quantity from invoice_items
    where invoice_id = p_invoice_id and product_id is not null
  loop
    update products set stock_qty = stock_qty + item.quantity where id = item.product_id;

    insert into stock_movements (product_id, change_qty, reason)
    values (item.product_id, item.quantity, 'بازگشت موجودی از حذف فاکتور ' || coalesce(v_invoice_number, ''));
  end loop;

  -- حذف فاکتور، اقلامش هم به‌خاطر on delete cascade خودکار حذف می‌شوند
  delete from invoices where id = p_invoice_id;
end;
$$;

revoke all on function delete_invoice_and_restore_stock(uuid) from public;
grant execute on function delete_invoice_and_restore_stock(uuid) to authenticated;
