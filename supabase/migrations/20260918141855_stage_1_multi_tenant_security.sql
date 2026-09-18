-- Stage 1: secure multi-tenancy
-- Generated after auditing the existing production schema.
-- Safe backfill: existing rows are assigned to the legacy/default organization.
-- No business rows are deleted.

create schema if not exists private;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER','ADMIN','ACCOUNTANT','SELLER','WAREHOUSE')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

insert into public.organizations (name, slug)
select 'کسب‌وکار اصلی', 'default'
where not exists (select 1 from public.organizations);

insert into public.organization_members (organization_id, user_id, role)
select o.id, u.id, 'OWNER'
from public.organizations o cross join auth.users u
where o.slug='default'
and not exists (
  select 1 from public.organization_members m
  where m.organization_id=o.id and m.user_id=u.id
);

alter table public.customers add column if not exists organization_id uuid;
alter table public.products add column if not exists organization_id uuid;
alter table public.invoices add column if not exists organization_id uuid;
alter table public.invoice_items add column if not exists organization_id uuid;
alter table public.payments add column if not exists organization_id uuid;
alter table public.stock_movements add column if not exists organization_id uuid;
alter table public.expenses add column if not exists organization_id uuid;
alter table public.business_settings add column if not exists organization_id uuid;

update public.customers c set organization_id=o.id from public.organizations o where c.organization_id is null and o.slug='default';
update public.products p set organization_id=o.id from public.organizations o where p.organization_id is null and o.slug='default';
update public.invoices i set organization_id=o.id from public.organizations o where i.organization_id is null and o.slug='default';
update public.invoice_items ii set organization_id=i.organization_id from public.invoices i where ii.organization_id is null and ii.invoice_id=i.id;
update public.payments p set organization_id=o.id from public.organizations o where p.organization_id is null and o.slug='default';
update public.stock_movements s set organization_id=o.id from public.organizations o where s.organization_id is null and o.slug='default';
update public.expenses e set organization_id=o.id from public.organizations o where e.organization_id is null and o.slug='default';
update public.business_settings b set organization_id=o.id from public.organizations o where b.organization_id is null and o.slug='default';

do $$
begin
  if exists (
    select 1 from (
      select organization_id from public.customers
      union all select organization_id from public.products
      union all select organization_id from public.invoices
      union all select organization_id from public.invoice_items
      union all select organization_id from public.payments
      union all select organization_id from public.stock_movements
      union all select organization_id from public.expenses
      union all select organization_id from public.business_settings
    ) x where organization_id is null
  ) then
    raise exception 'Stage 1 aborted: unassigned business rows remain';
  end if;
end $$;

alter table public.customers alter column organization_id set not null;
alter table public.products alter column organization_id set not null;
alter table public.invoices alter column organization_id set not null;
alter table public.invoice_items alter column organization_id set not null;
alter table public.payments alter column organization_id set not null;
alter table public.stock_movements alter column organization_id set not null;
alter table public.expenses alter column organization_id set not null;
alter table public.business_settings alter column organization_id set not null;

alter table public.customers add constraint customers_organization_fk foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.products add constraint products_organization_fk foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.invoices add constraint invoices_organization_fk foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.invoice_items add constraint invoice_items_organization_fk foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.payments add constraint payments_organization_fk foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.stock_movements add constraint stock_movements_organization_fk foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.expenses add constraint expenses_organization_fk foreign key (organization_id) references public.organizations(id) on delete cascade;
alter table public.business_settings add constraint business_settings_organization_fk foreign key (organization_id) references public.organizations(id) on delete cascade;

create unique index if not exists invoices_id_org_unique on public.invoices(id,organization_id);
create unique index if not exists customers_id_org_unique on public.customers(id,organization_id);
create unique index if not exists products_id_org_unique on public.products(id,organization_id);

alter table public.invoices add constraint invoices_customer_org_fk foreign key (customer_id,organization_id) references public.customers(id,organization_id) not valid;
alter table public.invoice_items add constraint invoice_items_invoice_org_fk foreign key (invoice_id,organization_id) references public.invoices(id,organization_id) not valid;
alter table public.invoice_items add constraint invoice_items_product_org_fk foreign key (product_id,organization_id) references public.products(id,organization_id) not valid;
alter table public.payments add constraint payments_customer_org_fk foreign key (customer_id,organization_id) references public.customers(id,organization_id) not valid;
alter table public.stock_movements add constraint stock_movements_product_org_fk foreign key (product_id,organization_id) references public.products(id,organization_id) not valid;

