-- Zewar Zambeel: one read-only function that returns every number the admin Dashboard needs.
-- Only adds a function. Nothing existing is changed. Run profit_report (expenses-report.sql) first.
create or replace function public.dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  today date := (now() at time zone 'Asia/Karachi')::date;
  m_start date := date_trunc('month', (now() at time zone 'Asia/Karachi'))::date;
begin
  if auth.role() <> 'authenticated' then raise exception 'Not allowed'; end if;
  with o as (
    select *, (created_at at time zone 'Asia/Karachi')::date as d
    from public.orders
    where (created_at at time zone 'Asia/Karachi')::date >= least(m_start, today - 6)
  ),
  it as (
    select o.d, i->>'name' as name, (i->>'qty')::numeric as qty, (i->>'price')::numeric as price
    from o, jsonb_array_elements(o.items) i
    where o.status <> 'cancelled' and o.d >= m_start
  ),
  days as (select g::date as d from generate_series(today - 6, today, interval '1 day') g)
  select jsonb_build_object(
    'today_orders',   (select count(*) from o where d = today and status <> 'cancelled'),
    'today_value',    (select coalesce(sum(total), 0) from o where d = today and status <> 'cancelled'),
    'new_orders',     (select count(*) from public.orders where status = 'new'),
    'pending_orders', (select count(*) from public.orders where status in ('new','confirmed','shipped')),
    'pending_value',  (select coalesce(sum(total), 0) from public.orders where status in ('new','confirmed','shipped')),
    'month_orders',   (select count(*) from o where d >= m_start and status <> 'cancelled'),
    'products_total', (select count(*) from public.products where is_active),
    'low_stock_count',(select count(*) from public.products where is_active and stock_qty <= low_stock_at),
    'low_stock',      (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                         select name, stock_qty, low_stock_at from public.products
                         where is_active and stock_qty <= low_stock_at
                         order by stock_qty, name limit 10) x),
    'inventory_cost_value',   (select coalesce(sum(p.stock_qty * c.cost_price), 0)
                               from public.products p join public.product_costs c on c.product_id = p.id where p.is_active),
    'inventory_retail_value', (select coalesce(sum(stock_qty * price), 0) from public.products where is_active),
    'products_without_cost',  (select count(*) from public.products p
                               left join public.product_costs c on c.product_id = p.id
                               where p.is_active and p.stock_qty > 0 and c.product_id is null),
    'top_products',   (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                         select name, sum(qty) as qty, sum(qty * price) as sales from it
                         group by name order by sum(qty) desc, name limit 5) x),
    'last7',          (select jsonb_agg(jsonb_build_object('d', days.d, 'orders', coalesce(c.n, 0), 'value', coalesce(c.s, 0)) order by days.d)
                       from days left join (
                         select d, count(*) as n, sum(total) as s from o where status <> 'cancelled' group by d) c on c.d = days.d),
    'reviews_pending',(select count(*) from public.reviews where not is_approved),
    'month',          public.profit_report(m_start, (m_start + interval '1 month')::date)
  ) into r;
  return r;
end $$;
revoke all on function public.dashboard_summary() from public, anon;
grant execute on function public.dashboard_summary() to authenticated;
