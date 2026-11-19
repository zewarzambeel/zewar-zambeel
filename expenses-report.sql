-- Zewar Zambeel: expenses table + monthly profit report.
-- Only adds a new table and a new function. Nothing existing is changed.

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default current_date,
  category text not null check (category in ('courier','packaging','marketing','software','rent_utilities','salary','other')),
  amount numeric not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists expenses_spent_on_idx on public.expenses (spent_on);
alter table public.expenses enable row level security;
drop policy if exists "admin all expenses" on public.expenses;
create policy "admin all expenses" on public.expenses for all to authenticated using (true) with check (true);

-- Report for orders created from p_from (included) to p_to (excluded), Pakistan time.
-- A sale counts when the order is delivered. Delivery charge collected counts as income.
create or replace function public.profit_report(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if auth.role() <> 'authenticated' then raise exception 'Not allowed'; end if;
  with o as (
    select * from public.orders
    where (created_at at time zone 'Asia/Karachi')::date >= p_from
      and (created_at at time zone 'Asia/Karachi')::date < p_to
  ),
  d as (select * from o where status = 'delivered'),
  li as (
    select d.id, (i->>'qty')::numeric as qty, nullif(i->>'cost','')::numeric as cost
    from d, jsonb_array_elements(d.items) i
  ),
  ex as (select category, amount from public.expenses where spent_on >= p_from and spent_on < p_to)
  select jsonb_build_object(
    'delivered_orders', (select count(*) from d),
    'sales', (select coalesce(sum(subtotal), 0) from d),
    'delivery_income', (select coalesce(sum(delivery_charge), 0) from d),
    'cost_of_goods', (select coalesce(sum(qty * cost), 0) from li where cost is not null),
    'orders_missing_cost', (select count(distinct id) from li where cost is null),
    'pending_orders', (select count(*) from o where status in ('new','confirmed','shipped')),
    'pending_value', (select coalesce(sum(total), 0) from o where status in ('new','confirmed','shipped')),
    'cancelled_orders', (select count(*) from o where status = 'cancelled'),
    'expenses', (select coalesce(sum(amount), 0) from ex),
    'expenses_by_category', (select coalesce(jsonb_object_agg(category, t), '{}'::jsonb) from (select category, sum(amount) t from ex group by category) x)
  ) into r;
  return r;
end $$;
revoke all on function public.profit_report(date, date) from public, anon;
grant execute on function public.profit_report(date, date) to authenticated;
