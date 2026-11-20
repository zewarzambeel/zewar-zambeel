-- Zewar Zambeel: public order tracking.
-- A customer can look up an order only when BOTH the order number and the phone number match.
-- It never returns the phone number, name or street address. Only adds a function.
create or replace function public.track_order(p_order_no bigint, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare o record; d_in text; d_db text;
begin
  d_in := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  if p_order_no is null or length(d_in) < 10 then return null; end if;
  select * into o from public.orders where order_no = p_order_no;
  if not found then return null; end if;
  d_db := right(regexp_replace(coalesce(o.phone, ''), '\D', '', 'g'), 10);
  if d_db <> d_in then return null; end if;
  return jsonb_build_object(
    'order_no', o.order_no,
    'status', o.status,
    'created_at', o.created_at,
    'city', o.city,
    'payment_method', o.payment_method,
    'subtotal', o.subtotal,
    'delivery_charge', o.delivery_charge,
    'total', o.total,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'name', i->>'name', 'qty', (i->>'qty')::int, 'size', i->>'size', 'color', i->>'color')), '[]'::jsonb)
              from jsonb_array_elements(o.items) i)
  );
end $$;
revoke all on function public.track_order(bigint, text) from public;
grant execute on function public.track_order(bigint, text) to anon, authenticated;
