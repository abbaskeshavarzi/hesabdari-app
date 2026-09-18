
-- Stage 6 — Payments & Receivables
-- Atomic financial transactions, immutable payment history, customer receipts,
-- supplier payments, financial accounts and reversal support.

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_user_organization_id(),
  name text not null,
  account_type text not null default 'CASH'
    check (account_type in ('CASH','BANK','CARD','OTHER')),
  account_number text,
  opening_balance numeric not null default 0
    check (opening_balance >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_accounts_org_fk
    foreign key (organization_id) references public.organizations(id)
);

alter table public.payments
  add column if not exists direction text not null default 'RECEIPT',
  add column if not exists transaction_kind text not null default 'POSTED',
  add column if not exists supplier_id uuid,
  add column if not exists financial_account_id uuid,
  add column if not exists invoice_id uuid,
  add column if not exists payment_method text not null default 'OTHER',
  add column if not exists tracking_number text,
  add column if not exists reversed_payment_id uuid,
  add column if not exists created_by uuid default auth.uid();

alter table public.payments
  drop constraint if exists payments_direction_check,
  drop constraint if exists payments_transaction_kind_check,
  drop constraint if exists payments_payment_method_check,
  drop constraint if exists payments_amount_positive_check;

alter table public.payments
  add constraint payments_direction_check
    check (direction in ('RECEIPT','PAYMENT')),
  add constraint payments_transaction_kind_check
    check (transaction_kind in ('POSTED','REVERSAL')),
  add constraint payments_payment_method_check
    check (payment_method in ('CASH','CARD','BANK_TRANSFER','CHECK','OTHER')),
  add constraint payments_amount_positive_check
    check (amount > 0);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_supplier_fk') then
    alter table public.payments add constraint payments_supplier_fk
      foreign key (supplier_id) references public.suppliers(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_financial_account_fk') then
    alter table public.payments add constraint payments_financial_account_fk
      foreign key (financial_account_id) references public.financial_accounts(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_invoice_fk') then
    alter table public.payments add constraint payments_invoice_fk
      foreign key (invoice_id) references public.invoices(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_reversal_fk') then
    alter table public.payments add constraint payments_reversal_fk
      foreign key (reversed_payment_id) references public.payments(id);
  end if;
end $$;

create index if not exists payments_org_date_idx on public.payments(organization_id, payment_date desc);
create index if not exists payments_org_customer_idx on public.payments(organization_id, customer_id);
create index if not exists payments_org_supplier_idx on public.payments(organization_id, supplier_id);
create index if not exists payments_org_invoice_idx on public.payments(organization_id, invoice_id);
create index if not exists payments_org_account_idx on public.payments(organization_id, financial_account_id);
create unique index if not exists payments_one_reversal_per_original_idx
  on public.payments(reversed_payment_id) where reversed_payment_id is not null;
create index if not exists financial_accounts_org_active_idx
  on public.financial_accounts(organization_id,is_active);

alter table public.financial_accounts enable row level security;

drop policy if exists financial_accounts_all on public.financial_accounts;
create policy financial_accounts_all on public.financial_accounts
  for all to authenticated
  using (organization_id = private.current_user_organization_id())
  with check (organization_id = private.current_user_organization_id());

drop policy if exists payments_all on public.payments;
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (organization_id = private.current_user_organization_id());

revoke insert, update, delete, truncate on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
grant select, insert, update, delete on public.financial_accounts to authenticated;

create or replace function public.create_payment(
  p_direction text,p_customer_id uuid,p_supplier_id uuid,p_invoice_id uuid,
  p_financial_account_id uuid,p_amount numeric,p_payment_date date,
  p_payment_method text,p_tracking_number text,p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_user_organization_id();
  v_id uuid;
  v_invoice_customer uuid;
  v_invoice_total numeric;
  v_paid numeric;
begin
  if v_org is null then raise exception 'حساب سازمانی فعال یافت نشد.'; end if;
  if p_direction not in ('RECEIPT','PAYMENT') then raise exception 'نوع تراکنش مالی نامعتبر است.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'مبلغ تراکنش باید بیشتر از صفر باشد.'; end if;
  if p_payment_method not in ('CASH','CARD','BANK_TRANSFER','CHECK','OTHER') then raise exception 'روش پرداخت نامعتبر است.'; end if;

  perform 1 from public.financial_accounts
   where id=p_financial_account_id and organization_id=v_org and is_active=true for update;
  if not found then raise exception 'حساب مالی انتخاب‌شده معتبر یا فعال نیست.'; end if;

  if p_direction='RECEIPT' then
    if p_customer_id is null or p_supplier_id is not null then raise exception 'دریافت باید به یک مشتری متصل باشد.'; end if;
  else
    if p_supplier_id is null or p_customer_id is not null then raise exception 'پرداخت باید به یک تأمین‌کننده متصل باشد.'; end if;
    if p_invoice_id is not null then raise exception 'پرداخت تأمین‌کننده فعلاً به فاکتور خرید متصل نمی‌شود.'; end if;
  end if;

  if p_customer_id is not null then
    perform 1 from public.customers where id=p_customer_id and organization_id=v_org for update;
    if not found then raise exception 'مشتری انتخاب‌شده معتبر نیست.'; end if;
  end if;

  if p_supplier_id is not null then
    perform 1 from public.suppliers where id=p_supplier_id and organization_id=v_org for update;
    if not found then raise exception 'تأمین‌کننده انتخاب‌شده معتبر نیست.'; end if;
  end if;

  if p_invoice_id is not null then
    select customer_id,total_amount into v_invoice_customer,v_invoice_total
      from public.invoices
     where id=p_invoice_id and organization_id=v_org and status='POSTED' for update;
    if not found then raise exception 'فاکتور انتخاب‌شده معتبر یا ثبت‌شده نیست.'; end if;
    if v_invoice_customer is distinct from p_customer_id then raise exception 'مشتری پرداخت با مشتری فاکتور یکسان نیست.'; end if;

    select coalesce(sum(case
      when direction='RECEIPT' and transaction_kind='POSTED' then amount
      when direction='PAYMENT' and transaction_kind='REVERSAL' then amount
      when direction='PAYMENT' and transaction_kind='POSTED' then -amount
      when direction='RECEIPT' and transaction_kind='REVERSAL' then -amount
      else 0 end),0)
      into v_paid
      from public.payments where organization_id=v_org and invoice_id=p_invoice_id;

    if p_amount > greatest(v_invoice_total-v_paid,0) then raise exception 'مبلغ دریافت از مانده فاکتور بیشتر است.'; end if;
  end if;

  insert into public.payments (
    organization_id,direction,transaction_kind,customer_id,supplier_id,
    financial_account_id,invoice_id,amount,payment_date,payment_method,
    tracking_number,note,created_by
  ) values (
    v_org,p_direction,'POSTED',p_customer_id,p_supplier_id,p_financial_account_id,
    p_invoice_id,p_amount,coalesce(p_payment_date,current_date),p_payment_method,
    nullif(trim(p_tracking_number),''),nullif(trim(p_note),''),auth.uid()
  ) returning id into v_id;

  if p_invoice_id is not null then
    select coalesce(sum(case
      when direction='RECEIPT' and transaction_kind='POSTED' then amount
      when direction='PAYMENT' and transaction_kind='REVERSAL' then amount
      when direction='PAYMENT' and transaction_kind='POSTED' then -amount
      when direction='RECEIPT' and transaction_kind='REVERSAL' then -amount
      else 0 end),0)
      into v_paid from public.payments
     where organization_id=v_org and invoice_id=p_invoice_id;

    update public.invoices
       set payment_status=case
         when v_paid>=total_amount then 'PAID'
         when v_paid>0 then 'PARTIAL'
         else 'UNPAID' end
     where id=p_invoice_id and organization_id=v_org;
  end if;

  return v_id;
end;
$$;

create or replace function public.reverse_payment(p_payment_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_user_organization_id();
  v_original public.payments%rowtype;
  v_id uuid;
  v_new_direction text;
  v_invoice_paid numeric;
begin
  select * into v_original from public.payments
   where id=p_payment_id and organization_id=v_org and transaction_kind='POSTED' for update;
  if not found then raise exception 'تراکنش قابل برگشت یافت نشد.'; end if;

  if exists (select 1 from public.payments where reversed_payment_id=p_payment_id) then
    raise exception 'این تراکنش قبلاً برگشت خورده است.';
  end if;

  perform 1 from public.financial_accounts
   where id=v_original.financial_account_id and organization_id=v_org for update;

  v_new_direction=case when v_original.direction='RECEIPT' then 'PAYMENT' else 'RECEIPT' end;

  insert into public.payments (
    organization_id,direction,transaction_kind,customer_id,supplier_id,
    financial_account_id,invoice_id,amount,payment_date,payment_method,
    tracking_number,note,reversed_payment_id,created_by
  ) values (
    v_org,v_new_direction,'REVERSAL',v_original.customer_id,v_original.supplier_id,
    v_original.financial_account_id,v_original.invoice_id,v_original.amount,current_date,
    v_original.payment_method,v_original.tracking_number,
    coalesce(nullif(trim(p_reason),''),'برگشت تراکنش'),v_original.id,auth.uid()
  ) returning id into v_id;

  if v_original.invoice_id is not null then
    select coalesce(sum(case
      when direction='RECEIPT' and transaction_kind='POSTED' then amount
      when direction='PAYMENT' and transaction_kind='REVERSAL' then amount
      when direction='PAYMENT' and transaction_kind='POSTED' then -amount
      when direction='RECEIPT' and transaction_kind='REVERSAL' then -amount
      else 0 end),0)
      into v_invoice_paid from public.payments
     where organization_id=v_org and invoice_id=v_original.invoice_id;

    update public.invoices
       set payment_status=case
         when v_invoice_paid>=total_amount then 'PAID'
         when v_invoice_paid>0 then 'PARTIAL'
         else 'UNPAID' end
     where id=v_original.invoice_id and organization_id=v_org;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_payment(text,uuid,uuid,uuid,uuid,numeric,date,text,text,text) from public,anon;
revoke all on function public.reverse_payment(uuid,text) from public,anon;
grant execute on function public.create_payment(text,uuid,uuid,uuid,uuid,numeric,date,text,text,text) to authenticated;
grant execute on function public.reverse_payment(uuid,text) to authenticated;

drop view if exists public.financial_account_balances;
create view public.financial_account_balances with (security_invoker=true) as
select a.id financial_account_id,a.organization_id,a.name,a.account_type,a.account_number,
  a.opening_balance,a.is_active,
  a.opening_balance+coalesce(sum(case when p.direction='RECEIPT' then p.amount else -p.amount end),0) balance
from public.financial_accounts a
left join public.payments p on p.financial_account_id=a.id and p.organization_id=a.organization_id
group by a.id;

drop view if exists public.customer_balances;
create view public.customer_balances with (security_invoker=true) as
select c.id customer_id,c.organization_id,c.name,c.phone,c.mobile,c.address,
  c.economic_code,c.customer_code,c.notes,c.created_at,c.updated_at,
  coalesce(inv.total_invoiced,0)-coalesce(pay.total_paid,0) balance
from public.customers c
left join (
  select organization_id,customer_id,sum(total_amount) total_invoiced
  from public.invoices where status='POSTED' and customer_id is not null
  group by organization_id,customer_id
) inv on inv.organization_id=c.organization_id and inv.customer_id=c.id
left join (
  select organization_id,customer_id,sum(case when direction='RECEIPT' then amount else -amount end) total_paid
  from public.payments where customer_id is not null
  group by organization_id,customer_id
) pay on pay.organization_id=c.organization_id and pay.customer_id=c.id;

drop view if exists public.customer_transactions;
create view public.customer_transactions with (security_invoker=true) as
select i.organization_id,i.customer_id,i.id transaction_id,i.issue_date transaction_date,
  'invoice' transaction_type,coalesce(i.invoice_number,'') reference,i.total_amount amount,i.description note
from public.invoices i where i.customer_id is not null and i.status='POSTED'
union all
select p.organization_id,p.customer_id,p.id transaction_id,p.payment_date transaction_date,
  case when p.transaction_kind='REVERSAL' then 'payment_reversal' else 'payment' end transaction_type,
  coalesce(p.tracking_number,'') reference,
  case when p.direction='RECEIPT' then -p.amount else p.amount end amount,p.note
from public.payments p where p.customer_id is not null;

drop view if exists public.supplier_balances;
create view public.supplier_balances with (security_invoker=true) as
select s.id supplier_id,s.organization_id,s.name,s.phone,s.mobile,s.address,
  s.economic_code,s.supplier_code,s.notes,s.created_at,s.updated_at,
  coalesce(pay.total_paid,0)*-1 balance
from public.suppliers s
left join (
  select organization_id,supplier_id,sum(case when direction='PAYMENT' then amount else -amount end) total_paid
  from public.payments where supplier_id is not null
  group by organization_id,supplier_id
) pay on pay.organization_id=s.organization_id and pay.supplier_id=s.id;
