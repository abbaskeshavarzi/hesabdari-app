-- Stage 10 — strict schema validation for logical restore.
-- Every exported, writable column must be present in each row. This prevents
-- missing fields from being turned into NULL and accidentally violating or
-- bypassing column defaults/constraints during restore.

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
  v_required_columns text[];
  v_required_column text;
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

    select array_agg(column_name order by ordinal_position)
      into v_required_columns
    from information_schema.columns
    where table_schema='public'
      and table_name=v_table
      and is_generated='NEVER'
      and not (is_identity='YES' and identity_generation='ALWAYS');

    for v_item in select value from jsonb_array_elements(v_rows) loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'رکوردی نامعتبر در جدول % وجود دارد.', v_table;
      end if;

      foreach v_required_column in array coalesce(v_required_columns, array[]::text[]) loop
        if not (v_item ? v_required_column) then
          raise exception 'ستون % در رکورد جدول % وجود ندارد. فایل پشتیبان با ساختار فعلی سازگار نیست.', v_required_column, v_table;
        end if;
      end loop;

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
    'deletes_existing_rows', false,
    'strict_schema_validation', true
  );
end;
$$;


revoke all on function private.validate_business_backup_payload(jsonb) from public, anon;
grant execute on function private.validate_business_backup_payload(jsonb) to authenticated;
