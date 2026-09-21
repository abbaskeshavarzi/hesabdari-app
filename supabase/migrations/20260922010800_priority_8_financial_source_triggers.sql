-- Priority 8: source-event journal triggers.
-- Helpers are defined by the preceding Priority 8 financial consistency migration.
create or replace function public._financial_source_journal_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='invoices' then
  if new.status='POSTED' then perform public._post_sale_journal(new.id,false);
  elsif new.status='VOIDED' and old.status='POSTED' then perform public._post_sale_journal(new.id,true);
  end if;
 elsif tg_table_name='payments' then
  perform public._post_payment_journal(new.id);
 end if;
 return new;
end; $$;
drop trigger if exists trg_financial_invoice_journal on public.invoices;
create trigger trg_financial_invoice_journal after insert or update of status on public.invoices for each row execute function public._financial_source_journal_trigger();
drop trigger if exists trg_financial_payment_journal on public.payments;
create trigger trg_financial_payment_journal after insert on public.payments for each row execute function public._financial_source_journal_trigger();
revoke execute on function public._financial_source_journal_trigger() from public,anon,authenticated;