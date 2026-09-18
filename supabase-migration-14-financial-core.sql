-- Stage 7 Financial Core
-- Chart of accounts, immutable double-entry journal, atomic expense posting,
-- invoice/payment journalization, audit views and server-side balances.

create table if not exists public.chart_of_accounts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null default private.current_user_organization_id(),
 code text not null, name text not null,
 account_type text not null check(account_type in('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
 parent_id uuid references public.chart_of_accounts(id),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(organization_id,code)
);
create table if not exists public.journal_entries (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null default private.current_user_organization_id(),
 entry_number bigint generated always as identity,
 entry_date date not null,
 description text, source_type text not null default 'MANUAL', source_id uuid,
 status text not null default 'POSTED' check(status in('DRAFT','POSTED','VOIDED')),
 created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create table if not exists public.journal_lines (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null default private.current_user_organization_id(),
 journal_entry_id uuid not null references public.journal_entries(id),
 account_id uuid not null references public.chart_of_accounts(id),
 debit numeric not null default 0 check(debit>=0),
 credit numeric not null default 0 check(credit>=0),
 description text, created_at timestamptz not null default now(),
 check((debit=0 and credit>0) or (credit=0 and debit>0))
);
alter table public.expenses add column if not exists financial_account_id uuid references public.financial_accounts(id), add column if not exists expense_account_id uuid references public.chart_of_accounts(id), add column if not exists status text not null default 'POSTED', add column if not exists transaction_kind text not null default 'POSTED', add column if not exists reversed_expense_id uuid references public.expenses(id), add column if not exists created_by uuid default auth.uid();

alter table public.chart_of_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.expenses enable row level security;

drop policy if exists chart_of_accounts_all on public.chart_of_accounts;
create policy chart_of_accounts_all on public.chart_of_accounts for all to authenticated using(organization_id=private.current_user_organization_id()) with check(organization_id=private.current_user_organization_id());
drop policy if exists journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries for select to authenticated using(organization_id=private.current_user_organization_id());
drop policy if exists journal_lines_select on public.journal_lines;
create policy journal_lines_select on public.journal_lines for select to authenticated using(organization_id=private.current_user_organization_id());
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated using(organization_id=private.current_user_organization_id());

revoke insert,update,delete,truncate on public.journal_entries,public.journal_lines,public.expenses from anon,authenticated;
grant select on public.chart_of_accounts,public.journal_entries,public.journal_lines,public.expenses to authenticated;

create index if not exists journal_entries_org_date_idx on public.journal_entries(organization_id,entry_date desc);
create index if not exists journal_lines_entry_idx on public.journal_lines(journal_entry_id);
create index if not exists journal_lines_account_idx on public.journal_lines(organization_id,account_id);

insert into public.chart_of_accounts(organization_id,code,name,account_type)
select o.id,'1100','صندوق و بانک','ASSET' from organizations o where not exists(select 1 from chart_of_accounts c where c.organization_id=o.id and c.code='1100');
insert into public.chart_of_accounts(organization_id,code,name,account_type)
select o.id,'1200','حساب‌های دریافتنی','ASSET' from organizations o where not exists(select 1 from chart_of_accounts c where c.organization_id=o.id and c.code='1200');
insert into public.chart_of_accounts(organization_id,code,name,account_type)
select o.id,'2100','حساب‌های پرداختنی','LIABILITY' from organizations o where not exists(select 1 from chart_of_accounts c where c.organization_id=o.id and c.code='2100');
insert into public.chart_of_accounts(organization_id,code,name,account_type)
select o.id,'4100','فروش','REVENUE' from organizations o where not exists(select 1 from chart_of_accounts c where c.organization_id=o.id and c.code='4100');
insert into public.chart_of_accounts(organization_id,code,name,account_type)
select o.id,'5100','هزینه‌های عمومی','EXPENSE' from organizations o where not exists(select 1 from chart_of_accounts c where c.organization_id=o.id and c.code='5100');

create or replace view public.account_balances as
select a.id account_id,a.organization_id,a.code,a.name,a.account_type,coalesce(sum(l.debit),0) total_debit,coalesce(sum(l.credit),0) total_credit,
case when a.account_type in('ASSET','EXPENSE') then coalesce(sum(l.debit-l.credit),0) else coalesce(sum(l.credit-l.debit),0) end balance
from chart_of_accounts a left join journal_lines l on l.account_id=a.id and l.organization_id=a.organization_id
left join journal_entries e on e.id=l.journal_entry_id and e.status='POSTED' group by a.id;
create or replace view public.general_ledger as
select e.id journal_entry_id,e.entry_number,e.entry_date,e.description,e.source_type,e.source_id,l.id journal_line_id,l.account_id,a.code account_code,a.name account_name,l.debit,l.credit,l.description line_description
from journal_entries e join journal_lines l on l.journal_entry_id=e.id join chart_of_accounts a on a.id=l.account_id where e.status='POSTED';
grant select on public.account_balances,public.general_ledger to authenticated;
