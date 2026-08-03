-- مرحله ۲: افزودن لیست کالا و انبار
-- این فایل را در Supabase Dashboard > SQL Editor اجرا کنید (کافیست فقط همین فایل، نه کل schema)

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text default 'عدد',
  price numeric not null default 0,
  stock_qty numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  change_qty numeric not null,
  reason text,
  created_at timestamptz default now()
);

alter table products enable row level security;
alter table stock_movements enable row level security;

drop policy if exists "authenticated full access products" on products;
create policy "authenticated full access products" on products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access stock_movements" on stock_movements;
create policy "authenticated full access stock_movements" on stock_movements
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
