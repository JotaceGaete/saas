-- ============================================================
-- Fix de seguridad: wa_is_admin() debe confiar EXCLUSIVAMENTE en
-- app_metadata.role.
--
-- CAUSA RAÍZ (20260309260000_admin_rls.sql): la función original acepta
-- user_metadata.role='admin' como fallback:
--   SELECT COALESCE(
--     (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
--     (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
--     false
--   );
-- user_metadata (raw_user_meta_data) es escribible por cualquier usuario
-- autenticado vía el SDK público: supabase.auth.updateUser({ data: { role:
-- 'admin' } }) -- sin ningún privilegio especial. Esto permite
-- auto-escalación de privilegios: cualquier usuario autenticado puede
-- otorgarse a sí mismo acceso admin (lectura de datos de otros afiliados,
-- aprobación/rechazo de retiros bancarios reales, etc. -- 16 migraciones
-- dependen de esta función vía RLS policies o guardas internas
-- IF NOT public.wa_is_admin()).
--
-- app_metadata (raw_app_meta_data) SOLO es escribible vía Auth Admin API
-- con service_role (ver supabase/functions/admin-users/index.ts,
-- action='setRole', que ya escribía exclusivamente ahí antes de este fix).
-- Es la única fuente de verdad segura para autorización.
--
-- Verificado en producción antes de aplicar este fix: los 4 administradores
-- reales actuales tienen app_metadata.role='admin' y user_metadata.role
-- NULL -- ninguno depende del fallback que se elimina acá. Sin riesgo de
-- lockout conocido.
--
-- Firma preservada exactamente (sin argumentos, RETURNS boolean, STABLE,
-- SECURITY DEFINER, SET search_path = public) -- no rompe ninguna de las
-- ~16 migraciones que dependen de ella.
-- ============================================================

CREATE OR REPLACE FUNCTION public.wa_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

COMMENT ON FUNCTION public.wa_is_admin() IS
  'Retorna true si auth.jwt().app_metadata.role = admin. NUNCA confía en user_metadata (editable por el propio usuario vía supabase.auth.updateUser, sin privilegios especiales) -- fix de escalación de privilegios (2026-08-17). Firma sin cambios: consumida por ~16 migraciones previas vía RLS policies USING(public.wa_is_admin()) y guardas internas IF NOT public.wa_is_admin().';

NOTIFY pgrst, 'reload schema';
