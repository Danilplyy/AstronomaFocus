-- Приводит технологические деревья HH и MI к стандарту CI:
-- 6 веток x 10 уровней x 10 фокусов = 600 фокусов на страну.
-- Удаляются только записи со slot >= 10. CI и другие страны не затрагиваются.
-- Перед удалением проверяется, что в обеих странах есть полный набор из 600
-- сохраняемых фокусов (по 10 фокусов на каждый уровень каждой из 6 веток).

begin;

do $$
declare
  country_code_to_check text;
  branch_tier_groups integer;
  kept_count integer;
begin
  foreach country_code_to_check in array array['HH', 'MI'] loop
    select count(*)
      into kept_count
    from public.focuses
    where country_code = country_code_to_check
      and tier between 0 and 9
      and slot between 0 and 9;

    select count(*)
      into branch_tier_groups
    from (
      select branch_id, tier
      from public.focuses
      where country_code = country_code_to_check
        and tier between 0 and 9
        and slot between 0 and 9
      group by branch_id, tier
      having count(*) = 10
         and count(distinct slot) = 10
    ) complete_groups;

    if kept_count <> 600 or branch_tier_groups <> 60 then
      raise exception
        'Остановка: для страны % найдено % сохраняемых фокусов и % полных групп ветка/уровень; ожидалось 600 и 60. Ничего не удалено.',
        country_code_to_check, kept_count, branch_tier_groups;
    end if;
  end loop;
end;
$$;

-- Убираем из предпосылок сохранённых фокусов ссылки на записи,
-- которые будут удалены ниже. Порядок оставшихся предпосылок сохраняется.
update public.focuses f
set prerequisites = coalesce((
  select array_agg(p.prereq_id order by p.ord)
  from unnest(coalesce(f.prerequisites, '{}'::text[]))
       with ordinality as p(prereq_id, ord)
  where not exists (
    select 1
    from public.focuses obsolete
    where obsolete.id = p.prereq_id
      and obsolete.country_code in ('HH', 'MI')
      and obsolete.slot >= 10
  )
), '{}'::text[])
where f.country_code in ('HH', 'MI')
  and f.tier between 0 and 9
  and f.slot between 0 and 9;

-- Удаляем только лишние слоты 10+ в HH и MI.
-- Связанные записи focus_selections удалятся каскадно по FK ON DELETE CASCADE.
delete from public.focuses
where country_code in ('HH', 'MI')
  and slot >= 10;

-- Контроль результата: каждая страна должна содержать ровно 600 фокусов,
-- по 10 фокусов в каждом из 60 сочетаний ветки и уровня.
do $$
declare
  country_code_to_check text;
  total_count integer;
  group_count integer;
begin
  foreach country_code_to_check in array array['HH', 'MI'] loop
    select count(*) into total_count
    from public.focuses
    where country_code = country_code_to_check;

    select count(*) into group_count
    from (
      select branch_id, tier
      from public.focuses
      where country_code = country_code_to_check
      group by branch_id, tier
      having count(*) = 10
         and count(distinct slot) = 10
         and min(slot) = 0
         and max(slot) = 9
    ) valid_groups;

    if total_count <> 600 or group_count <> 60 then
      raise exception
        'Проверка после очистки не пройдена для %: всего %, полных групп %. Транзакция будет отменена.',
        country_code_to_check, total_count, group_count;
    end if;
  end loop;
end;
$$;

commit;

-- Итоговая сводка после выполнения.
select
  country_code,
  count(*) as total_focuses,
  count(distinct branch_id) as branches,
  count(distinct (branch_id, tier)) as branch_tier_groups,
  min(slot) as min_slot,
  max(slot) as max_slot
from public.focuses
where country_code in ('HH', 'MI')
group by country_code
order by country_code;
