-- Динамическое управление странами. Выполнить в Supabase SQL Editor один раз.
create table if not exists public.countries (
  code text primary key,
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint countries_code_format check (code ~ '^[A-Z0-9]{2,8}$')
);

insert into public.countries(code,name) values
 ('MI','Королевство Монтескью-де-Искадрэ'),
 ('NF','Северный Коммунистический Никонский Фронт'),
 ('CI','Цитранская Империя Баклоред')
on conflict (code) do nothing;

alter table public.countries enable row level security;
drop policy if exists "countries visible" on public.countries;
create policy "countries visible" on public.countries
  for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists "admins manage countries" on public.countries;
create policy "admins manage countries" on public.countries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.countries to anon, authenticated;
grant insert, update, delete on public.countries to authenticated;

-- Список доступных для регистрации стран теперь берётся из таблицы countries.
create or replace function public.get_available_country_codes()
returns table(country_code text)
language sql stable security definer set search_path = public
as $$
  select c.code
  from public.countries c
  where c.is_active = true
    and not exists (select 1 from public.profiles p where p.country_code = c.code)
  order by c.name;
$$;
grant execute on function public.get_available_country_codes() to anon, authenticated;

-- Проверка существования страны и запрет занятия одной страны двумя игроками.
create or replace function public.enforce_unique_player_country()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.country_code is null or not exists (
    select 1 from public.countries c where c.code = new.country_code and c.is_active = true
  ) then
    raise exception 'Указана несуществующая или недоступная страна';
  end if;
  perform pg_advisory_xact_lock(hashtext(new.country_code));
  if exists(select 1 from public.profiles p where p.country_code = new.country_code and p.id <> new.id) then
    raise exception 'Эта страна уже занята другим игроком';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_unique_country on public.profiles;
create trigger profiles_unique_country
before insert or update of country_code on public.profiles
for each row execute function public.enforce_unique_player_country();

-- Удаление страны: запрещено, пока за ней закреплён хотя бы один игрок.
-- Фокусы и связанные заявки удаляются каскадно через focus_selections.focus_id.
create or replace function public.admin_delete_country(target_code text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Только администратор может удалять страны';
  end if;
  if exists(select 1 from public.profiles where country_code = target_code and coalesce(is_admin,false) = false) then
    raise exception 'Нельзя удалить страну: за ней закреплены игроки. Сначала переназначьте их.';
  end if;
  delete from public.focuses where country_code = target_code;
  delete from public.countries where code = target_code;
  if not found then
    raise exception 'Страна с таким кодом не найдена';
  end if;
end;
$$;
revoke all on function public.admin_delete_country(text) from public;
grant execute on function public.admin_delete_country(text) to authenticated;

-- Создание страны доступно через таблицу countries; проверка прав выполняется RLS.


-- Копирование исходного немецкого дерева теперь поддерживает любые добавленные страны.
create or replace function public.clone_germany_tree(target_country_code text)
returns integer language plpgsql security definer set search_path = public
as $$
declare source_total integer; copied_total integer;
begin
  if not public.is_admin() then
    raise exception 'Только администратор может копировать технологическое дерево';
  end if;
  if target_country_code = 'DE' or not exists (
    select 1 from public.countries c where c.code = target_country_code and c.is_active = true
  ) then
    raise exception 'Выберите существующую страну, отличную от Германии';
  end if;
  select count(*) into source_total from public.focuses where country_code = 'DE';
  if source_total = 0 then
    raise exception 'Не найдено исходное технологическое дерево Германии (country_code = DE)';
  end if;

  with ranked_source as (
    select src.*,
      row_number() over (partition by src.branch_id order by src.year,src.tier,src.slot,src.id)-1 as rn,
      count(*) over (partition by src.branch_id) as total
    from public.focuses src where src.country_code='DE'
  )
  insert into public.focuses(
    id,branch_id,title,description,year,cost,prerequisites,tier,slot,country_code,is_active,admin_completed
  )
  select
    target_country_code || '-' || md5(src.id), src.branch_id, src.title, src.description,
    src.year,src.cost,
    coalesce((
      select array_agg(target_country_code || '-' || md5(prereq_id) order by ord)
      from unnest(coalesce(src.prerequisites,'{}'::text[])) with ordinality as p(prereq_id,ord)
      where exists(select 1 from public.focuses f where f.id=p.prereq_id and f.country_code='DE')
    ),'{}'::text[]),
    least(9,floor(src.rn*10.0/nullif(src.total,0))::integer),
    mod(src.rn,greatest(1,ceil(src.total/10.0)::integer)),
    target_country_code,coalesce(src.is_active,true),false
  from ranked_source src
  on conflict(id) do nothing;
  get diagnostics copied_total = row_count;
  return copied_total;
end;
$$;
revoke all on function public.clone_germany_tree(text) from public;
grant execute on function public.clone_germany_tree(text) to authenticated;
