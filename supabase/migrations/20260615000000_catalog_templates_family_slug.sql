-- Agrega family_slug a catalog_templates para resolución jerárquica de plantillas:
--   rubro_slug exacto → family_slug → universal (is_universal = true) → JS fallback
--
-- No elimina ni modifica datos existentes.
-- Índices únicos parciales garantizan que:
--   - Un rubro solo puede tener una plantilla activa (ya existía).
--   - Una familia solo puede tener una plantilla activa SIN rubro asociado.
--   - Solo puede haber una plantilla universal activa.

ALTER TABLE public.catalog_templates
  ADD COLUMN IF NOT EXISTS family_slug TEXT,
  ADD COLUMN IF NOT EXISTS is_universal BOOLEAN NOT NULL DEFAULT false;

-- Índice de búsqueda por family_slug
CREATE INDEX IF NOT EXISTS idx_catalog_templates_family_slug
  ON public.catalog_templates(family_slug)
  WHERE family_slug IS NOT NULL;

-- Índice único parcial: una sola plantilla activa por familia
-- cuando NO tiene rubro específico (evita ambigüedad en la resolución).
CREATE UNIQUE INDEX IF NOT EXISTS catalog_templates_family_active_unique
  ON public.catalog_templates(family_slug)
  WHERE family_slug IS NOT NULL
    AND rubro_slug IS NULL
    AND is_active = true;

-- Índice único parcial: solo una plantilla universal activa.
CREATE UNIQUE INDEX IF NOT EXISTS catalog_templates_universal_active_unique
  ON public.catalog_templates((is_universal))
  WHERE is_universal = true AND is_active = true;

COMMENT ON COLUMN public.catalog_templates.family_slug IS
  'Familia comercial del template (moda, comida, belleza, servicios, hogar, mascotas, tecnologia, salud, regalos). '
  'Resolución: rubro_slug exacto → family_slug (sin rubro) → is_universal → JS fallback.';

COMMENT ON COLUMN public.catalog_templates.is_universal IS
  'Plantilla universal activa como último fallback antes del JS hardcodeado. '
  'Solo puede existir una plantilla universal activa a la vez.';
