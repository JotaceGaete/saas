-- El UNIQUE total de catalog_templates.rubro_slug impedía tener una plantilla
-- inactiva (borrador/respaldo) del mismo rubro que la activa. La regla real es:
-- no puede haber DOS ACTIVAS con el mismo rubro (es la que elige el onboarding).
-- Se reemplaza por un índice único parcial sobre plantillas activas.

ALTER TABLE public.catalog_templates
  DROP CONSTRAINT IF EXISTS catalog_templates_rubro_slug_key;
DROP INDEX IF EXISTS public.catalog_templates_rubro_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS catalog_templates_rubro_active_unique
  ON public.catalog_templates (rubro_slug)
  WHERE rubro_slug IS NOT NULL AND is_active = true;
