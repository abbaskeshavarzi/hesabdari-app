-- Stage 4: transaction-safe inventory operations and invoice stock integration

create or replace function public._ensure_warehouse_stock(p_organization_id uuid,p_warehouse_id uuid,p_product_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 insert into public.warehouse_stock(organization_id,warehouse_id,product_id,quantity) values(p_organization_id,p_warehouse_id,p_product_id,0) on conflict(warehouse_id,product_id) do nothing;
end; $$;

create or replace function public._change_stock(p_warehouse_id uuid,p_product_id uuid,p_delta numeric,p_movement_type text,p_reason text,p_reference_type text default null,p_reference_id uuid default null) returns numeric
language plpgsql security definer set search_path=public as $$
declare v_org uuid:=private.current_user_organization_id(); v_qty numeric; v_name text;
begin
 if v_org is null then raise exception 'کسب‌وکار فعال یافت نشد.'; end if;
 if p_delta=0 then raise exception 'مقدار تغییر موجودی نمی‌تواند صفر باشد.'; end if;
 if p_movement_type not in('IN','OUT','ADJUSTMENT','SALE','RETURN') then raise exception 'نوع عملیات موجودی نامعتبر است.'; end if;
 select name into v_name from public.products where id=p_product_id and organization_id=v_org and is_active=true;
 if v_name is null then raise exception 'کالای مورد نظر یافت نشد یا غیرفعال است.'; end if;
 if not exists(select 1 from public.warehouses where id=p_warehouse_id and organization_id=v_org and is_active=true) then raise exception 'انبار مورد نظر یافت نشد یا غیرفعال است.'; end if;
 perform public._ensure_warehouse_stock(v_org,p_warehouse_id,p_product_id);
 select quantity into v_qty from public.warehouse_stock where warehouse_id=p_warehouse_id and product_id=p_product_id for update;
 if v_qty+p_delta<0 then raise exception 'موجودی «%» در این انبار کافی نیست (موجودی فعلی: %).',v_name,v_qty; end if;
 update public.warehouse_stock set quantity=v_qty+p_delta,updated_at=now() where warehouse_id=p_warehouse_id and product_id=p_product_id;
 insert into public.stock_movements(organization_id,warehouse_id,product_id,change_qty,quantity,movement_type,reason,reference_type,reference_id,created_by)
 values(v_org,p_warehouse_id,p_product_id,p_delta,abs(p_delta),p_movement_type,p_reason,p_reference_type,p_reference_id,auth.uid());
 return v_qty+p_delta;
end; $$;

create or replace function public.stock_receive(p_warehouse_id uuid,p_product_id uuid,p_quantity numeric,p_reason text default 'ورود کالا') returns numeric language plpgsql security definer set search_path=public as $$
begin if p_quantity<=0 then raise exception 'مقدار ورود باید بیشتر از صفر باشد.'; end if; return public._change_stock(p_warehouse_id,p_product_id,p_quantity,'IN',p_reason); end; $$;
create or replace function public.stock_issue(p_warehouse_id uuid,p_product_id uuid,p_quantity numeric,p_reason text default 'خروج کالا') returns numeric language plpgsql security definer set search_path=public as $$
begin if p_quantity<=0 then raise exception 'مقدار خروج باید بیشتر از صفر باشد.'; end if; return public._change_stock(p_warehouse_id,p_product_id,-p_quantity,'OUT',p_reason); end; $$;
create or replace function public.stock_adjust(p_warehouse_id uuid,p_product_id uuid,p_delta numeric,p_reason text default 'اصلاح موجودی') returns numeric language plpgsql security definer set search_path=public as $$
begin return public._change_stock(p_warehouse_id,p_product_id,p_delta,'ADJUSTMENT',p_reason); end; $$;

create or replace function public.stock_transfer(p_from_warehouse_id uuid,p_to_warehouse_id uuid,p_product_id uuid,p_quantity numeric,p_reason text default 'انتقال بین انبارها') returns uuid
language plpgsql security definer set search_path=public as $$
declare v_org uuid:=private.current_user_organization_id();v_transfer uuid:=gen_random_uuid();v_from numeric;v_to numeric;v_name text;v_first uuid;v_second uuid;
begin
 if p_quantity<=0 then raise exception 'مقدار انتقال باید بیشتر از صفر باشد.'; end if;
 if p_from_warehouse_id=p_to_warehouse_id then raise exception 'انبار مبدأ و مقصد باید متفاوت باشند.'; end if;
 select name into v_name from public.products where id=p_product_id and organization_id=v_org and is_active=true;
 if v_name is null then raise exception 'کالای مورد نظر یافت نشد یا غیرفعال است.'; end if;
 if not exists(select 1 from public.warehouses where id=p_from_warehouse_id and organization_id=v_org and is_active=true) or not exists(select 1 from public.warehouses where id=p_to_warehouse_id and organization_id=v_org and is_active=true) then raise exception 'انبار مبدأ یا مقصد معتبر نیست.'; end if;
 perform public._ensure_warehouse_stock(v_org,p_from_warehouse_id,p_product_id);perform public._ensure_warehouse_stock(v_org,p_to_warehouse_id,p_product_id);
 if p_from_warehouse_id<p_to_warehouse_id then v_first:=p_from_warehouse_id;v_second:=p_to_warehouse_id;else v_first:=p_to_warehouse_id;v_second:=p_from_warehouse_id;end if;
 perform 1 from public.warehouse_stock where warehouse_id=v_first and product_id=p_product_id for update;
 perform 1 from public.warehouse_stock where warehouse_id=v_second and product_id=p_product_id for update;
 select quantity into v_from from public.warehouse_stock where warehouse_id=p_from_warehouse_id and product_id=p_product_id;
 select quantity into v_to from public.warehouse_stock where warehouse_id=p_to_warehouse_id and product_id=p_product_id;
 if v_from<p_quantity then raise exception 'موجودی «%» در انبار مبدأ کافی نیست (موجودی فعلی: %).',v_name,v_from; end if;
 update public.warehouse_stock set quantity=v_from-p_quantity,updated_at=now() where warehouse_id=p_from_warehouse_id and product_id=p_product_id;
 update public.warehouse_stock set quantity=v_to+p_quantity,updated_at=now() where warehouse_id=p_to_warehouse_id and product_id=p_product_id;
 insert into public.stock_movements(organization_id,warehouse_id,product_id,change_qty,quantity,movement_type,reason,transfer_id,created_by)
 values(v_org,p_from_warehouse_id,p_product_id,-p_quantity,p_quantity,'TRANSFER_OUT',p_reason,v_transfer,auth.uid()),(v_org,p_to_warehouse_id,p_product_id,p_quantity,p_quantity,'TRANSFER_IN',p_reason,v_transfer,auth.uid());
 return v_transfer;
end; $$;

drop function if exists public.create_invoice_with_items(uuid,text,date,text,text,jsonb);
create or replace function public.create_invoice_with_items(p_customer_id uuid,p_invoice_number text,p_issue_date date,p_description text,p_status text,p_items jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_org uuid:=private.current_user_organization_id();v_invoice uuid;v_total numeric:=0;v_wh uuid;item jsonb;v_pid uuid;v_qty numeric;v_price numeric;v_name text;
begin
 if p_customer_id is null then raise exception 'انتخاب مشتری الزامی است.';end if;if jsonb_array_length(p_items)=0 then raise exception 'حداقل یک قلم کالا لازم است.';end if;
 select id into v_wh from public.warehouses where organization_id=v_org and code='MAIN' and is_active=true order by created_at limit 1;
 if v_wh is null then select id into v_wh from public.warehouses where organization_id=v_org and is_active=true order by created_at limit 1;end if;
 if v_wh is null then raise exception 'انبار فعالی برای ثبت فروش وجود ندارد.';end if;
 if not exists(select 1 from public.customers where id=p_customer_id and organization_id=v_org) then raise exception 'مشتری مورد نظر یافت نشد.';end if;
 select coalesce(sum((i->>'quantity')::numeric*coalesce((i->>'unit_price')::numeric,0)),0) into v_total from jsonb_array_elements(p_items)i;
 insert into public.invoices(organization_id,customer_id,invoice_number,issue_date,total_amount,description,status) values(v_org,p_customer_id,p_invoice_number,p_issue_date,v_total,p_description,coalesce(p_status,'معوق')) returning id into v_invoice;
 for item in select * from jsonb_array_elements(p_items) loop
  v_pid:=nullif(item->>'product_id','')::uuid;v_qty:=(item->>'quantity')::numeric;v_price:=coalesce((item->>'unit_price')::numeric,0);v_name:=item->>'product_name';
  if v_qty<=0 then raise exception 'مقدار کالای «%» نامعتبر است.',v_name;end if;
  insert into public.invoice_items(organization_id,invoice_id,product_id,product_name,quantity,unit_price) values(v_org,v_invoice,v_pid,v_name,v_qty,v_price);
  if v_pid is not null then perform public._change_stock(v_wh,v_pid,-v_qty,'SALE','فروش در فاکتور '||coalesce(p_invoice_number,''),'invoice',v_invoice);end if;
 end loop;
 return v_invoice;
end; $$;

drop function if exists public.delete_invoice_and_restore_stock(uuid);
create or replace function public.delete_invoice_and_restore_stock(p_invoice_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid:=private.current_user_organization_id();v_no text;v_wh uuid;item record;
begin
 select invoice_number into v_no from public.invoices where id=p_invoice_id and organization_id=v_org for update;
 if v_no is null then raise exception 'فاکتور مورد نظر یافت نشد.';end if;
 select id into v_wh from public.warehouses where organization_id=v_org and code='MAIN' and is_active=true order by created_at limit 1;
 if v_wh is null then select id into v_wh from public.warehouses where organization_id=v_org and is_active=true order by created_at limit 1;end if;
 if v_wh is null then raise exception 'انبار فعالی برای بازگشت موجودی وجود ندارد.';end if;
 for item in select product_id,quantity from public.invoice_items where invoice_id=p_invoice_id and organization_id=v_org and product_id is not null loop
  perform public._change_stock(v_wh,item.product_id,item.quantity,'RETURN','بازگشت موجودی از حذف فاکتور '||coalesce(v_no,''),'invoice_delete',p_invoice_id);
 end loop;
 delete from public.invoices where id=p_invoice_id and organization_id=v_org;
end; $$;

revoke all on function public._ensure_warehouse_stock(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public._change_stock(uuid,uuid,numeric,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.stock_receive(uuid,uuid,numeric,text) from public,anon;
revoke all on function public.stock_issue(uuid,uuid,numeric,text) from public,anon;
revoke all on function public.stock_adjust(uuid,uuid,numeric,text) from public,anon;
revoke all on function public.stock_transfer(uuid,uuid,uuid,numeric,text) from public,anon;
revoke all on function public.create_invoice_with_items(uuid,text,date,text,text,jsonb) from public,anon;
revoke all on function public.delete_invoice_and_restore_stock(uuid) from public,anon;
grant execute on function public.stock_receive(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.stock_issue(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.stock_adjust(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.stock_transfer(uuid,uuid,uuid,numeric,text) to authenticated;
grant execute on function public.create_invoice_with_items(uuid,text,date,text,text,jsonb) to authenticated;
grant execute on function public.delete_invoice_and_restore_stock(uuid) to authenticated;
