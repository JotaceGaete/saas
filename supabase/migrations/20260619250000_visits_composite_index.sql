-- ============================================================
-- wa_catalog_visits: índice compuesto (business_id, created_at DESC)
--
-- Justificación:
--   Los índices existentes son:
--     idx_wa_catalog_visits_business_id    → (business_id) solo
--     idx_wa_catalog_visits_created_at_d   → (created_at DESC) solo
--   Dashboard y RPCs filtran por business_id Y rango de created_at.
--   Un solo index barrido en lugar de dos + merge evita full scans
--   a medida que la tabla crece con miles de negocios.
--
-- wa_site_visits: no tiene business_id (tabla global); los índices
--   existentes (created_at DESC, source, path, hostname) son suficientes
--   para los patrones de acceso actuales.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_wa_catalog_visits_business_created
  ON public.wa_catalog_visits (business_id, created_at DESC);
