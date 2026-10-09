-- LifeNoLogin: movie tracker
-- Run once in Supabase SQL Editor. The table follows the project's no-login pattern.
create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  year int check (year is null or year between 1888 and 2100),
  genre text,
  status text not null default 'want' check (status in ('want','watching','watched')),
  rating int check (rating is null or rating between 1 and 5),
  watched_on date,
  notes text,
  poster_url text,
  created_at timestamptz not null default now()
);

alter table public.movies disable row level security;

insert into storage.buckets (id, name, public)
values ('movie-posters', 'movie-posters', true)
on conflict (id) do nothing;

drop policy if exists "movie posters upload" on storage.objects;
drop policy if exists "movie posters read" on storage.objects;

create policy "movie posters upload" on storage.objects
  for insert to anon with check (bucket_id = 'movie-posters');
create policy "movie posters read" on storage.objects
  for select to anon using (bucket_id = 'movie-posters');
