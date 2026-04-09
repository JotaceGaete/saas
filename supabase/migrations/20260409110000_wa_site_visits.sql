-- ============================================================
-- Tracking de visitas al sitio principal de Ventalink
-- (go.ventalink.app, ventalink.app)
-- Separado de wa_catalog_visits: distinto propósito y audiencia.
-- Inserts: solo via Edge Function (service_role).
-- Lectura: solo admin via RPC wa_admin_get_site_visit_stats().
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wa_site_visits (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  path         TEXT        NOT NULL,
  hostname     TEXT,
  source       TEXT,
  referrer     TEXT,
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  visitor_id   TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_site_visits_created_at
  ON public.wa_site_visits(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_site_visits_source
  ON public.wa_site_visits(source);

CREATE INDEX IF NOT EXISTS idx_wa_site_visits_hostname
  ON public.wa_site_visits(hostname);

CREATE INDEX IF NOT EXISTS idx_wa_site_visits_path
  ON public.wa_site_visits(path);

CREATE INDEX IF NOT EXISTS idx_wa_site_visits_visitor
  ON public.wa_site_visits(visitor_id)
  WHERE visitor_id IS NOT NULL;

COMMENT ON TABLE public.wa_site_visits IS 'Visitas al sitio principal de Ventalink. Solo lectura admin.';

ALTER TABLE public.wa_site_visits ENABLE ROW LEVEL SECURITY;
-- Sin políticas para usuarios normales: lectura exclusiva via RPC SECURITY DEFINER.

-- ── RPC admin: estadísticas de tráfico del sitio ─────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_admin_get_site_visit_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_30d   BIGINT;
  v_total_7d    BIGINT;
  v_total_today BIGINT;
  v_sources     JSONB;
  v_pages       JSONB;
  v_hostnames   JSONB;
BEGIN
  -- Solo admins (role en JWT claims)
  IF NOT (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin') OR
    (auth.jwt() -> 'app_metadata'  ->> 'role' = 'admin')
  ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT COUNT(*) INTO v_total_30d
  FROM public.wa_site_visits
  WHERE created_at >= now() - interval '30 days';

  SELECT COUNT(*) INTO v_total_7d
  FROM public.wa_site_visits
  WHERE created_at >= now() - interval '7 days';

  SELECT COUNT(*) INTO v_total_today
  FROM public.wa_site_visits
  WHERE created_at >= date_trunc('day', now());

  -- Top 8 fuentes últimos 30d
  SELECT jsonb_agg(t)
  INTO v_sources
  FROM (
    SELECT COALESCE(source, 'direct') AS source, COUNT(*) AS cnt
    FROM public.wa_site_visits
    WHERE created_at >= now() - interval '30 days'
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 8
  ) t;

  -- Top 8 páginas de entrada últimos 30d
  SELECT jsonb_agg(t)
  INTO v_pages
  FROM (
    SELECT path, COUNT(*) AS cnt
    FROM public.wa_site_visits
    WHERE created_at >= now() - interval '30 days'
    GROUP BY path
    ORDER BY cnt DESC
    LIMIT 8
  ) t;

  -- Desglose por hostname últimos 30d
  SELECT jsonb_agg(t)
  INTO v_hostnames
  FROM (
    SELECT COALESCE(hostname, 'desconocido') AS hostname, COUNT(*) AS cnt
    FROM public.wa_site_visits
    WHERE created_at >= now() - interval '30 days'
    GROUP BY hostname
    ORDER BY cnt DESC
  ) t;

  RETURN jsonb_build_object(
    'total30d',   v_total_30d,
    'total7d',    v_total_7d,
    'totalToday', v_total_today,
    'sources',    COALESCE(v_sources,    '[]'::jsonb),
    'pages',      COALESCE(v_pages,      '[]'::jsonb),
    'hostnames',  COALESCE(v_hostnames,  '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.wa_admin_get_site_visit_stats IS
  'Estadísticas de visitas al sitio principal. Solo accesible por admins (role en JWT).';

GRANT EXECUTE ON FUNCTION public.wa_admin_get_site_visit_stats TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
