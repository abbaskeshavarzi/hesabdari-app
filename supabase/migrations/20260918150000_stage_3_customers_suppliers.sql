-- Stage 3: Customers & Suppliers
-- Non-destructive hardening of party master data and reliable customer balances.

alter table public.customers
  add column if not exists mobile text,
  add column if not exists economic_code text,
  add column if not exists customer_code text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

update public.customers
set updated_at = coalesce(created_at, now())
where updated_at is null;

with numbered as (
  select id, organization_id,
         'CUST-' || lpad(row_number() over (partition by organization_id order by created_at, id)::text, 4, '0') as code
  from public.customers
  where customer_code is null
)
update public.customers c
set customer_code = n.code
from numbered n
where c.id = n.id;

create unique index if not exists customers_org_customer_code_uidx
  on public.customers(organization_id, customer_code)
  where customer_code is not null;

create index if not exists customers_org_name_idx on public.customers(organization_id, name);
create index if not exists customers_org_phone_idx on public.customers(organization_id, phone);
create index if not exists customers_org_mobile_idx on public.customers(organization_id, mobile);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_user_organization_id()
    references public.organizations(id) on delete restrict,
  name text not null,
  phone text,
  mobile text,
  address text,
  economic_code text,
  supplier_code text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists suppliers_org_supplier_code_uidx
  on public.suppliers(organization_id, supplier_code)
  where supplier_code is not null;
create index if not exists suppliers_org_name_idx on public.suppliers(organization_id, name);
create index if not exists suppliers_org_phone_idx on public.suppliers(organization_id, phone);
create index if not exists suppliers_org_mobile_idx on public.suppliers(organization_id, mobile);

create or replace function public.touch_customers_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.touch_suppliers_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists customers_touch_updated_at on public.customers;
create trigger customers_touch_updated_at before update on public.customers
for each row execute function public.touch_customers_updated_at();

drop trigger if exists suppliers_touch_updated_at on public.suppliers;
create trigger suppliers_touch_updated_at before update on public.suppliers
for each row execute function public.touch_suppliers_updated_at();

alter table public.suppliers enable row level security;
drop policy if exists suppliers_all on public.suppliers;
create policy suppliers_all on public.suppliers
for all to authenticated
using (organization_id = (select private.current_user_organization_id()))
with check (organization_id = (select private.current_user_organization_id()));

drop view if exists public.customer_balances;
create view public.customer_balances with (security_invoker = true) as
select c.id as customer_id, c.organization_id, c.name, c.phone, c.mobile, c.address,
       c.economic_code, c.customer_code, c.notes, c.created_at, c.updated_at,
       coalesce(inv.total_invoiced,0::numeric) - coalesce(pay.total_paid,0::numeric) as balance
from public.customers c
left join (
  select organization_id, customer_id, sum(total_amount) as total_invoiced
  from public.invoices where customer_id is not null group by organization_id, customer_id
) inv on inv.organization_id=c.organization_id and inv.customer_id=c.id
left join (
  select organization_id, customer_id, sum(amount) as total_paid
  from public.payments where customer_id is not null group by organization_id, customer_id
) pay on pay.organization_id=c.organization_id and pay.customer_id=c.id;

grant select on public.customer_balances to authenticated;

create or replace view public.customer_transactions with (security_invoker = true) as
select i.organization_id, i.customer_id, i.id as transaction_id, i.issue_date as transaction_date,
       'invoice'::text as transaction_type, coalesce(i.invoice_number,'') as reference,
       i.total_amount as amount, i.description as note
from public.invoices i where i.customer_id is not null
union all
select p.organization_id, p.customer_id, p.id as transaction_id, p.payment_date as transaction_date,
       'payment'::text as transaction_type, ''::text as reference, p.amount as amount, p.note
from public.payments p where p.customer_id is not null;

grant select on public.customer_transactions to authenticated;

create or replace view public.supplier_balances with (security_invoker = true) as
select s.id as supplier_id, s.organization_id, s.name, s.phone, s.mobile, s.address,
       s.economic_code, s.supplier_code, s.notes, s.created_at, s.updated_at, 0::numeric as balance
from public.suppliers s;

grant select on public.supplier_balances to authenticated;
grant select, insert, update, delete on public.suppliers to authenticated;

revoke all on function public.touch_customers_updated_at() from public, anon, authenticated;
revoke all on function public.touch_suppliers_updated_at() from public, anon, authenticated;