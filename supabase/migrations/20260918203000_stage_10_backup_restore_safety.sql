-- Stage 10 — Backup, Restore & Data Safety
-- Application-level business backup with strict validation and transactional,
-- merge-safe restore. Existing records are never updated or deleted.

create or replace function private.validate_business_backup_payload(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org uuid := private.current_user_organization_id();
  v_payload_org uuid;
  v_table text;
  v_rows jsonb;
  v_item jsonb;
  v_allowed text[] := array[
    'business_settings','customers','suppliers','products','warehouses',
    'warehouse_stock','invoices','invoice_items','stock_movements',
    'financial_accounts','chart_of_accounts','payments','expenses',
    'journal_entries','journal_lines'
  ];
  v_errors jsonb := '[]'::jsonb;
  v_counts jsonb := '{}'::jsonb;
begin
  if v_org is null then
    raise exception 'حساب سازمانی فعال یافت نشد.';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'ساختار فایل پشتیبان معتبر نیست.';
  end if;

  if coalesce(p_payload->>'format','') <> 'hesabdari-business-backup' then
    raise exception 'فرمت فایل پشتیبان متعلق به این نرم‌افزار نیست.';
  end if;

  if coalesce((p_payload->>'version')::int,0) <> 1 then
    raise exception 'نسخه فایل پشتیبان با نسخه فعلی نرم‌افزار سازگار نیست.';
  end if;

  if jsonb_typeof(p_payload->'tables') <> 'object' then
    raise exception 'بخش tables در فایل پشتیبان معتبر نیست.';
  end if;

  begin
    v_payload_org := (p_payload->>'organization_id')::uuid;
  exception when others then
    raise exception 'شناسه سازمان در فایل پشتیبان معتبر نیست.';
  end;

  if v_payload_org is distinct from v_org then
    raise exception 'این فایل متعلق به سازمان دیگری است و قابل بازیابی در این حساب نیست.';
  end if;

  if pg_column_size(p_payload) > 52428800 then
    raise exception 'حجم فایل پشتیبان بیش از حد مجاز است.';
  end if;

  for v_table in select jsonb_object_keys(p_payload->'tables') loop
    if not (v_table = any(v_allowed)) then
      raise exception 'جدول غیرمجاز در فایل پشتیبان: %', v_table;
    end if;
  end loop;

  for v_table in select unnest(v_allowed) loop
    v_rows := coalesce(p_payload->'tables'->v_table, '[]'::jsonb);

    if jsonb_typeof(v_rows) <> 'array' then
      raise exception 'داده جدول % باید آرایه باشد.', v_table;
    end if;

    if jsonb_array_length(v_rows) > 100000 then
      raise exception 'تعداد رکوردهای جدول % بیش از حد مجاز است.', v_table;
    end if;

    for v_item in select value from jsonb_array_elements(v_rows) loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'رکوردی نامعتبر در جدول % وجود دارد.', v_table;
      end if;

      if not (v_item ? 'id') or v_item->>'id' is null or btrim(v_item->>'id') = '' then
        raise exception 'رکورد بدون شناسه در جدول % وجود دارد.', v_table;
      end if;

      if not (v_item ? 'organization_id') or (v_item->>'organization_id')::uuid is distinct from v_org then
        raise exception 'رکوردی با سازمان نامعتبر در جدول % وجود دارد.', v_table;
      end if;
    end loop;

    if jsonb_array_length(v_rows) >
       (select count(distinct value->>'id') from jsonb_array_elements(v_rows)) then
      raise exception 'شناسه تکراری داخل جدول % وجود دارد.', v_table;
    end if;

    v_counts := v_counts || jsonb_build_object(v_table, jsonb_array_length(v_rows));
  end loop;

  return jsonb_build_object(
    'valid', true,
    'organization_id', v_org,
    'table_counts', v_counts,
    'restore_mode', 'MERGE_SAFE',
    'updates_existing_rows', false,
    'deletes_existing_rows', false
  );
end;
$$;

revoke all on function private.validate_business_backup_payload(jsonb) from public, anon;
grant execute on function private.validate_business_backup_payload(jsonb) to authenticated;

create or replace function public.validate_business_backup(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
begin
  if not private.has_permission('backup.view') then
    raise exception 'دسترسی مشاهده پشتیبان‌گیری مجاز نیست.';
  end if;
  return private.validate_business_backup_payload(p_payload);
end;
$$;

revoke all on function public.validate_business_backup(jsonb) from public, anon;
grant execute on function public.validate_business_backup(jsonb) to authenticated;

create or replace function private.restore_business_backup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_validation jsonb;
  v_org uuid := private.current_user_organization_id();
  v_table text;
  v_rows jsonb;
  v_columns text;
  v_select_columns text;
  v_sql text;
  v_inserted bigint := 0;
  v_table_inserted bigint;
  v_self_id text;
  v_self_ids text[];
  v_result jsonb := '{}'::jsonb;
begin
  if v_org is null then
    raise exception 'حساب سازمانی فعال یافت نشد.';
  end if;

  if not private.has_permission('backup.restore') then
    raise exception 'دسترسی بازیابی پشتیبان مجاز نیست.';
  end if;

  -- Serialize restores for the same organization so two imports cannot race.
  perform pg_advisory_xact_lock(hashtextextended(v_org::text, 104729));

  v_validation := private.validate_business_backup_payload(p_payload);

  create temp table if not exists restore_inserted_ids (
    table_name text not null,
    record_id text not null
  ) on commit drop;

  -- Parent/master data first.
  foreach v_table in array[
    'business_settings','customers','suppliers','products','warehouses',
    'financial_accounts'
  ] loop
    v_rows := coalesce(p_payload->'tables'->v_table, '[]'::jsonb);
    if jsonb_array_length(v_rows) = 0 then continue; end if;

    select
      string_agg(format('%I', column_name), ', ' order by ordinal_position),
      string_agg(format('(r).%I', column_name), ', ' order by ordinal_position)
    into v_columns, v_select_columns
    from information_schema.columns
    where table_schema='public'
      and table_name=v_table
      and is_generated='NEVER'
      and not (is_identity='YES' and identity_generation='ALWAYS');

    v_sql := format(
      'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I,$1) r on conflict do nothing returning id::text',
      v_table, v_columns, v_select_columns, v_table
    );

    for v_self_id in execute v_sql using v_rows loop
      insert into restore_inserted_ids(table_name,record_id) values(v_table,v_self_id);
      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  -- Chart of accounts is inserted without parent links first, then links are
  -- restored only for rows newly inserted by this operation.
  v_rows := coalesce(p_payload->'tables'->'chart_of_accounts', '[]'::jsonb);
  if jsonb_array_length(v_rows) > 0 then
    for v_self_id in
      insert into public.chart_of_accounts
        (id,organization_id,code,name,account_type,parent_id,is_active,created_at)
      select r.id,r.organization_id,r.code,r.name,r.account_type,null,r.is_active,r.created_at
      from jsonb_populate_recordset(null::public.chart_of_accounts,v_rows) r
      on conflict do nothing
      returning id::text
    loop
      insert into restore_inserted_ids(table_name,record_id)
      values('chart_of_accounts',v_self_id);
      v_inserted := v_inserted + 1;
    end loop;

    update public.chart_of_accounts c
       set parent_id = r.parent_id
      from jsonb_populate_recordset(null::public.chart_of_accounts,v_rows) r
     where c.id=r.id
       and c.organization_id=v_org
       and exists (
         select 1 from restore_inserted_ids x
         where x.table_name='chart_of_accounts' and x.record_id=c.id::text
       );
  end if;

  -- Invoices and their items.
  foreach v_table in array['invoices','invoice_items','warehouse_stock','stock_movements'] loop
    v_rows := coalesce(p_payload->'tables'->v_table, '[]'::jsonb);
    if jsonb_array_length(v_rows) = 0 then continue; end if;

    select
      string_agg(format('%I', column_name), ', ' order by ordinal_position),
      string_agg(format('(r).%I', column_name), ', ' order by ordinal_position)
    into v_columns, v_select_columns
    from information_schema.columns
    where table_schema='public'
      and table_name=v_table
      and is_generated='NEVER'
      and not (is_identity='YES' and identity_generation='ALWAYS');

    v_sql := format(
      'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I,$1) r on conflict do nothing returning id::text',
      v_table, v_columns, v_select_columns, v_table
    );

    for v_self_id in execute v_sql using v_rows loop
      insert into restore_inserted_ids(table_name,record_id) values(v_table,v_self_id);
      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  -- Self-referencing financial rows: insert without reversal links first.
  foreach v_table in array['payments','expenses'] loop
    v_rows := coalesce(p_payload->'tables'->v_table, '[]'::jsonb);
    if jsonb_array_length(v_rows) = 0 then continue; end if;

    select
      string_agg(format('%I', column_name), ', ' order by ordinal_position),
      string_agg(format('(r).%I', column_name), ', ' order by ordinal_position)
    into v_columns, v_select_columns
    from information_schema.columns
    where table_schema='public'
      and table_name=v_table
      and column_name not in ('reversed_payment_id','reversed_expense_id')
      and is_generated='NEVER'
      and not (is_identity='YES' and identity_generation='ALWAYS');

    v_sql := format(
      'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I,$1) r on conflict do nothing returning id::text',
      v_table, v_columns, v_select_columns, v_table
    );

    for v_self_id in execute v_sql using v_rows loop
      insert into restore_inserted_ids(table_name,record_id) values(v_table,v_self_id);
      v_inserted := v_inserted + 1;
    end loop;

    if v_table='payments' then
      update public.payments p
         set reversed_payment_id = r.reversed_payment_id
        from jsonb_populate_recordset(null::public.payments,v_rows) r
       where p.id=r.id
         and p.organization_id=v_org
         and exists (
           select 1 from restore_inserted_ids x
           where x.table_name='payments' and x.record_id=p.id::text
         );
    else
      update public.expenses e
         set reversed_expense_id = r.reversed_expense_id
        from jsonb_populate_recordset(null::public.expenses,v_rows) r
       where e.id=r.id
         and e.organization_id=v_org
         and exists (
           select 1 from restore_inserted_ids x
           where x.table_name='expenses' and x.record_id=e.id::text
         );
    end if;
  end loop;

  -- Journal headers are inserted without sequence-generated entry_number.
  v_rows := coalesce(p_payload->'tables'->'journal_entries', '[]'::jsonb);
  if jsonb_array_length(v_rows) > 0 then
    for v_self_id in
      insert into public.journal_entries
        (id,organization_id,entry_date,description,source_type,source_id,status,created_by,created_at)
      select r.id,r.organization_id,r.entry_date,r.description,r.source_type,r.source_id,r.status,r.created_by,r.created_at
      from jsonb_populate_recordset(null::public.journal_entries,v_rows) r
      on conflict do nothing
      returning id::text
    loop
      insert into restore_inserted_ids(table_name,record_id)
      values('journal_entries',v_self_id);
      v_inserted := v_inserted + 1;
    end loop;
  end if;

  -- Journal lines are restored last.
  v_rows := coalesce(p_payload->'tables'->'journal_lines', '[]'::jsonb);
  if jsonb_array_length(v_rows) > 0 then
    select
      string_agg(format('%I', column_name), ', ' order by ordinal_position),
      string_agg(format('(r).%I', column_name), ', ' order by ordinal_position)
    into v_columns, v_select_columns
    from information_schema.columns
    where table_schema='public'
      and table_name='journal_lines'
      and is_generated='NEVER'
      and not (is_identity='YES' and identity_generation='ALWAYS');

    v_sql := format(
      'insert into public.journal_lines (%s) select %s from jsonb_populate_recordset(null::public.journal_lines,$1) r on conflict do nothing returning id::text',
      v_columns, v_select_columns
    );

    for v_self_id in execute v_sql using v_rows loop
      insert into restore_inserted_ids(table_name,record_id) values('journal_lines',v_self_id);
      v_inserted := v_inserted + 1;
    end loop;
  end if;

  -- Strong post-restore consistency checks. Any failure aborts the entire
  -- transaction, so a partial restore can never be committed.
  if exists (
    select 1
    from public.journal_entries e
    where e.organization_id=v_org
      and e.status='POSTED'
      and exists (
        select 1 from public.journal_lines l
        where l.journal_entry_id=e.id
        group by l.journal_entry_id
        having sum(l.debit) <> sum(l.credit)
      )
  ) then
    raise exception 'بازیابی متوقف شد: حداقل یک سند حسابداری نامتوازن است.';
  end if;

  if exists (
    select 1 from public.invoice_items ii
    where ii.organization_id=v_org
      and not exists (select 1 from public.invoices i where i.id=ii.invoice_id and i.organization_id=v_org)
  ) then
    raise exception 'بازیابی متوقف شد: آیتم فاکتور بدون فاکتور معتبر وجود دارد.';
  end if;

  if exists (
    select 1 from public.warehouse_stock ws
    where ws.organization_id=v_org
      and (
        not exists (select 1 from public.warehouses w where w.id=ws.warehouse_id and w.organization_id=v_org)
        or not exists (select 1 from public.products p where p.id=ws.product_id and p.organization_id=v_org)
      )
  ) then
    raise exception 'بازیابی متوقف شد: موجودی انبار دارای مرجع نامعتبر است.';
  end if;

  if exists (
    select 1 from public.stock_movements sm
    where sm.organization_id=v_org
      and (
        not exists (select 1 from public.products p where p.id=sm.product_id and p.organization_id=v_org)
        or (sm.warehouse_id is not null and not exists (
          select 1 from public.warehouses w where w.id=sm.warehouse_id and w.organization_id=v_org
        ))
      )
  ) then
    raise exception 'بازیابی متوقف شد: گردش انبار دارای مرجع نامعتبر است.';
  end if;

  v_result := jsonb_build_object(
    'success', true,
    'mode', 'MERGE_SAFE',
    'inserted_rows', v_inserted,
    'updated_rows', 0,
    'deleted_rows', 0,
    'validation', v_validation,
    'post_restore', jsonb_build_object(
      'valid', true,
      'journal_unbalanced_entries', 0,
      'orphan_invoice_items', 0,
      'orphan_warehouse_stock', 0,
      'orphan_stock_movements', 0
    )
  );

  return v_result;
end;
$$;

revoke all on function private.restore_business_backup(jsonb) from public, anon;
grant execute on function private.restore_business_backup(jsonb) to authenticated;

create or replace function public.restore_business_backup(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
begin
  if not private.has_permission('backup.restore') then
    raise exception 'دسترسی بازیابی پشتیبان مجاز نیست.';
  end if;
  return private.restore_business_backup(p_payload);
end;
$$;

revoke all on function public.restore_business_backup(jsonb) from public, anon;
grant execute on function public.restore_business_backup(jsonb) to authenticated;
