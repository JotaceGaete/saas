-- Add is_main_featured to wa_products
-- Idempotent and safe with pre-existing data.

ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS is_main_featured boolean NOT NULL DEFAULT false;

WITH ranked AS (
  SELECT
    id,
    business_id,
    ROW_NUMBER() OVER (
      PARTITION BY business_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.wa_products
  WHERE is_main_featured = true
)
UPDATE public.wa_products AS p
SET is_main_featured = false
FROM ranked
WHERE p.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS wa_products_one_main_featured_per_business_idx
  ON public.wa_products (business_id)
  WHERE is_main_featured = true;
