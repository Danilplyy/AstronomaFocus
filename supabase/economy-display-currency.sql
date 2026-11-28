-- Индивидуальная валюта отображения для каждой страны.
-- Убираем прежнее глобальное назначение валюты, если оно было установлено.
drop index if exists public.arsenal_currencies_single_display_idx;
drop trigger if exists arsenal_currency_pick_fallback on public.arsenal_currencies;
drop function if exists public.arsenal_currency_pick_fallback();
alter table public.arsenal_currencies drop column if exists is_display;
alter table public.arsenal_currencies drop column if exists is_display_currency;
-- Денежные значения в country_economy по-прежнему хранятся в золоте.

create table if not exists public.arsenal_country_display_currencies (
  country_code text primary key,
  currency_code text not null references public.arsenal_currencies(code) on update cascade on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.arsenal_country_display_currencies enable row level security;
grant select, insert, update, delete on public.arsenal_country_display_currencies to authenticated;

drop policy if exists "Anyone authenticated can read country display currencies" on public.arsenal_country_display_currencies;
create policy "Anyone authenticated can read country display currencies"
  on public.arsenal_country_display_currencies for select
  to authenticated using (true);

drop policy if exists "Admins manage country display currencies" on public.arsenal_country_display_currencies;
create policy "Admins manage country display currencies"
  on public.arsenal_country_display_currencies for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

-- Для уже существующих стран назначаем первую доступную валюту,
-- но не перезаписываем выбор, который администратор уже сделал.
insert into public.arsenal_country_display_currencies (country_code, currency_code)
select c.code, (select ac.code from public.arsenal_currencies ac order by ac.code limit 1)
from public.countries c
where exists (select 1 from public.arsenal_currencies)
on conflict (country_code) do nothing;
