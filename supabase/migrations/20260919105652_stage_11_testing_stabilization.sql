-- Stage 11: testing and stabilization security hardening
-- Keep RPC execution privileges explicit and make reporting/balance views honor caller RLS.

revoke execute on function public.get_reports_data(date,date,integer,integer) from public, anon;
grant execute on function public.get_reports_data(date,date,integer,integer) to authenticated;

revoke execute on function public.get_cash_flow_transactions(date,date,integer,integer) from public, anon;
grant execute on function public.get_cash_flow_transactions(date,date,integer,integer) to authenticated;

revoke execute on function public.get_inventory_report_page(integer,integer) from public, anon;
grant execute on function public.get_inventory_report_page(integer,integer) to authenticated;

revoke execute on function public.post_journal_entry(date,text,jsonb) from public, anon;
grant execute on function public.post_journal_entry(date,text,jsonb) to authenticated;

revoke execute on function public.prevent_direct_stock_qty_change() from public, anon, authenticated;
revoke execute on function public.sync_product_legacy_stock() from public, anon, authenticated;
revoke execute on function public.touch_product_updated_at() from public, anon, authenticated;
revoke execute on function public.touch_warehouse_updated_at() from public, anon, authenticated;

create or replace function public.get_my_profile()
returns jsonb
language sql
stable
set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'organization_id',o.id,
    'organization_name',o.name,
    'role',m.role
  )),'[]'::jsonb)
  from public.organization_members m
  join public.organizations o on o.id=m.organization_id
  where m.user_id=(select auth.uid());
$$;

alter view public.customer_balances set (security_invoker = true);
alter view public.supplier_balances set (security_invoker = true);
alter view public.account_balances set (security_invoker = true);
alter view public.general_ledger set (security_invoker = true);

revoke all on table public.customer_balances, public.supplier_balances, public.account_balances, public.general_ledger from anon;
grant select on table public.customer_balances, public.supplier_balances, public.account_balances, public.general_ledger to authenticated;
