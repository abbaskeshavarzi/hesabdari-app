-- اجرای این فایل در Supabase Dashboard > SQL Editor
-- این اسکریپت جداول مشتری، فاکتور و پرداخت را می‌سازد

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  created_at timestamptz default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  invoice_number text,
  issue_date date not null default current_date,
  total_amount numeric not null default 0,
  description text,
  created_at timestamptz default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  amount numeric not null default 0,
  payment_date date not null default current_date,
  note text,
  created_at timestamptz default now()
);

-- جدول کالاها (لیست کالا)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text default 'عدد',
  price numeric not null default 0,
  stock_qty numeric not null default 0,
  created_at timestamptz default now()
);

-- تاریخچه تغییرات انبار (ورود/خروج کالا)
create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  change_qty numeric not null,
  reason text,
  created_at timestamptz default now()
);

alter table products enable row level security;
alter table stock_movements enable row level security;

create policy "authenticated full access products" on products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access stock_movements" on stock_movements
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- فعال‌سازی امنیت سطح ردیف: فقط کاربر لاگین‌کرده به داده دسترسی دارد
alter table customers enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;

create policy "authenticated full access customers" on customers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access invoices" on invoices
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access payments" on payments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ویو محاسبه موجودی حساب هر مشتری (مجموع فاکتورها منهای مجموع پرداخت‌ها)
create or replace view customer_balances as
select
  c.id as customer_id,
  c.name,
  c.phone,
  c.address,
  coalesce(inv.total, 0) as total_invoiced,
  coalesce(pay.total, 0) as total_paid,
  coalesce(inv.total, 0) - coalesce(pay.total, 0) as balance
from customers c
left join (
  select customer_id, sum(total_amount) as total from invoices group by customer_id
) inv on inv.customer_id = c.id
left join (
  select customer_id, sum(amount) as total from payments group by customer_id
) pay on pay.customer_id = c.id;
