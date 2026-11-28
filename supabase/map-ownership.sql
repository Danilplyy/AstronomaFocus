-- Интерактивная карта мира АРСЕНАЛА.
-- Выполнить один раз в Supabase SQL Editor; повторный запуск безопасен.

create table if not exists public.map_state_ownership (
  state_id integer primary key,
  state_name text not null,
  country_code text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.map_state_ownership enable row level security;

drop policy if exists "map ownership readable by authenticated" on public.map_state_ownership;
create policy "map ownership readable by authenticated"
  on public.map_state_ownership for select to authenticated using (true);

drop policy if exists "admins manage map ownership" on public.map_state_ownership;
create policy "admins manage map ownership"
  on public.map_state_ownership for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.map_state_ownership to authenticated;

-- Начальное соответствие трёх государств карты игровым странам сайта.
-- 23 = Монтескью, 25 = СКНФ, 65 = ЦИБ.
insert into public.map_state_ownership (state_id, state_name, country_code)
values
  (23, 'Королевство Монтескью-де-Искадрэ', 'MI'),
  (25, 'СКНФ', 'NF'),
  (65, 'ЦИБ', 'CI')
on conflict (state_id) do update
set state_name = excluded.state_name,
    country_code = excluded.country_code,
    updated_at = now();

-- Realtime позволяет всем участникам видеть изменение владельцев без перезагрузки.
do $$ begin
  alter publication supabase_realtime add table public.map_state_ownership;
exception when duplicate_object then null; when undefined_object then null;
end $$;
