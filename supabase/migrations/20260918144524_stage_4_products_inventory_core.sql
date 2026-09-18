-- Stage 4: Products & Inventory core schema
-- Authoritative stock lives in warehouse_stock. products.stock_qty remains a synchronized legacy aggregate.

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_user_organization_id() references public.organizations(id) on delete restrict,
  name text not null, code text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists warehouses_org_code_uidx on public.warehouses(organization_id,code) where code is not null;
create unique index if not exists warehouses_id_org_uidx on public.warehouses(id,organization_id);
create index if not exists warehouses_org_name_idx on public.warehouses(organization_id,name);

alter table public.products
  add column if not exists sku text, add column if not exists barcode text, add column if not exists category text,
  add column if not exists purchase_price numeric not null default 0, add column if not exists sale_price numeric not null default 0,
  add column if not exists min_stock numeric not null default 0, add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists products_org_id_uidx on public.products(id,organization_id);
create unique index if not exists products_org_sku_uidx on public.products(organization_id,sku) where sku is not null and sku<>'';
create unique index if not exists products_org_barcode_uidx on public.products(organization_id,barcode) where barcode is not null and barcode<>'';
create index if not exists products_org_category_idx on public.products(organization_id,category);
create index if not exists products_org_active_idx on public.products(organization_id,is_active);
update public.products set sale_price=case when coalesce(sale_price,0)=0 then coalesce(price,0) else sale_price end,updated_at=coalesce(updated_at,created_at,now());

create table if not exists public.warehouse_stock (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_user_organization_id() references public.organizations(id) on delete restrict,
  warehouse_id uuid not null, product_id uuid not null, quantity numeric not null default 0 check(quantity>=0),
  updated_at timestamptz not null default now(), unique(warehouse_id,product_id),
  foreign key(warehouse_id,organization_id) references public.warehouses(id,organization_id) on delete restrict,
  foreign key(product_id,organization_id) references public.products(id,organization_id) on delete restrict
);
create index if not exists warehouse_stock_org_product_idx on public.warehouse_stock(organization_id,product_id);
create index if not exists warehouse_stock_org_warehouse_idx on public.warehouse_stock(organization_id,warehouse_id);

alter table public.stock_movements
  add column if not exists warehouse_id uuid, add column if not exists movement_type text, add column if not exists quantity numeric,
  add column if not exists reference_type text, add column if not exists reference_id uuid, add column if not exists transfer_id uuid,
  add column if not exists created_by uuid;

insert into public.warehouses(organization_id,name,code)
select o.id,'انبار اصلی','MAIN' from public.organizations o
where not exists(select 1 from public.warehouses w where w.organization_id=o.id);
update public.stock_movements sm set warehouse_id=w.id from public.warehouses w
where sm.warehouse_id is null and w.organization_id=sm.organization_id and w.code='MAIN';
update public.stock_movements set movement_type=case when change_qty>=0 then 'IN' else 'OUT' end where movement_type is null;
update public.stock_movements set quantity=abs(change_qty) where quantity is null;
insert into public.warehouse_stock(organization_id,warehouse_id,product_id,quantity)
select p.organization_id,w.id,p.id,greatest(p.stock_qty,0) from public.products p join public.warehouses w on w.organization_id=p.organization_id and w.code='MAIN'
where not exists(select 1 from public.warehouse_stock ws where ws.warehouse_id=w.id and ws.product_id=p.id);

alter table public.stock_movements add constraint stock_movements_warehouse_org_fk foreign key(warehouse_id,organization_id) references public.warehouses(id,organization_id) on delete restrict;
alter table public.stock_movements alter column warehouse_id set not null, alter column movement_type set not null, alter column quantity set not null;
alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check(movement_type in('IN','OUT','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT','SALE','RETURN'));
alter table public.stock_movements drop constraint if exists stock_movements_quantity_positive_check;
alter table public.stock_movements add constraint stock_movements_quantity_positive_check check(quantity>0);

create or replace function public.sync_product_legacy_stock() returns trigger language plpgsql security definer set search_path=public as $$
declare v_product uuid;
begin
 v_product:=coalesce(new.product_id,old.product_id);
 update public.products set stock_qty=coalesce((select sum(quantity) from public.warehouse_stock where product_id=v_product),0),updated_at=now() where id=v_product;
 return coalesce(new,old);
end; $$;
drop trigger if exists warehouse_stock_sync_product on public.warehouse_stock;
create trigger warehouse_stock_sync_product after insert or update or delete on public.warehouse_stock for each row execute function public.sync_product_legacy_stock();

create or replace function public.prevent_direct_stock_qty_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if current_user<>'postgres' and new.stock_qty is distinct from old.stock_qty then raise exception 'موجودی کالا فقط از طریق عملیات انبار قابل تغییر است.'; end if;
 return new;
end; $$;
drop trigger if exists products_block_direct_stock_change on public.products;
create trigger products_block_direct_stock_change before update on public.products for each row execute function public.prevent_direct_stock_qty_change();

create or replace function public.touch_product_updated_at() returns trigger language plpgsql security invoker set search_path=public as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at before update on public.products for each row execute function public.touch_product_updated_at();
create or replace function public.touch_warehouse_updated_at() returns trigger language plpgsql security invoker set search_path=public as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists warehouses_touch_updated_at on public.warehouses;
create trigger warehouses_touch_updated_at before update on public.warehouses for each row execute function public.touch_warehouse_updated_at();

alter table public.warehouses enable row level security;
alter table public.warehouse_stock enable row level security;
drop policy if exists warehouses_all on public.warehouses;
create policy warehouses_all on public.warehouses for all to authenticated using(organization_id=(select private.current_user_organization_id())) with check(organization_id=(select private.current_user_organization_id()));
drop policy if exists warehouse_stock_select on public.warehouse_stock;
create policy warehouse_stock_select on public.warehouse_stock for select to authenticated using(organization_id=(select private.current_user_organization_id()));
revoke insert,update,delete on public.warehouse_stock from authenticated;
revoke insert,update,delete on public.stock_movements from authenticated;
grant select on public.warehouse_stock to authenticated;
grant select on public.stock_movements to authenticated;
