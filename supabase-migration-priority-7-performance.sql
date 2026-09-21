-- Priority 7: performance/scalability indexes only.
-- No business logic changes.
--
-- Goals:
-- - remove duplicate indexes detected by Supabase Performance Advisor
-- - support organization-scoped inventory/journal/payment queries
-- - support common date/category/customer/supplier filters

drop index if exists public.invoices_org_status_issue_date_idx;
drop index if exists public.products_org_id_uidx;

create index if not exists stock_movements_org_warehouse_created_idx
  on public.stock_movements (organization_id, warehouse_id, created_at desc);

create index if not exists journal_lines_org_entry_idx
  on public.journal_lines (organization_id, journal_entry_id);

create index if not exists expenses_org_category_date_idx
  on public.expenses (organization_id, category, expense_date desc);

create index if not exists payments_org_customer_date_idx
  on public.payments (organization_id, customer_id, payment_date desc);

create index if not exists payments_org_supplier_date_idx
  on public.payments (organization_id, supplier_id, payment_date desc);
