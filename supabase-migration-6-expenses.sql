-- مرحله ۶ (نسخه سوم): افزودن ثبت هزینه‌ها برای محاسبه سود و زیان
-- این فایل را در Supabase Dashboard > SQL Editor اجرا کنید

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'متفرقه',
  amount numeric not null default 0,
  expense_date date not null default current_date,
  description text,
  created_at timestamptz default now()
);

alter table expenses enable row level security;

drop policy if exists "authenticated full access expenses" on expenses;
create policy "authenticated full access expenses" on expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
