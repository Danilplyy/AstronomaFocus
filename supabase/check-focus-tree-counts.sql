-- Диагностика количества и расположения фокусов по странам.
-- Выполнить в Supabase SQL Editor и посмотреть результаты.

-- 1. Сколько фокусов всего и в каждой ветке.
SELECT
  country_code,
  branch_id,
  COUNT(*) AS focus_count
FROM public.focuses
WHERE country_code IN ('HH', 'MI', 'NF', 'CI')
GROUP BY country_code, branch_id
ORDER BY country_code, branch_id;

-- 2. Сколько фокусов находится на каждом этапе.
SELECT
  country_code,
  branch_id,
  tier,
  COUNT(*) AS focus_count,
  MIN(slot) AS min_slot,
  MAX(slot) AS max_slot
FROM public.focuses
WHERE country_code IN ('HH', 'MI', 'NF', 'CI')
GROUP BY country_code, branch_id, tier
ORDER BY country_code, branch_id, tier;

-- 3. Найти возможные повторяющиеся позиции внутри этапа одной ветки.
SELECT
  country_code,
  branch_id,
  tier,
  slot,
  COUNT(*) AS duplicate_count,
  STRING_AGG(title, ' | ' ORDER BY title) AS titles
FROM public.focuses
WHERE country_code IN ('HH', 'MI', 'NF', 'CI')
GROUP BY country_code, branch_id, tier, slot
HAVING COUNT(*) > 1
ORDER BY country_code, branch_id, tier, slot;
