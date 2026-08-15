-- ============================================================
-- Fix de seguridad: wa_admin_get_site_visit_stats() debe autorizar
-- exclusivamente vía public.wa_is_admin() -- nunca un chequeo directo de
-- user_metadata.role.
--
-- CAUSA RAÍZ (20260409110000_wa_site_visits.sql:61-64): mismo patrón que
-- wa_admin_set_daily_message() -- chequeo inline duplicado que aceptaba
-- user_metadata.role='admin'. Esta función NO reutilizaba wa_is_admin().
--
-- Principio de diseño de esta ronda: public.wa_is_admin() es la ÚNICA
-- fuente de autoridad admin en SQL.
--
-- Firma y comportamiento preservados exactamente salvo el gate de
-- autorización.
-- ============================================================

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
  -- Solo admins -- fuente única: public.wa_is_admin() (app_metadata.role
  -- exclusivamente, fix 2026-08-17).
  IF NOT public.wa_is_admin() THEN
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
  'Estadísticas de visitas al sitio principal. Solo accesible por admins vía public.wa_is_admin() (app_metadata.role exclusivamente, nunca user_metadata -- fix 2026-08-17).';

NOTIFY pgrst, 'reload schema';
