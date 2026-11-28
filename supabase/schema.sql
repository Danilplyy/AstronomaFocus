-- Запустить в Supabase SQL Editor. Скрипт можно выполнять повторно.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  is_admin boolean not null default false,
  country_code text not null default 'MI',
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists country_code text not null default 'MI';
alter table public.profiles alter column country_code set default 'MI';

create table if not exists public.focuses (
  id text primary key,
  branch_id text not null check (branch_id in ('military','industry','logistics','comms','medicine','energy')),
  title text not null,
  description text not null default '',
  year integer not null check (year between 1850 and 1990),
  cost integer not null default 50,
  prerequisites text[] not null default '{}',
  tier integer not null default 0,
  slot integer not null default 0,
  country_code text not null default 'MI',
  created_at timestamptz not null default now()
);
alter table public.focuses add column if not exists country_code text not null default 'MI';
alter table public.focuses alter column country_code set default 'MI';
alter table public.focuses add column if not exists tier integer not null default 0;
alter table public.focuses add column if not exists slot integer not null default 0;
alter table public.focuses add column if not exists is_active boolean not null default true;
-- Ручная отметка администратора: фокус считается изученным для всех игроков этой страны.
alter table public.focuses add column if not exists admin_completed boolean not null default false;
-- Исправляем распределение скопированных деревьев MI/NF/CI по 10 этапам.
-- Старые записи могли получить tier=0 по умолчанию, поэтому раскладываем
-- фокусы каждой ветки равномерно по этапам, сохраняя сортировку по году.
with ranked as (
  select id,
         row_number() over (partition by country_code, branch_id order by year, tier, slot, id) - 1 as rn,
         count(*) over (partition by country_code, branch_id) as total
  from public.focuses
  where country_code in ('MI','NF','CI')
)
update public.focuses f
set tier = least(9, floor(r.rn * 10.0 / nullif(r.total,0))::integer),
    slot = mod(r.rn, greatest(1, ceil(r.total / 10.0)::integer))
from ranked r
where f.id = r.id;


create table if not exists public.focus_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  focus_id text not null references public.focuses(id) on delete cascade,
  status text not null default 'selected',
  updated_at timestamptz not null default now(),
  unique(user_id, focus_id)
);
alter table public.focus_selections drop constraint if exists focus_selections_status_check;
alter table public.focus_selections add constraint focus_selections_status_check
  check (status in ('selected','approved','in_progress','completed','rejected','cancelled'));

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and is_admin = true); $$;

-- Список свободных стран доступен на экране регистрации до входа в аккаунт.
create or replace function public.get_available_country_codes()
returns table(country_code text)
language sql stable security definer set search_path = public
as $$
  select c.code
  from (values ('MI'),('NF'),('CI')) as c(code)
  where not exists (select 1 from public.profiles p where p.country_code = c.code)
  order by c.code;
$$;
grant execute on function public.get_available_country_codes() to anon, authenticated;

-- Защита от одновременной регистрации двух игроков за одну страну.
create or replace function public.enforce_unique_player_country()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.country_code is null or not exists (
    select 1
    from public.countries c
    where c.code = new.country_code
      and coalesce(c.is_active, true) = true
  ) then
    raise exception 'Указан недопустимый или неактивный код страны';
  end if;
  perform pg_advisory_xact_lock(hashtext(new.country_code));
  if exists(select 1 from public.profiles p where p.country_code = new.country_code and p.id <> new.id) then
    raise exception 'Эта страна уже занята другим игроком';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_unique_country on public.profiles;
