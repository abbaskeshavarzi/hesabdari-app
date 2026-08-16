-- مرحله ۱۱: افزودن id فاکتور و نام مشتری به خروجی get_dashboard_stats
-- این فایل را در Supabase Dashboard > SQL Editor اجرا کنید
--
-- چرا لازم است: در بازبینی UX داشبورد مشخص شد که ردیف‌های «فاکتورهای معوق»
-- و «آخرین فاکتورها» قابل کلیک نبودن (چون id فاکتور در خروجی نبود) و
-- «آخرین فاکتورها» نام مشتری/شماره فاکتور رو هم نشون نمی‌داد.
-- امضای تابع (بدون آرگومان، خروجی jsonb) عوض نشده، پس نیازی به
-- drop function نیست؛ create or replace کافیه.

create or replace function get_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', current_date)::date;
  v_total_customers int;
  v_total_owed numeric;
  v_month_sales numeric;
  v_monthly_chart jsonb;
  v_top_debtors jsonb;
  v_overdue jsonb;
  v_recent jsonb;
begin
  select count(*) into v_total_customers from customers;

  select coalesce(sum(balance), 0) into v_total_owed
  from customer_balances
  where balance > 0;

  select coalesce(sum(total_amount), 0) into v_month_sales
  from invoices
  where issue_date >= v_month_start;

  -- نمودار ۶ ماه اخیر: برای هر ماه، مجموع فروش همون ماه (قدیمی‌ترین اول)
  select coalesce(jsonb_agg(x order by x.month_start), '[]'::jsonb) into v_monthly_chart
  from (
    select
      (v_month_start - (n * interval '1 month'))::date as month_start,
      coalesce((
        select sum(total_amount) from invoices
        where issue_date >= (v_month_start - (n * interval '1 month'))::date
          and issue_date < (v_month_start - (n * interval '1 month') + interval '1 month')::date
      ), 0) as total
    from generate_series(0, 5) as n
  ) x;

  -- بدهکارترین ۵ مشتری
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_top_debtors
  from (
    select customer_id, name, balance
    from customer_balances
    where balance > 0
    order by balance desc
    limit 5
  ) t;

  -- ۵ فاکتور معوق قدیمی‌تر از ۳۰ روز
  -- [جدید] inv.id هم اضافه شد تا هر ردیف بشه مستقیم لینک به /invoice-print?id=... باشه
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_overdue
  from (
    select
      inv.id,
      inv.invoice_number,
      c.name as customer_name,
      inv.total_amount,
      inv.issue_date,
      (current_date - inv.issue_date) as days_overdue
    from invoices inv
    left join customers c on c.id = inv.customer_id
    where coalesce(inv.status, 'معوق') <> 'پرداخت‌شده'
      and inv.issue_date < (current_date - 30)
    order by inv.issue_date asc
    limit 5
  ) t;

  -- ۵ فاکتور اخیر
  -- [جدید] id و نام مشتری هم اضافه شد (قبلاً فقط تاریخ و مبلغ بود)
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_recent
  from (
    select inv.id, inv.invoice_number, inv.total_amount, inv.issue_date, c.name as customer_name
    from invoices inv
    left join customers c on c.id = inv.customer_id
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

revoke all on function get_dashboard_stats() from public;
grant execute on function get_dashboard_stats() to authenticated;
