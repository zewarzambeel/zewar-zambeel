-- Rollback for cost-price.sql: restores place_order and adjust_stock exactly as they were before.
-- Warning: this deletes the saved cost prices (product_costs) and purchase costs on stock movements.

create or replace function public.place_order(p_name text, p_phone text, p_province text, p_city text, p_area text, p_address text, p_payment text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_subtotal numeric := 0; v_delivery numeric := 0; v_total numeric; v_free_min numeric; v_charge numeric;
  v_city_charge numeric; v_prov_charge numeric; v_items jsonb := '[]'::jsonb; v_no bigint; it jsonb; prod record; q int; v_left int;
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
    v_subtotal := v_subtotal + prod.price * q;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', prod.id, 'name', prod.name, 'price', prod.price, 'qty', q, 'size', it->>'size', 'color', it->>'color'));
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

create or replace function public.adjust_stock(p_product uuid, p_reason text, p_delta int, p_note text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_after int;
begin
  if auth.role() <> 'authenticated' then raise exception 'Not allowed'; end if;
  if p_reason not in ('purchase','return','adjustment','damaged') then raise exception 'Invalid reason'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'Change cannot be 0'; end if;
  update public.products set stock_qty = stock_qty + p_delta
    where id = p_product and stock_qty + p_delta >= 0
    returning stock_qty into v_after;
  if not found then raise exception 'Stock cannot go below 0'; end if;
  insert into public.stock_movements(product_id, qty_change, qty_after, reason, note)
    values (p_product, p_delta, v_after, p_reason, p_note);
  return v_after;
end $$;
revoke all on function public.adjust_stock(uuid, text, int, text) from public, anon;
grant execute on function public.adjust_stock(uuid, text, int, text) to authenticated;

drop function if exists public.adjust_stock(uuid, text, int, text, numeric);
drop table if exists public.product_costs;
alter table public.stock_movements drop column if exists unit_cost;
