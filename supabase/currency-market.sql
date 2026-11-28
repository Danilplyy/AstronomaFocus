-- Валютный рынок АРСЕНАЛА.
-- Запустить один раз в Supabase SQL Editor. Повторный запуск безопасен.

create table if not exists public.arsenal_currencies (
  code text primary key check (code = upper(code) and length(code) between 2 and 8),
  name text not null check (length(trim(name)) > 0),
  symbol text not null default '',
  gold_value numeric(24,10) not null check (gold_value > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.arsenal_currencies enable row level security;

drop policy if exists "Currencies are readable by authenticated users" on public.arsenal_currencies;
create policy "Currencies are readable by authenticated users"
  on public.arsenal_currencies for select to authenticated
  using (true);

drop policy if exists "Only admins can create currencies" on public.arsenal_currencies;
create policy "Only admins can create currencies"
  on public.arsenal_currencies for insert to authenticated
  with check (public.is_admin());

drop policy if exists "Only admins can update currencies" on public.arsenal_currencies;
create policy "Only admins can update currencies"
  on public.arsenal_currencies for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Only admins can delete currencies" on public.arsenal_currencies;
create policy "Only admins can delete currencies"
  on public.arsenal_currencies for delete to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.arsenal_currencies to authenticated;

-- Публикация изменений валют для realtime-конвертера.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'arsenal_currencies'
  ) then
    alter publication supabase_realtime add table public.arsenal_currencies;
  end if;
end $$;