create trigger profiles_unique_country before insert or update of country_code on public.profiles
for each row execute function public.enforce_unique_player_country();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id,email,display_name,country_code)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)),coalesce(new.raw_user_meta_data->>'country_code','MI'))
  on conflict(id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Удаляем старое ограничение, которое считало approved/in_progress активными
-- и блокировало новые заявки даже после одобрения предыдущих фокусов.
drop trigger if exists enforce_two_focus_limit on public.focus_selections;
drop function if exists public.enforce_two_focus_limit();

-- Лимит: максимум две новые заявки со статусом selected на игрока.
-- approved/in_progress/completed/rejected/cancelled не расходуют лимит.
-- Одобрение администратором автоматически освобождает слот для новой заявки.
create or replace function public.enforce_two_pending_focus_selections()
returns trigger language plpgsql security definer set search_path = public
as $$
declare pending_total integer;
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' and new.status <> 'selected' then
      raise exception 'Игрок может отправлять только заявки со статусом selected';
    end if;
    if tg_op = 'UPDATE' and new.status not in ('selected','cancelled') then
      raise exception 'Изменять статус заявки может только администратор';
    end if;
  end if;

  if new.status = 'selected' and not public.is_admin() then
    if exists (select 1 from public.focuses f where f.id = new.focus_id and f.admin_completed = true) then
      raise exception 'Этот фокус уже отмечен администратором как изученный';
    end if;
    perform pg_advisory_xact_lock(hashtext(new.user_id::text));
    select count(*) into pending_total
    from public.focus_selections s
    where s.user_id = new.user_id and s.status = 'selected'
      and (tg_op <> 'UPDATE' or s.id <> new.id);
    if pending_total >= 2 then
      raise exception 'Можно иметь не более двух ожидающих подтверждения фокусов';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists focus_selections_pending_limit on public.focus_selections;
create trigger focus_selections_pending_limit before insert or update of status on public.focus_selections
for each row execute function public.enforce_two_pending_focus_selections();

alter table public.profiles enable row level security;
alter table public.focuses enable row level security;
alter table public.focus_selections enable row level security;

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
drop policy if exists "focuses readable" on public.focuses;
create policy "focuses readable" on public.focuses for select to authenticated using (true);
drop policy if exists "admins manage focuses" on public.focuses;
create policy "admins manage focuses" on public.focuses for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- SQL privileges are separate from RLS policies. Allow authenticated requests to reach the RLS check.
grant select, insert, update, delete on table public.focuses to authenticated;
drop policy if exists "users read selections" on public.focus_selections;
create policy "users read selections" on public.focus_selections for select to authenticated using (user_id=auth.uid() or public.is_admin());
drop policy if exists "users add own selections" on public.focus_selections;
create policy "users add own selections" on public.focus_selections for insert to authenticated with check (user_id=auth.uid() or public.is_admin());
drop policy if exists "users update own selections" on public.focus_selections;
create policy "users update own selections" on public.focus_selections for update to authenticated using (user_id=auth.uid() or public.is_admin()) with check (user_id=auth.uid() or public.is_admin());
drop policy if exists "users remove own selections" on public.focus_selections;
create policy "users remove own selections" on public.focus_selections for delete to authenticated using (user_id=auth.uid() or public.is_admin());

-- Realtime-обновления статуса admin_completed должны доходить до игроков.
alter table public.focuses replica identity full;

-- Realtime: безопасно добавляем таблицы, если их ещё нет в публикации.
do $$ begin
  alter publication supabase_realtime add table public.focuses;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.focus_selections;
exception when duplicate_object then null; when undefined_object then null;
end $$;


-- Полное копирование дерева Монтескью (MI) в выбранную активную страну.
-- Монтескью остаётся исходной страной; её дерево не копируется само в себя.
-- Повторный запуск для страны с уже существующими фокусами запрещён,
-- чтобы не перезаписать её собственные изменения и заявки игроков.
create or replace function public.clone_germany_tree(target_country_code text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  source_total integer;
  copied_total integer;
begin
  if not public.is_admin() then
    raise exception 'Только администратор может копировать технологическое дерево';
  end if;

  if target_country_code is null
     or target_country_code = 'MI'
     or not exists (
       select 1
       from public.countries c
       where c.code = target_country_code
         and coalesce(c.is_active, true) = true
     ) then
    raise exception 'Недопустимый код целевой страны или страна неактивна';
  end if;

  select count(*) into source_total
  from public.focuses
  where country_code = 'MI';

  if source_total = 0 then
    raise exception 'В таблице focuses не найдено исходное дерево Монтескью (country_code = MI).';
  end if;

  with ranked_source as (
    select src.*,
           row_number() over (partition by src.branch_id order by src.year, src.tier, src.slot, src.id) - 1 as rn,
           count(*) over (partition by src.branch_id) as total
    from public.focuses src
    where src.country_code = 'MI'
  )
  insert into public.focuses (
    id, branch_id, title, description, year, cost, prerequisites,
    tier, slot, country_code, is_active, admin_completed
  )
  select
    target_country_code || '-' || md5(src.id),
    src.branch_id,
    src.title,
    src.description,
    src.year,
    src.cost,
    coalesce((
      select array_agg(target_country_code || '-' || md5(prereq_id) order by ord)
      from unnest(coalesce(src.prerequisites, '{}'::text[])) with ordinality as p(prereq_id, ord)
      where exists (
        select 1 from public.focuses source_prereq
        where source_prereq.id = p.prereq_id and source_prereq.country_code = 'MI'
      )
    ), '{}'::text[]),
    least(9, floor(src.rn * 10.0 / nullif(src.total,0))::integer),
    mod(src.rn, greatest(1, ceil(src.total / 10.0)::integer)),
    target_country_code,
    coalesce(src.is_active, true),
    false
  from ranked_source src
  on conflict (id) do nothing;

  get diagnostics copied_total = row_count;
  return copied_total;
end;
$$;

revoke all on function public.clone_germany_tree(text) from public;
grant execute on function public.clone_germany_tree(text) to authenticated;
