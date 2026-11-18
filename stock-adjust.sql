-- Zewar Zambeel: safe stock adjustment for the admin "stock" tab.
-- Run once in Supabase SQL Editor. Only adds one new function; nothing existing is changed.
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
