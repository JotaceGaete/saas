-- Agrega family_slug a catalog_templates para la arquitectura de familias.
--
-- Resolución de onboarding: rubro exacto → familia → universal.
-- Un template de familia NO tiene rubro_slug (sirve como catch-all para
-- todos los rubros de esa familia). El slug especial 'universal' actúa
-- como fallback final para cualquier rubro sin familia mapeada.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

ALTER TABLE public.catalog_templates
  ADD COLUMN IF NOT EXISTS family_slug TEXT;

-- Un solo template activo por familia (cuando NO tiene rubro específico).
-- Cubre también el caso universal (family_slug = 'universal').
CREATE UNIQUE INDEX IF NOT EXISTS catalog_templates_family_active_unique
  ON public.catalog_templates (family_slug)
  WHERE is_active = TRUE AND rubro_slug IS NULL AND family_slug IS NOT NULL;

-- Backfill: templates existentes reciben su familia.
UPDATE public.catalog_templates
  SET family_slug = 'moda'
  WHERE rubro_slug = 'ropa' AND family_slug IS NULL;

UPDATE public.catalog_templates
  SET family_slug = 'comida'
  WHERE rubro_slug = 'comida-y-bebidas' AND family_slug IS NULL;
