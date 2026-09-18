drop function if exists public.create_invoice_with_items(uuid,text,date,text,text,jsonb);
drop function if exists public.create_invoice_with_items(uuid,text,date,text,text,jsonb,text,numeric);
create or replace function public.create_invoice_with_items(
 p_customer_id uuid,p_invoice_number text,p_issue_date date,p_description text,p_status text,p_items jsonb,
 p_discount_type text default 'amount',p_discount_value numeric default 0
) returns uuid language plpgsql security definer set search_path=public
as $$
declare v_org uuid:=private.current_user_organization_id();v_invoice uuid;v_subtotal numeric:=0;v_discount numeric:=0;v_total numeric:=0;v_wh uuid;item jsonb;v_pid uuid;v_qty numeric;v_price numeric;v_name text;
begin
 if p_customer_id is null then raise exception 'انتخاب مشتری الزامی است.';end if;
 if jsonb_array_length(p_items)=0 then raise exception 'حداقل یک قلم کالا لازم است.';end if;
 select id into v_wh from public.warehouses where organization_id=v_org and code='MAIN' and is_active=true order by created_at limit 1;
 if v_wh is null then select id into v_wh from public.warehouses where organization_id=v_org and is_active=true order by created_at limit 1;end if;
 if v_wh is null then raise exception 'انبار فعالی برای ثبت فروش وجود ندارد.';end if;
 if not exists(select 1 from public.customers where id=p_customer_id and organization_id=v_org) then raise exception 'مشتری مورد نظر یافت نشد.';end if;
 select coalesce(sum((i->>'quantity')::numeric*coalesce((i->>'unit_price')::numeric,0)),0) into v_subtotal from jsonb_array_elements(p_items)i;
 if p_discount_type='percent' then v_discount:=v_subtotal*coalesce(p_discount_value,0)/100;else v_discount:=coalesce(p_discount_value,0);end if;
 v_discount:=greatest(0,least(v_discount,v_subtotal));v_total:=v_subtotal-v_discount;
 insert into public.invoices(organization_id,customer_id,invoice_number,issue_date,total_amount,description,status,discount_type,discount_value,discount_amount)
 values(v_org,p_customer_id,p_invoice_number,p_issue_date,v_total,p_description,coalesce(p_status,'معوق'),coalesce(p_discount_type,'amount'),coalesce(p_discount_value,0),v_discount) returning id into v_invoice;
 for item in select * from jsonb_array_elements(p_items) loop
  v_pid:=nullif(item->>'product_id','')::uuid;v_qty:=(item->>'quantity')::numeric;v_price:=coalesce((item->>'unit_price')::numeric,0);v_name:=item->>'product_name';
  if v_qty<=0 then raise exception 'مقدار کالای «%» نامعتبر است.',v_name;end if;
  insert into public.invoice_items(organization_id,invoice_id,product_id,product_name,quantity,unit_price) values(v_org,v_invoice,v_pid,v_name,v_qty,v_price);
  if v_pid is not null then perform public._change_stock(v_wh,v_pid,-v_qty,'SALE','فروش در فاکتور '||coalesce(p_invoice_number,''),'invoice',v_invoice);end if;
 end loop;
 return v_invoice;
end; $$;
revoke all on function public.create_invoice_with_items(uuid,text,date,text,text,jsonb,text,numeric) from public,anon;
grant execute on function public.create_invoice_with_items(uuid,text,date,text,text,jsonb,text,numeric) to authenticated;