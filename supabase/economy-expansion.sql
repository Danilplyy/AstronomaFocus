-- Расширение экономической системы АРСЕНАЛА.
-- Выполнить один раз в Supabase SQL Editor после economy.sql.
-- Повторный запуск безопасен.

alter table public.country_economy
  add column if not exists exports numeric(20,2) not null default 0,
  add column if not exists imports numeric(20,2) not null default 0,
  add column if not exists trade_tariffs numeric(20,2) not null default 0,
  add column if not exists public_debt numeric(20,2) not null default 0,
  add column if not exists unemployment numeric(8,2) not null default 0,
  add column if not exists agriculture_output numeric(20,2) not null default 0,
  add column if not exists industry_output numeric(20,2) not null default 0,
  add column if not exists energy_output numeric(20,2) not null default 0,
  add column if not exists construction_output numeric(20,2) not null default 0,
  add column if not exists services_output numeric(20,2) not null default 0,
  add column if not exists healthcare_expenses numeric(20,2) not null default 0,
  add column if not exists education_expenses numeric(20,2) not null default 0,
  add column if not exists social_expenses numeric(20,2) not null default 0,
  add column if not exists other_expenses numeric(20,2) not null default 0,
  add column if not exists trade_partners text not null default '',
  add column if not exists export_goods text not null default '',
  add column if not exists import_goods text not null default '';

-- Игроки могут читать только экономику своей страны; любые изменения — только администратор.
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
drop policy if exists "country economy owner and admin update" on public.country_economy;
drop policy if exists "country economy owner and admin delete" on public.country_economy;
drop policy if exists "country economy admin insert" on public.country_economy;
drop policy if exists "country economy admin update" on public.country_economy;
drop policy if exists "country economy admin delete" on public.country_economy;
create policy "country economy admin insert" on public.country_economy
  for insert to authenticated with check (public.is_admin());
create policy "country economy admin update" on public.country_economy
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "country economy admin delete" on public.country_economy
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.country_economy to authenticated;
