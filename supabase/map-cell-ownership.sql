-- Редактирование границ государств АРСЕНАЛА на уровне ячеек Fantasy Map Generator.
-- Выполнить один раз в Supabase SQL Editor после map-ownership.sql.
-- NULL в country_code означает принудительно нейтральную ячейку и перекрывает владельца исходного государства.

create table if not exists public.map_cell_ownership (
  cell_id integer primary key check (cell_id >= 0 and cell_id < 6936),
  country_code text null references public.countries(code) on update cascade on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.map_cell_ownership enable row level security;

drop policy if exists "map cell ownership readable by authenticated" on public.map_cell_ownership;
create policy "map cell ownership readable by authenticated"
  on public.map_cell_ownership for select to authenticated using (true);

drop policy if exists "admins manage map cell ownership" on public.map_cell_ownership;
create policy "admins manage map cell ownership"
  on public.map_cell_ownership for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.map_cell_ownership to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.map_cell_ownership;
exception when duplicate_object then null; when undefined_object then null;
end $$;