create index if not exists idx_customers_org on public.customers(organization_id);
create index if not exists idx_products_org on public.products(organization_id);
create index if not exists idx_invoices_org on public.invoices(organization_id);
create index if not exists idx_invoice_items_org on public.invoice_items(organization_id);
create index if not exists idx_payments_org on public.payments(organization_id);
create index if not exists idx_stock_movements_org on public.stock_movements(organization_id);
create index if not exists idx_expenses_org on public.expenses(organization_id);
create index if not exists idx_business_settings_org on public.business_settings(organization_id);

create or replace function private.current_user_organization_id()
returns uuid language sql stable security definer set search_path=''
as $$
  select organization_id from public.organization_members
  where user_id=(select auth.uid()) order by created_at limit 1
$$;
revoke execute on function private.current_user_organization_id() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_organization_id() to authenticated;

alter table public.customers alter column organization_id set default (private.current_user_organization_id());
alter table public.products alter column organization_id set default (private.current_user_organization_id());
alter table public.invoices alter column organization_id set default (private.current_user_organization_id());
alter table public.invoice_items alter column organization_id set default (private.current_user_organization_id());
alter table public.payments alter column organization_id set default (private.current_user_organization_id());
alter table public.stock_movements alter column organization_id set default (private.current_user_organization_id());
alter table public.expenses alter column organization_id set default (private.current_user_organization_id());
alter table public.business_settings alter column organization_id set default (private.current_user_organization_id());

do $$
declare r record;
begin
  for r in select tablename,policyname from pg_policies
    where schemaname='public'
    and tablename in ('customers','products','invoices','invoice_items','payments','stock_movements','expenses','business_settings')
  loop
    execute format('drop policy if exists %I on public.%I',r.policyname,r.tablename);
  end loop;
end $$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.expenses enable row level security;
alter table public.business_settings enable row level security;

create policy org_select on public.organizations for select to authenticated
using (id=(select private.current_user_organization_id()));

create policy member_select on public.organization_members for select to authenticated
using (organization_id=(select private.current_user_organization_id()));

create policy customers_all on public.customers for all to authenticated
using (organization_id=(select private.current_user_organization_id()))
with check (organization_id=(select private.current_user_organization_id()));
create policy products_all on public.products for all to authenticated
using (organization_id=(select private.current_user_organization_id()))
with check (organization_id=(select private.current_user_organization_id()));
create policy invoices_all on public.invoices for all to authenticated
using (organization_id=(select private.current_user_organization_id()))
with check (organization_id=(select private.current_user_organization_id()));
create policy invoice_items_all on public.invoice_items for all to authenticated
using (organization_id=(select private.current_user_organization_id()))
with check (organization_id=(select private.current_user_organization_id()));
create policy payments_all on public.payments for all to authenticated
using (organization_id=(select private.current_user_organization_id()))
with check (organization_id=(select private.current_user_organization_id()));
create policy stock_movements_all on public.stock_movements for all to authenticated
using (organization_id=(select private.current_user_organization_id()))
with check (organization_id=(select private.current_user_organization_id()));
create policy expenses_all on public.expenses for all to authenticated
using (organization_id=(select private.current_user_organization_id()))
with check (organization_id=(select private.current_user_organization_id()));
create policy business_settings_all on public.business_settings for all to authenticated
using (organization_id=(select private.current_user_organization_id()))
with check (organization_id=(select private.current_user_organization_id()));

drop view if exists public.customer_balances;
create view public.customer_balances with (security_invoker=true) as
select c.id customer_id,c.name,c.phone,
coalesce(sum(i.total_amount),0)-coalesce((
  select sum(p.amount) from public.payments p
  where p.customer_id=c.id and p.organization_id=c.organization_id
),0) balance
from public.customers c
left join public.invoices i on i.customer_id=c.id and i.organization_id=c.organization_id
group by c.id,c.name,c.phone,c.organization_id;

revoke all on table public.customer_balances from anon;
grant select on table public.customer_balances to authenticated;

revoke execute on function public.create_invoice_with_items(uuid,text,date,text,text,jsonb,text,numeric) from public,anon;
revoke execute on function public.delete_invoice_and_restore_stock(uuid) from public,anon;
revoke execute on function public.get_dashboard_stats() from public,anon;
grant execute on function public.create_invoice_with_items(uuid,text,date,text,text,jsonb,text,numeric) to authenticated;
grant execute on function public.delete_invoice_and_restore_stock(uuid) to authenticated;
grant execute on function public.get_dashboard_stats() to authenticated;
