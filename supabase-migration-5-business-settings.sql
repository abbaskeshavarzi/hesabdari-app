-- مرحله ۵: افزودن تنظیمات کسب‌وکار (نام، تلفن، آدرس، لوگو)
-- این فایل را در Supabase Dashboard > SQL Editor اجرا کنید

create table if not exists business_settings (
  id text primary key default 'default',
  name text default 'نام کسب‌وکار شما',
  phone text default '0912xxxxxxx',
  address text default 'آدرس کسب‌وکار شما',
  logo_url text,
  updated_at timestamptz default now()
);

alter table business_settings enable row level security;

drop policy if exists "authenticated full access business_settings" on business_settings;
create policy "authenticated full access business_settings" on business_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into business_settings (id) values ('default') on conflict (id) do nothing;

-- سطل ذخیره‌سازی برای لوگو
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "public read logos" on storage.objects;
create policy "public read logos" on storage.objects
  for select using (bucket_id = 'logos');

drop policy if exists "authenticated manage logos" on storage.objects;
create policy "authenticated manage logos" on storage.objects
  for all using (bucket_id = 'logos' and auth.role() = 'authenticated')
  with check (bucket_id = 'logos' and auth.role() = 'authenticated');
