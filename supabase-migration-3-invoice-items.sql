-- مرحله ۳: افزودن قابلیت چند قلم کالا در هر فاکتور
-- این فایل را در Supabase Dashboard > SQL Editor اجرا کنید

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  created_at timestamptz default now()
);

alter table invoice_items enable row level security;

drop policy if exists "authenticated full access invoice_items" on invoice_items;
create policy "authenticated full access invoice_items" on invoice_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
