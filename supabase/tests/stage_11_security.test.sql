begin;

select plan(8);

select ok(
  (select count(*) = 0 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and c.relrowsecurity is false
   and c.relname in ('organizations','organization_members','customers','suppliers','products','warehouses',
     'warehouse_stock','stock_movements','invoices','invoice_items','payments','expenses',
     'financial_accounts','chart_of_accounts','journal_entries','journal_lines','audit_logs')),
  'all protected public tables have RLS enabled'
);

select ok(
  not has_function_privilege('anon','public.get_reports_data(date,date,integer,integer)','EXECUTE'),
  'anon cannot execute get_reports_data'
);

select ok(
  not has_function_privilege('anon','public.get_cash_flow_transactions(date,date,integer,integer)','EXECUTE'),
  'anon cannot execute get_cash_flow_transactions'
);

select ok(
  not has_function_privilege('anon','public.get_inventory_report_page(integer,integer)','EXECUTE'),
  'anon cannot execute get_inventory_report_page'
);

select ok(
  not has_function_privilege('anon','public.post_journal_entry(date,text,jsonb)','EXECUTE'),
  'anon cannot execute post_journal_entry'
);

select ok(
  not has_function_privilege('anon','public.prevent_direct_stock_qty_change()','EXECUTE')
  and not has_function_privilege('anon','public.sync_product_legacy_stock()','EXECUTE'),
  'trigger-only security definer functions are not exposed to anon'
);

select ok(
  (select reloptions @> array['security_invoker=true'] from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='customer_balances'),
  'customer_balances uses security_invoker'
);

select ok(
  (select count(*) = 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='invoices'
     and exists (select 1 from pg_index i where i.indrelid=c.oid and i.indisunique
       and pg_get_indexdef(i.indexrelid) like '%(organization_id, invoice_number)%')),
  'invoice number uniqueness is organization-scoped'
);

select * from finish();
rollback;
