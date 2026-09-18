-- Stage 9 — Roles, Permissions & Audit Log
-- Canonical SQL for the RBAC/audit changes applied to the connected Supabase project.
-- Re-run through the project's migration workflow after pulling the current remote schema.

create schema if not exists private;

create table if not exists public.permissions (
  key text primary key,
  module text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now(),
  unique(module, action)
);

create table if not exists public.role_permissions (
  role text not null check (role in ('OWNER','ADMIN','ACCOUNTANT','SELLER','WAREHOUSE')),
  permission_key text not null references public.permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission_key)
);

alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('OWNER','ADMIN','ACCOUNTANT','SELLER','WAREHOUSE'));

insert into public.permissions(key,module,action,description) values
('customers.view','customers','view','مشاهده مشتریان'),('customers.create','customers','create','ایجاد مشتری'),('customers.update','customers','update','ویرایش مشتری'),('customers.delete','customers','delete','حذف مشتری'),
('suppliers.view','suppliers','view','مشاهده تأمین‌کنندگان'),('suppliers.create','suppliers','create','ایجاد تأمین‌کننده'),('suppliers.update','suppliers','update','ویرایش تأمین‌کننده'),('suppliers.delete','suppliers','delete','حذف تأمین‌کننده'),
('products.view','products','view','مشاهده کالاها'),('products.create','products','create','ایجاد کالا'),('products.update','products','update','ویرایش کالا'),('products.delete','products','delete','حذف کالا'),
('inventory.view','inventory','view','مشاهده موجودی و انبار'),('inventory.create','inventory','create','ثبت ورود/خروج موجودی'),('inventory.adjust','inventory','adjust','اصلاح موجودی'),('inventory.transfer','inventory','transfer','انتقال بین انبارها'),('inventory.manage','inventory','manage','مدیریت ساختار انبارها'),
('invoices.view','invoices','view','مشاهده فاکتورها'),('invoices.create','invoices','create','ایجاد فاکتور'),('invoices.update','invoices','update','ویرایش فاکتور'),('invoices.delete','invoices','delete','حذف فاکتور'),('invoices.post','invoices','post','ثبت نهایی فاکتور'),('invoices.void','invoices','void','ابطال فاکتور'),
('payments.view','payments','view','مشاهده دریافت و پرداخت'),('payments.create','payments','create','ثبت دریافت/پرداخت'),('payments.reverse','payments','reverse','برگشت تراکنش'),
('expenses.view','expenses','view','مشاهده هزینه‌ها'),('expenses.create','expenses','create','ثبت هزینه'),
('reports.view','reports','view','مشاهده گزارش‌ها و داشبورد'),
('settings.view','settings','view','مشاهده تنظیمات'),('settings.update','settings','update','ویرایش تنظیمات'),
('users.view','users','view','مشاهده کاربران'),('users.manage','users','manage','مدیریت نقش کاربران'),
('audit_logs.view','audit_logs','view','مشاهده گزارش حسابرسی'),
('financial_accounts.view','financial_accounts','view','مشاهده حساب‌های مالی'),('financial_accounts.manage','financial_accounts','manage','مدیریت حساب‌های مالی'),
('backup.view','backup','view','مشاهده پشتیبان‌گیری'),('backup.restore','backup','restore','بازیابی پشتیبان')
on conflict(key) do update set module=excluded.module,action=excluded.action,description=excluded.description;

insert into public.role_permissions(role,permission_key)
select r.role,p.key from (values('OWNER'),('ADMIN')) r(role) cross join public.permissions p on conflict do nothing;

insert into public.role_permissions(role,permission_key)
select 'ACCOUNTANT',key from public.permissions where key in(
'customers.view','customers.create','customers.update','suppliers.view','suppliers.create','suppliers.update','products.view','inventory.view',
'invoices.view','invoices.create','invoices.update','invoices.post','invoices.void','payments.view','payments.create','payments.reverse',
'expenses.view','expenses.create','reports.view','financial_accounts.view','financial_accounts.manage','audit_logs.view') on conflict do nothing;

insert into public.role_permissions(role,permission_key)
select 'SELLER',key from public.permissions where key in(
'customers.view','customers.create','customers.update','suppliers.view','products.view','inventory.view',
'invoices.view','invoices.create','invoices.update','invoices.post','payments.view','payments.create','reports.view') on conflict do nothing;

insert into public.role_permissions(role,permission_key)
select 'WAREHOUSE',key from public.permissions where key in(
'products.view','inventory.view','inventory.create','inventory.adjust','inventory.transfer','inventory.manage','invoices.view','suppliers.view') on conflict do nothing;

insert into public.role_permissions(role,permission_key)
values('OWNER','inventory.manage'),('ADMIN','inventory.manage') on conflict do nothing;

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
revoke all on public.permissions,public.role_permissions from anon,authenticated;
grant select on public.permissions,public.role_permissions to authenticated;

create or replace function private.has_permission(p_permission text,p_organization_id uuid default null)
returns boolean language sql stable security definer set search_path=''
as $$
select exists(
 select 1 from public.organization_members om
 join public.role_permissions rp on rp.role=om.role
 where om.user_id=(select auth.uid())
 and om.organization_id=coalesce(p_organization_id,(select private.current_user_organization_id()))
 and rp.permission_key=p_permission
);
$$;
revoke all on function private.has_permission(text,uuid) from public,anon;
grant execute on function private.has_permission(text,uuid) to authenticated;

create or replace function public.get_my_permissions()
returns table(permission_key text) language sql stable security definer set search_path=''
as $$
select distinct rp.permission_key
from public.organization_members om join public.role_permissions rp on rp.role=om.role
where om.user_id=(select auth.uid()) and om.organization_id=(select private.current_user_organization_id())
order by rp.permission_key;
$$;
revoke all on function public.get_my_permissions() from public,anon;
grant execute on function public.get_my_permissions() to authenticated;

-- Existing module RLS policies are permission-aware. The canonical live implementation
-- also includes specialized invoice, inventory, financial-account, organization,
-- membership, journal and settings policies plus write-enforcement triggers.

create table if not exists public.audit_logs(
 id bigint generated always as identity primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 action text not null,
 table_name text not null,
 record_id text,
 occurred_at timestamptz not null default now(),
 before_data jsonb,
 after_data jsonb
);
create index if not exists audit_logs_org_time_idx on public.audit_logs(organization_id,occurred_at desc);
create index if not exists audit_logs_org_table_record_idx on public.audit_logs(organization_id,table_name,record_id);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon,authenticated;
grant select on public.audit_logs to authenticated;

create or replace function private.prevent_audit_log_mutation()
returns trigger language plpgsql security definer set search_path=''
as $$ begin raise exception 'audit logs are immutable'; end; $$;
revoke all on function private.prevent_audit_log_mutation() from public,anon;
grant execute on function private.prevent_audit_log_mutation() to authenticated;
drop trigger if exists trg_audit_logs_immutable on public.audit_logs;
create trigger trg_audit_logs_immutable
before update or delete on public.audit_logs
for each row execute function private.prevent_audit_log_mutation();

-- Reporting RPCs execute as the caller so their SELECT statements remain protected by RLS.
alter function public.get_reports_data(date,date,integer,integer) security invoker;
alter function public.get_cash_flow_transactions(date,date,integer,integer) security invoker;
alter function public.get_inventory_report_page(integer,integer) security invoker;
alter function public.get_dashboard_stats() security invoker;
