-- ARSENAL: admin-only player country reassignment.
-- Run in Supabase SQL Editor after the base schema.
-- Existing focus_selections and player progress are intentionally preserved.

create or replace function public.admin_reassign_player_country(
  target_user_id uuid,
  target_country_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_is_admin boolean;
begin
  if not public.is_admin() then
    raise exception 'Только администратор может переназначать игроков';
  end if;

  if target_user_id is null or target_country_code is null then
    raise exception 'Не указан игрок или целевая страна';
  end if;

  select p.is_admin
    into target_is_admin
  from public.profiles p
  where p.id = target_user_id;

  if not found then
    raise exception 'Игрок не найден';
  end if;

  if target_is_admin then
    raise exception 'Нельзя переназначать учётную запись администратора';
  end if;

  if not exists (
    select 1
    from public.countries c
    where c.code = target_country_code
      and coalesce(c.is_active, true) = true
  ) then
    raise exception 'Целевая страна не найдена или неактивна';
  end if;

  -- Serialize simultaneous attempts to claim the same country.
  perform pg_advisory_xact_lock(hashtext(target_country_code));

  if exists (
    select 1
    from public.profiles p
    where p.country_code = target_country_code
      and p.id <> target_user_id
  ) then
    raise exception 'Эта страна уже занята другим игроком';
  end if;

  update public.profiles
  set country_code = target_country_code
  where id = target_user_id;

  if not found then
    raise exception 'Не удалось обновить профиль игрока';
  end if;
end;
$$;

revoke all on function public.admin_reassign_player_country(uuid, text) from public;
grant execute on function public.admin_reassign_player_country(uuid, text) to authenticated;
