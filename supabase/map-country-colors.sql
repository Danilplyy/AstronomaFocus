-- Индивидуальные цвета игровых государств на интерактивной карте.
-- Выполнить один раз в Supabase SQL Editor.

create table if not exists public.map_country_colors (
  country_code text primary key references public.countries(code) on update cascade on delete cascade,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.map_country_colors enable row level security;

drop policy if exists "map country colors readable by authenticated" on public.map_country_colors;
create policy "map country colors readable by authenticated"
  on public.map_country_colors for select to authenticated using (true);

drop policy if exists "admins manage map country colors" on public.map_country_colors;
create policy "admins manage map country colors"
  on public.map_country_colors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.map_country_colors to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.map_country_colors;
exception when duplicate_object then null; when undefined_object then null;
end $$;
