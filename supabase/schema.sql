-- Phase 1: habits + money. Paste into Supabase > SQL Editor > Run.

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  emoji text not null default '✅',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  habit_id uuid not null references habits on delete cascade,
  log_date date not null,
  unique (habit_id, log_date)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  emoji text not null default '•'
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount_satang bigint not null check (amount_satang > 0), -- 100 satang = 1 baht
  category_id uuid references categories on delete set null,
  tx_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index on habit_logs (user_id, log_date);
create index on transactions (user_id, tx_date);

-- Row Level Security: each user sees only their own rows
do $$
declare t text;
begin
  foreach t in array array['habits', 'habit_logs', 'categories', 'transactions'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- Default categories for every new user
create function public.seed_categories() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into categories (user_id, name, type, emoji) values
    (new.id, 'อาหาร', 'expense', '🍜'),
    (new.id, 'เดินทาง', 'expense', '🚌'),
    (new.id, 'ที่พัก', 'expense', '🏠'),
    (new.id, 'ช้อปปิ้ง', 'expense', '🛍️'),
    (new.id, 'สุขภาพ', 'expense', '💊'),
    (new.id, 'บันเทิง', 'expense', '🎬'),
    (new.id, 'เงินเดือน', 'income', '💼'),
    (new.id, 'ฟรีแลนซ์', 'income', '💻'),
    (new.id, 'อื่นๆ', 'income', '✨');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_categories();
