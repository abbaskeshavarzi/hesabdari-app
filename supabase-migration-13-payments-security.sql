
revoke insert, update, delete, truncate on public.payments from public, anon, authenticated;
grant select on public.payments to authenticated;
revoke all on function public.create_payment(text,uuid,uuid,uuid,uuid,numeric,date,text,text,text) from public, anon;
revoke all on function public.reverse_payment(uuid,text) from public, anon;
grant execute on function public.create_payment(text,uuid,uuid,uuid,uuid,numeric,date,text,text,text) to authenticated;
grant execute on function public.reverse_payment(uuid,text) to authenticated;
