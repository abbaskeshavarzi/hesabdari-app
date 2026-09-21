begin;
select plan(8);

select ok((select count(*)=1 from pg_trigger where tgname='trg_assert_journal_entry_balanced'),'deferred journal balance trigger exists');
select ok((select count(*)=1 from pg_trigger where tgname='trg_financial_invoice_journal'),'invoice journal trigger exists');
select ok((select count(*)=1 from pg_trigger where tgname='trg_financial_payment_journal'),'payment journal trigger exists');
select ok((select has_function_privilege('authenticated','public.financial_reconciliation()','EXECUTE')),'authenticated can execute reconciliation');
select ok((select not has_function_privilege('authenticated','public._post_sale_journal(uuid,boolean)','EXECUTE')),'internal sale journal helper is not exposed');
select ok((select not has_function_privilege('authenticated','public._post_payment_journal(uuid)','EXECUTE')),'internal payment journal helper is not exposed');
select ok((select not exists(select 1 from public.invoices where payment_status='PARTIAL')),'invalid legacy payment status is absent');
select ok((select coalesce(sum(debit),0)=coalesce(sum(credit),0) from public.journal_lines),'current journal is balanced');
select * from finish();
rollback;