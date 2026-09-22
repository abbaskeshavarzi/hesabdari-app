begin;
select plan(5);
select ok((select count(*)=2 from public.stock_movements where organization_id='7c138229-3d5a-4455-b675-b203d5b28232' and reference_type='RECONCILIATION' and movement_type='ADJUSTMENT' and reason='Production reconciliation: opening stock omitted during warehouse_stock bootstrap'),'two reconciliation movements exist');
select ok((select sum(change_qty)=86 from public.stock_movements where organization_id='7c138229-3d5a-4455-b675-b203d5b28232' and reference_type='RECONCILIATION'),'reconciliation delta totals 86');
select ok((select count(*)=0 from (select ws.warehouse_id,ws.product_id from public.warehouse_stock ws left join public.stock_movements sm on sm.organization_id=ws.organization_id and sm.warehouse_id=ws.warehouse_id and sm.product_id=ws.product_id group by ws.warehouse_id,ws.product_id,ws.quantity having ws.quantity<>coalesce(sum(sm.change_qty),0)) x),'all warehouse stock rows reconcile');
select ok((select not exists(select 1 from public.warehouse_stock where quantity<0)),'no negative warehouse stock');
select ok((select count(*)=0 from public.stock_movements where reference_type='RECONCILIATION' and created_by is not null),'reconciliation is system-attributed');
select * from finish();
rollback;