-- Zewar Zambeel: customer reviews
-- Supabase > SQL Editor > New query > paste this whole file > Run (one time only).
-- It is safe to run again.

-- 1) Reviews table
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  text,
  name        text    not null check (char_length(name) between 1 and 60),
  rating      int     not null check (rating between 1 and 5),
  comment     text    not null check (char_length(comment) between 1 and 600),
  image_url   text    check (image_url is null or char_length(image_url) < 500),
  is_approved boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists reviews_created_idx on public.reviews (created_at desc);

-- 2) Who can do what
alter table public.reviews enable row level security;

drop policy if exists "reviews public read approved" on public.reviews;
create policy "reviews public read approved" on public.reviews
  for select to anon, authenticated using (is_approved = true);

drop policy if exists "reviews public submit" on public.reviews;
create policy "reviews public submit" on public.reviews
  for insert to anon, authenticated with check (is_approved = false);

drop policy if exists "reviews admin all" on public.reviews;
create policy "reviews admin all" on public.reviews
  for all to authenticated using (true) with check (true);

grant select, insert on public.reviews to anon;
grant all on public.reviews to authenticated;

-- 3) Storage for customer photos (max 2 MB, JPEG only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-images', 'review-images', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists "review photos upload" on storage.objects;
create policy "review photos upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'review-images');
