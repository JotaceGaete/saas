-- ============================================================
-- Fix de seguridad CRÍTICO: los 3 gates admin de user_sessions_tracking
-- deben autorizar exclusivamente vía public.wa_is_admin() -- nunca un
-- chequeo directo de user_metadata.role.
--
-- CAUSA RAÍZ (20260604000000_user_sessions_tracking.sql): 3 puntos
-- independientes con el mismo patrón de auto-escalación, ninguno
-- reutilizaba wa_is_admin():
--   1. Policy "user_sessions_admin_read" (líneas 38-44) -- permite leer
--      TODAS las sesiones de TODOS los usuarios (ip_address, user_agent,
--      duración, timestamps de login).
--   2. admin_get_users_with_session_stats() (líneas 126-166) -- expone
--      email, negocio, plan y estadísticas de sesión de cualquier usuario.
--   3. admin_get_user_session_detail() (líneas 169-197) -- expone el
--      historial de sesiones de un usuario puntual, INCLUIDA su
--      dirección IP.
-- Este es el hallazgo más serio de los 3 encontrados en la auditoría de
-- la Sección 9 (turno anterior): permitía a cualquier usuario
-- auto-elevado vía user_metadata leer IP y comportamiento de sesión de
-- cualquier otro usuario del sistema.
--
-- Principio de diseño de esta ronda: public.wa_is_admin() es la ÚNICA
-- fuente de autoridad admin en SQL.
--
-- La policy se recrea con DROP POLICY IF EXISTS + CREATE POLICY (mismo
-- patrón que usa la propia migración histórica para sus otras policies).
-- Firma y comportamiento de las 2 RPCs preservados exactamente salvo el
-- gate de autorización. start_user_session/touch_user_session/
-- end_user_session no se tocan -- ya se auto-scopean con auth.uid(), sin
-- ningún chequeo de rol.
-- ============================================================

-- 1. Policy de lectura admin sobre user_sessions.
DROP POLICY IF EXISTS "user_sessions_admin_read" ON public.user_sessions;
CREATE POLICY "user_sessions_admin_read" ON public.user_sessions
  FOR SELECT USING (public.wa_is_admin());

-- 2. admin_get_users_with_session_stats()
CREATE OR REPLACE FUNCTION public.admin_get_users_with_session_stats()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  business_id UUID,
  business_name TEXT,
  plan_slug TEXT,
  created_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  sessions_30d BIGINT,
  total_duration_30d_seconds BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo admins -- fuente única: public.wa_is_admin() (app_metadata.role
  -- exclusivamente, fix 2026-08-17).
  IF NOT public.wa_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::TEXT,
    b.id AS business_id,
    b.name AS business_name,
    b.plan_slug::TEXT,
    u.created_at,
    MAX(s.last_seen_at) AS last_seen_at,
    COUNT(s.id) FILTER (WHERE s.login_at >= now() - INTERVAL '30 days') AS sessions_30d,
    COALESCE(SUM(s.duration_seconds) FILTER (WHERE s.login_at >= now() - INTERVAL '30 days'), 0)::BIGINT AS total_duration_30d_seconds
  FROM auth.users u
  LEFT JOIN public.wa_businesses b ON b.user_id = u.id
  LEFT JOIN public.user_sessions s ON s.user_id = u.id
  GROUP BY u.id, u.email, b.id, b.name, b.plan_slug, u.created_at;
END;
$$;

COMMENT ON FUNCTION public.admin_get_users_with_session_stats IS
  'Lista de usuarios con estadísticas de sesión, para el panel admin. Solo accesible vía public.wa_is_admin() (app_metadata.role exclusivamente, nunca user_metadata -- fix 2026-08-17).';

-- 3. admin_get_user_session_detail(p_user_id) -- expone ip_address, el
--    campo más sensible de todo este hallazgo.
CREATE OR REPLACE FUNCTION public.admin_get_user_session_detail(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  login_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  logout_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  ip_address TEXT,
  user_agent TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo admins -- fuente única: public.wa_is_admin() (app_metadata.role
  -- exclusivamente, fix 2026-08-17).
  IF NOT public.wa_is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT s.id, s.login_at, s.last_seen_at, s.logout_at, s.duration_seconds, s.ip_address, s.user_agent
  FROM public.user_sessions s
  WHERE s.user_id = p_user_id
  ORDER BY s.login_at DESC
  LIMIT 20;
END;
$$;

COMMENT ON FUNCTION public.admin_get_user_session_detail IS
  'Detalle de sesiones (incluye ip_address) de un usuario puntual, para el panel admin. Solo accesible vía public.wa_is_admin() (app_metadata.role exclusivamente, nunca user_metadata -- fix 2026-08-17).';

NOTIFY pgrst, 'reload schema';
