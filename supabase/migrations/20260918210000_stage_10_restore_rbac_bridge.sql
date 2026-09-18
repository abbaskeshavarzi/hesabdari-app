-- Stage 10 — allow the explicit backup.restore capability to execute
-- the transactional restore path through existing RBAC write triggers.
-- backup.restore is granted only to OWNER and ADMIN.

create or replace function private.enforce_rbac_write()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org uuid;
  v_permission text;
  v_movement text;
  v_ref text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;

  v_org := coalesce(
    case when TG_OP in('INSERT','UPDATE') then (to_jsonb(NEW)->>'organization_id')::uuid end,
    case when TG_OP='DELETE' then (to_jsonb(OLD)->>'organization_id')::uuid end
  );

  if TG_TABLE_NAME in('customers','suppliers','products') then
    v_permission := case TG_OP
      when 'INSERT' then TG_TABLE_NAME||'.create'
      when 'UPDATE' then TG_TABLE_NAME||'.update'
      when 'DELETE' then TG_TABLE_NAME||'.delete'
    end;
  elsif TG_TABLE_NAME='invoices' then
    if TG_OP='INSERT' then v_permission:='invoices.create';
    elsif TG_OP='DELETE' then v_permission:='invoices.delete';
    else
      v_permission := case
        when (to_jsonb(OLD)->>'status')='DRAFT' and (to_jsonb(NEW)->>'status')='POSTED' then 'invoices.post'
        when (to_jsonb(OLD)->>'status')<>'VOIDED' and (to_jsonb(NEW)->>'status')='VOIDED' then 'invoices.void'
        else 'invoices.update'
      end;
    end if;
  elsif TG_TABLE_NAME='invoice_items' then
    v_permission := case when TG_OP='INSERT' then 'invoices.create' else 'invoices.update' end;
  elsif TG_TABLE_NAME='payments' then
    v_permission := case when TG_OP='INSERT' then 'payments.create' else '__never__' end;
  elsif TG_TABLE_NAME='expenses' then
    v_permission := case when TG_OP='INSERT' then 'expenses.create' else '__never__' end;
  elsif TG_TABLE_NAME='financial_accounts' then
    v_permission := 'financial_accounts.manage';
  elsif TG_TABLE_NAME='business_settings' then
    v_permission := case when TG_OP='UPDATE' then 'settings.update' else '__never__' end;
  elsif TG_TABLE_NAME='warehouses' then
    v_permission := 'inventory.manage';
  elsif TG_TABLE_NAME='stock_movements' then
    if TG_OP<>'INSERT' then
      v_permission:='__never__';
    else
      v_movement:=to_jsonb(NEW)->>'movement_type';
      v_ref:=to_jsonb(NEW)->>'reference_type';
      v_permission:=case
        when v_ref='invoice' and v_movement='SALE' then 'invoices.post'
        when v_ref='invoice' and v_movement='RETURN' then 'invoices.void'
        when v_movement in('IN','OUT') then 'inventory.create'
        when v_movement='ADJUSTMENT' then 'inventory.adjust'
        when v_movement in('TRANSFER_IN','TRANSFER_OUT') then 'inventory.transfer'
        else '__never__'
      end;
    end if;
  elsif TG_TABLE_NAME='organization_members' then
    v_permission:='users.manage';
  else
    return coalesce(NEW,OLD);
  end if;

  -- A restore is an explicitly privileged operation. It is still protected
  -- by the public restore RPC and the database function's organization check.
  if private.has_permission('backup.restore',v_org) then
    return coalesce(NEW,OLD);
  end if;

  if not private.has_permission(v_permission,v_org) then
    raise exception 'permission denied';
  end if;

  return coalesce(NEW,OLD);
end;
$$;

revoke all on function private.enforce_rbac_write() from public, anon, authenticated;
grant execute on function private.enforce_rbac_write() to authenticated;
