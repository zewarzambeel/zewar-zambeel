-- Zewar Zambeel: cost price (khareed ki qeemat) with average cost.
-- Costs live in an admin-only table so they are never visible on the public site.

-- 1. Admin-only cost table (one row per product)
create table if not exists public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  cost_price numeric not null check (cost_price >= 0),
  updated_at timestamptz not null default now()
);
alter table public.product_costs enable row level security;
drop policy if exists "admin all product costs" on public.product_costs;
create policy "admin all product costs" on public.product_costs
  for all to authenticated using (true) with check (true);

-- 2. Remember the purchase cost on each stock movement
alter table public.stock_movements add column if not exists unit_cost numeric;

-- 3. adjust_stock: on 'purchase' with a cost, update the average cost
create or replace function public.adjust_stock(p_product uuid, p_reason text, p_delta int, p_note text default null, p_cost numeric default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_after int; v_old int; v_oldcost numeric; v_new numeric;
begin
  if auth.role() <> 'authenticated' then raise exception 'Not allowed'; end if;
  if p_reason not in ('purchase','return','adjustment','damaged') then raise exception 'Invalid reason'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'Change cannot be 0'; end if;
  if p_cost is not null and p_cost < 0 then raise exception 'Cost cannot be negative'; end if;

  select stock_qty into v_old from public.products where id = p_product for update;
  if not found then raise exception 'Product not found'; end if;

  update public.products set stock_qty = stock_qty + p_delta
    where id = p_product and stock_qty + p_delta >= 0
    returning stock_qty into v_after;
  if not found then raise exception 'Stock cannot go below 0'; end if;

  if p_reason = 'purchase' and p_delta > 0 and p_cost is not null then
    select cost_price into v_oldcost from public.product_costs where product_id = p_product;
    if v_oldcost is null or v_old <= 0 then
      v_new := p_cost;
    else
      v_new := round((v_old * v_oldcost + p_delta * p_cost) / (v_old + p_delta), 2);
    end if;
    insert into public.product_costs(product_id, cost_price, updated_at) values (p_product, v_new, now())
      on conflict (product_id) do update set cost_price = excluded.cost_price, updated_at = now();
  end if;

  insert into public.stock_movements(product_id, qty_change, qty_after, reason, note, unit_cost)
    values (p_product, p_delta, v_after, p_reason, p_note, case when p_reason = 'purchase' then p_cost end);
  return v_after;
end $$;

drop function if exists public.adjust_stock(uuid, text, int, text);
revoke all on function public.adjust_stock(uuid, text, int, text, numeric) from public, anon;
grant execute on function public.adjust_stock(uuid, text, int, text, numeric) to authenticated;

-- 4. place_order: save the product's cost inside each order item (null if cost unknown)
create or replace function public.place_order(p_name text, p_phone text, p_province text, p_city text, p_area text, p_address text, p_payment text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_subtotal numeric := 0; v_delivery numeric := 0; v_total numeric; v_free_min numeric; v_charge numeric;
  v_city_charge numeric; v_prov_charge numeric; v_items jsonb := '[]'::jsonb; v_no bigint; it jsonb; prod record; q int; v_left int; v_cost numeric;
begin
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'Name required'; end if;
  if p_phone is null or length(trim(p_phone)) < 10 then raise exception 'Valid phone required'; end if;
  if p_address is null or length(trim(p_address)) < 5 then raise exception 'Address required'; end if;
  if p_payment not in ('cod','jazzcash') then raise exception 'Invalid payment method'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;

  v_free_min := coalesce((select nullif(value,'')::numeric from settings where key = 'free_delivery_min'), 3500);
  v_charge   := coalesce((select nullif(value,'')::numeric from settings where key = 'delivery_charge'), 299);

  select c.delivery_charge into v_city_charge
  from public.locations c join public.locations p on p.id = c.parent_id and p.type = 'province'
  where c.type = 'city' and lower(trim(c.name)) = lower(trim(p_city)) and lower(trim(p.name)) = lower(trim(p_province)) limit 1;
  select delivery_charge into v_prov_charge from public.locations
  where type = 'province' and lower(trim(name)) = lower(trim(p_province)) limit 1;
  v_charge := coalesce(v_city_charge, v_prov_charge, v_charge);

  for it in select * from jsonb_array_elements(p_items) loop
    q := greatest(1, least(coalesce((it->>'qty')::int, 1), 20));
    select id, name, price, stock_qty into prod from public.products
    where id = (it->>'product_id')::uuid and is_active and in_stock for update;
    if not found then raise exception 'A product in your cart is no longer available'; end if;
    if prod.stock_qty < q then
      raise exception 'Sorry, only % left of "%". Please reduce the quantity.', prod.stock_qty, prod.name;
    end if;
    update public.products set stock_qty = stock_qty - q where id = prod.id returning stock_qty into v_left;
    select cost_price into v_cost from public.product_costs where product_id = prod.id;
    v_subtotal := v_subtotal + prod.price * q;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', prod.id, 'name', prod.name, 'price', prod.price, 'qty', q, 'size', it->>'size', 'color', it->>'color', 'cost', v_cost));
  end loop;

  if v_subtotal >= v_free_min then v_delivery := 0; else v_delivery := v_charge; end if;
  v_total := v_subtotal + v_delivery;

  insert into public.orders (customer_name, phone, province, city, area, address, payment_method, items, subtotal, delivery_charge, total, stock_tracked, stock_deducted)
  values (trim(p_name), trim(p_phone), p_province, p_city, p_area, trim(p_address), p_payment, v_items, v_subtotal, v_delivery, v_total, true, true)
  returning order_no into v_no;

  insert into public.stock_movements(product_id, qty_change, qty_after, reason, order_no, created_by)
  select (i->>'product_id')::uuid, -(i->>'qty')::int, (select stock_qty from public.products where id = (i->>'product_id')::uuid), 'sale', v_no, null
  from jsonb_array_elements(v_items) i;

  return jsonb_build_object('order_no', v_no, 'subtotal', v_subtotal, 'delivery', v_delivery, 'total', v_total);
end $function$;
