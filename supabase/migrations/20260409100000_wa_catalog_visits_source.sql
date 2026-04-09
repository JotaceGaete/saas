-- Add traffic source tracking to wa_catalog_visits
-- source: detected channel (instagram, tiktok, google, whatsapp, direct, etc.)
-- utm_source: raw UTM parameter from URL
-- referrer column already exists; this migration keeps it untouched.

ALTER TABLE public.wa_catalog_visits
  ADD COLUMN IF NOT EXISTS source     TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT;

CREATE INDEX IF NOT EXISTS idx_wa_catalog_visits_source
  ON public.wa_catalog_visits(business_id, source);

COMMENT ON COLUMN public.wa_catalog_visits.source     IS 'Detected traffic source (instagram, tiktok, google, whatsapp, facebook, direct, …)';
COMMENT ON COLUMN public.wa_catalog_visits.utm_source IS 'Raw utm_source query param passed by the visitor';

-- Updated RPC: includes per-source breakdown for the last 30 days
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
    source_breakdown JSONB;
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

    -- Group by source for the last 30 days; NULL source counts as 'direct'
    SELECT jsonb_object_agg(src, cnt)
    INTO source_breakdown
    FROM (
      SELECT COALESCE(source, 'direct') AS src, COUNT(*) AS cnt
      FROM public.wa_catalog_visits
      WHERE business_id = p_business_id
        AND created_at >= (now() - interval '30 days')
      GROUP BY src
    ) t;

    RETURN jsonb_build_object(
      'totalVisits',      total_visits,
      'visits30d',        visits_30d,
      'visits7d',         visits_7d,
      'visitsToday',      visits_today,
      'sourceBreakdown',  COALESCE(source_breakdown, '{}'::jsonb)
    );
  END;
$$;

COMMENT ON FUNCTION public.wa_get_business_visit_stats IS 'Estadísticas de visitas al catálogo para el dueño del negocio, incluyendo desglose por source.';

NOTIFY pgrst, 'reload schema';
