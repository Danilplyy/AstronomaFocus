-- Экономика стран АРСЕНАЛА.
-- Выполнить в Supabase SQL Editor после создания countries, profiles и public.is_admin().
-- Повторный запуск безопасен.

create table if not exists public.country_economy (
  country_code text primary key,
  treasury numeric(20,2) not null default 0,
  tax_revenue numeric(20,2) not null default 0,
  industry_income numeric(20,2) not null default 0,
  trade_income numeric(20,2) not null default 0,
  military_expenses numeric(20,2) not null default 0,
  administration_expenses numeric(20,2) not null default 0,
  infrastructure_expenses numeric(20,2) not null default 0,
  population bigint not null default 0,
  gdp numeric(20,2) not null default 0,
  inflation numeric(8,2) not null default 0,
  stability smallint not null default 50 check (stability between 0 and 100),
  notes text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.country_economy enable row level security;

drop policy if exists "country economy owner and admin read" on public.country_economy;
create policy "country economy owner and admin read"
  on public.country_economy for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.country_code = country_economy.country_code
    )
  );

drop policy if exists "country economy owner and admin insert" on public.country_economy;
create policy "country economy owner and admin insert"
  on public.country_economy for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.country_code = country_economy.country_code
    )
  );

drop policy if exists "country economy owner and admin update" on public.country_economy;
create policy "country economy owner and admin update"
  on public.country_economy for update to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.country_code = country_economy.country_code
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.country_code = country_economy.country_code
    )
  );

drop policy if exists "country economy owner and admin delete" on public.country_economy;
create policy "country economy owner and admin delete"
  on public.country_economy for delete to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.country_code = country_economy.country_code
    )
  );

grant select, insert, update, delete on public.country_economy to authenticated;

-- Включаем обновления в реальном времени, если публикация Supabase доступна.
do $$ begin
  alter publication supabase_realtime add table public.country_economy;
exception when duplicate_object then null; when undefined_object then null;
end $$;
