-- Таблица для синхронизации планера. Выполнить один раз: Supabase → SQL Editor → New query → вставить → Run.
create table if not exists public.planner_docs (
  user_id    uuid        not null references auth.users(id) on delete cascade default auth.uid(),
  key        text        not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Каждый видит и меняет только свои записи
alter table public.planner_docs enable row level security;
drop policy if exists "own rows" on public.planner_docs;
create policy "own rows" on public.planner_docs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Мгновенные обновления между устройствами
alter table public.planner_docs replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.planner_docs;
exception when duplicate_object then null; end $$;
