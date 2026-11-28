-- АРСЕНАЛ: исправленное копирование дерева из hhh (HH).
-- Главное исправление: НЕ пересчитываем tier/slot через row_number().
-- Сохраняем исходные координаты каждого фокуса из HH.
-- Для уже скопированных записей обновляем только структуру (ветку, этап, позицию,
-- год и связи предпосылок), не затирая их названия/описания и статусы изучения.

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
       SELECT 1
       FROM public.countries c
       WHERE c.code = target_country_code
         AND COALESCE(c.is_active, true) = true
     ) THEN
    RAISE EXCEPTION 'Выберите существующую активную страну, отличную от hhh (HH)';
  END IF;

  SELECT count(*) INTO source_total
  FROM public.focuses
  WHERE country_code = 'HH';

  IF source_total = 0 THEN
    RAISE EXCEPTION 'В focuses не найдено исходное дерево hhh (country_code = HH)';
  END IF;

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
      SELECT array_agg(target_country_code || '-' || md5(p.prereq_id) ORDER BY p.ord)
      FROM unnest(COALESCE(src.prerequisites, '{}'::text[]))
           WITH ORDINALITY AS p(prereq_id, ord)
      WHERE EXISTS (
        SELECT 1
        FROM public.focuses source_prereq
        WHERE source_prereq.id = p.prereq_id
          AND source_prereq.country_code = 'HH'
      )
    ), '{}'::text[]),
    src.tier,
    src.slot,
    target_country_code,
    COALESCE(src.is_active, true),
    false
  FROM public.focuses src
  WHERE src.country_code = 'HH'
  ON CONFLICT (id) DO UPDATE
    SET branch_id = EXCLUDED.branch_id,
        year = EXCLUDED.year,
        tier = EXCLUDED.tier,
        slot = EXCLUDED.slot,
        prerequisites = EXCLUDED.prerequisites;

  GET DIAGNOSTICS copied_total = ROW_COUNT;
  RETURN copied_total;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_montesquieu_tree(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_montesquieu_tree(text) TO authenticated;

-- Обновляем кэш схемы PostgREST.
NOTIFY pgrst, 'reload schema';
