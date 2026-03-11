-- ============================================================
-- Analítica de visitas al catálogo público por negocio
-- Solo visitas a /catalogo/:slug o /catalog/:slug
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wa_catalog_visits (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID       NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  slug        TEXT        NOT NULL,
  path        TEXT,
  visitor_id  TEXT,
  referrer    TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_catalog_visits_business_id ON public.wa_catalog_visits(business_id);
CREATE INDEX IF NOT EXISTS idx_wa_catalog_visits_created_at_d ON public.wa_catalog_visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_catalog_visits_slug ON public.wa_catalog_visits(slug);
CREATE INDEX IF NOT EXISTS idx_wa_catalog_visits_business_visitor_created
  ON public.wa_catalog_visits(business_id, visitor_id, created_at DESC)
  WHERE visitor_id IS NOT NULL;

COMMENT ON TABLE public.wa_catalog_visits IS 'Visitas al catálogo público. Registradas desde el frontend con throttling.';

ALTER TABLE public.wa_catalog_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_catalog_visits_owner_select" ON public.wa_catalog_visits;
CREATE POLICY "wa_catalog_visits_owner_select"
  ON public.wa_catalog_visits FOR SELECT TO authenticated
  USING (
    business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid())
  );

-- Inserts solo desde backend (Edge Function con service_role)
-- No policy INSERT para anon/authenticated; la función usa service_role.

-- RPC: estadísticas de visitas para el dueño del negocio
CREATE OR REPLACE FUNCTION public.wa_get_business_visit_stats(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    total_visits   BIGINT;
    visits_30d     BIGINT;
    visits_7d      BIGINT;
    visits_today   BIGINT;
  BEGIN
    IF NOT (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.wa_businesses b WHERE b.id = p_business_id AND b.user_id = auth.uid()
    )) THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    SELECT COUNT(*) INTO total_visits FROM public.wa_catalog_visits WHERE business_id = p_business_id;

    SELECT COUNT(*) INTO visits_30d
    FROM public.wa_catalog_visits
    WHERE business_id = p_business_id AND created_at >= (now() - interval '30 days');

    SELECT COUNT(*) INTO visits_7d
    FROM public.wa_catalog_visits
    WHERE business_id = p_business_id AND created_at >= (now() - interval '7 days');

    SELECT COUNT(*) INTO visits_today
    FROM public.wa_catalog_visits
    WHERE business_id = p_business_id AND created_at >= date_trunc('day', now());

    RETURN jsonb_build_object(
      'totalVisits', total_visits,
      'visits30d',   visits_30d,
      'visits7d',    visits_7d,
      'visitsToday', visits_today
    );
  END;
$$;

COMMENT ON FUNCTION public.wa_get_business_visit_stats IS 'Estadísticas de visitas al catálogo para el dueño del negocio.';

NOTIFY pgrst, 'reload schema';
