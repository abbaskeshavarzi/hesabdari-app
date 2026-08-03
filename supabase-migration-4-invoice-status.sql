-- مرحله ۴: افزودن وضعیت پرداخت به فاکتورها
-- این فایل را در Supabase Dashboard > SQL Editor اجرا کنید

alter table invoices add column if not exists status text not null default 'معوق';
alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check check (status in ('معوق', 'نیمه‌پرداخت', 'پرداخت‌شده'));
