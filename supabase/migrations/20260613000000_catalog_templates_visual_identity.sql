-- Fase 2.5: identidad visual por plantilla de catálogo.
--
-- Al aplicar una plantilla, estos campos se copian a design_settings del
-- negocio SOLO si el negocio aún usa valores por defecto (nunca pisan
-- personalización del usuario). Mapeo a claves reales del catálogo:
--   primary_color   → design_settings.primaryColor (acento/CTA)
--   secondary_color → design_settings.backgroundColor (tinte de fondo)
--   theme           → design_settings.template ('light'|'dark'|'pastel',
--                     los presets que consume resolveCatalogTheme)
--   catalog_layout / button_style: reservados (el catálogo público aún no
--   los consume; se persisten para no perder la intención del admin).

ALTER TABLE public.catalog_templates
  ADD COLUMN IF NOT EXISTS primary_color   TEXT,
  ADD COLUMN IF NOT EXISTS secondary_color TEXT,
  ADD COLUMN IF NOT EXISTS theme           TEXT,
  ADD COLUMN IF NOT EXISTS catalog_layout  TEXT,
  ADD COLUMN IF NOT EXISTS button_style    TEXT;

-- Identidad inicial para las plantillas de sistema (solo si nadie las definió).
UPDATE public.catalog_templates
SET primary_color = '#7C3AED', theme = 'light'
WHERE slug = 'ropa-basica' AND primary_color IS NULL;

UPDATE public.catalog_templates
SET primary_color = '#EA580C', theme = 'light'
WHERE slug = 'restaurante' AND primary_color IS NULL;
