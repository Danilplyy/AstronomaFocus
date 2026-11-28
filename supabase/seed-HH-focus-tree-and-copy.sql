-- Исправление источника копирования дерева Монтескью.
-- В исходном проекте полное дерево Монтескью загружалось в MI.
-- Этот скрипт один раз переносит его копию в новую страну hhh (HH),
-- после чего функция clone_montesquieu_tree копирует дерево уже из HH.
-- Исходное дерево MI не изменяется и не удаляется. Скрипт можно запускать повторно.

DO $$
DECLARE
  mi_count integer;
  hh_exists boolean;
BEGIN
  SELECT count(*) INTO mi_count
  FROM public.focuses
  WHERE country_code = 'MI';

  IF mi_count = 0 THEN
    RAISE EXCEPTION 'В focuses нет исходных фокусов MI. Сначала загрузите исходное дерево Монтескью (MI) через npm run seed.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.countries WHERE code = 'HH'
  ) INTO hh_exists;

  IF NOT hh_exists THEN
    RAISE EXCEPTION 'Страна hhh с кодом HH не найдена в public.countries. Сначала создайте её в админ-панели.';
  END IF;
END $$;

-- Создаём исходное дерево HH из старого дерева Монтескью MI.
-- ID и ссылки предпосылок переводятся в пространство HH.
INSERT INTO public.focuses (
  id, branch_id, title, description, year, cost, prerequisites,
  tier, slot, country_code, is_active, admin_completed
)
SELECT
  'HH-' || md5(src.id),
  src.branch_id,
  src.title,
  src.description,
  src.year,
  src.cost,
  COALESCE((
    SELECT array_agg('HH-' || md5(p.prereq_id) ORDER BY p.ord)
    FROM unnest(COALESCE(src.prerequisites, '{}'::text[]))
         WITH ORDINALITY AS p(prereq_id, ord)
    WHERE EXISTS (
      SELECT 1 FROM public.focuses source_prereq
      WHERE source_prereq.id = p.prereq_id
        AND source_prereq.country_code = 'MI'
    )
  ), '{}'::text[]),
  src.tier,
  src.slot,
  'HH',
  COALESCE(src.is_active, true),
  false
FROM public.focuses src
WHERE src.country_code = 'MI'
ON CONFLICT (id) DO NOTHING;

-- Пересоздаём функцию: теперь она копирует дерево ИЗ HH.
CREATE OR REPLACE FUNCTION public.clone_montesquieu_tree(target_country_code text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_total integer;
  copied_total integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Только администратор может копировать технологическое дерево';
  END IF;

  IF target_country_code IS NULL
     OR target_country_code = 'HH'
     OR NOT EXISTS (
       SELECT 1 FROM public.countries c
       WHERE c.code = target_country_code
         AND COALESCE(c.is_active, true) = true
     ) THEN
    RAISE EXCEPTION 'Выберите существующую активную страну, отличную от hhh (HH)';
  END IF;

  SELECT count(*) INTO source_total
  FROM public.focuses
  WHERE country_code = 'HH';

  IF source_total = 0 THEN
    RAISE EXCEPTION 'В focuses не найдено дерево hhh (HH). Повторно выполните этот SQL-скрипт.';
  END IF;

  WITH ranked_source AS (
    SELECT src.*,
           row_number() OVER (
             PARTITION BY src.branch_id
             ORDER BY src.year, src.tier, src.slot, src.id
           ) - 1 AS rn,
           count(*) OVER (PARTITION BY src.branch_id) AS total
    FROM public.focuses src
    WHERE src.country_code = 'HH'
  )
  INSERT INTO public.focuses (
    id, branch_id, title, description, year, cost, prerequisites,
    tier, slot, country_code, is_active, admin_completed
  )
  SELECT
    target_country_code || '-' || md5(src.id),
    src.branch_id,
    src.title,
    src.description,
    src.year,
    src.cost,
    COALESCE((
      SELECT array_agg(target_country_code || '-' || md5(prereq_id) ORDER BY ord)
      FROM unnest(COALESCE(src.prerequisites, '{}'::text[]))
           WITH ORDINALITY AS p(prereq_id, ord)
      WHERE EXISTS (
        SELECT 1 FROM public.focuses source_prereq
        WHERE source_prereq.id = p.prereq_id
          AND source_prereq.country_code = 'HH'
      )
    ), '{}'::text[]),
    LEAST(9, floor(src.rn * 10.0 / NULLIF(src.total, 0))::integer),
    mod(src.rn, greatest(1, ceil(src.total / 10.0)::integer)),
    target_country_code,
    COALESCE(src.is_active, true),
    false
  FROM ranked_source src
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS copied_total = ROW_COUNT;
  RETURN copied_total;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_montesquieu_tree(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_montesquieu_tree(text) TO authenticated;

-- Обновляем кэш схемы PostgREST, чтобы Supabase сразу увидел изменения.
NOTIFY pgrst, 'reload schema';
