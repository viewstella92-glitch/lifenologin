-- Phase 2: mood, budgets, AI usage limit. Run AFTER schema.sql.

create table moods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  mood_date date not null,
  score int not null check (score between 1 and 5),
  unique (user_id, mood_date)
);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  category_id uuid not null references categories on delete cascade,
  monthly_satang bigint not null check (monthly_satang > 0),
  unique (user_id, category_id)
);

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  used_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['moods', 'budgets', 'ai_usage'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;
