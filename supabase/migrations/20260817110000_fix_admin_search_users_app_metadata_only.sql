-- ============================================================
-- Fix de seguridad: admin_search_users() debe confiar EXCLUSIVAMENTE en
-- app_metadata.role para su gate de autorización.
--
-- Mismo hallazgo y misma causa raíz que
-- 20260817100000_fix_wa_is_admin_app_metadata_only.sql, pero en una
-- función SEPARADA e independiente: admin_search_users() (creada en
-- 20260602030000_admin_search_users_fn.sql) NO reutiliza public.wa_is_admin()
-- -- tiene su propia verificación de rol admin duplicada inline, que
-- también aceptaba user_metadata.role='admin' (editable por el propio
-- usuario vía supabase.auth.updateUser(), sin privilegios especiales).
--
-- Único cambio: el gate de autorización (antes SELECT COALESCE(raw_app_meta_data
-- ->>'role', raw_user_meta_data->>'role', '') = 'admin'). El campo `role` que
-- esta función devuelve en cada fila del listado (línea "COALESCE(u.raw_app_meta_data
-- ->>'role', u.raw_user_meta_data->>'role') AS role") es puramente informativo
-- para la UI del panel admin -- no es una decisión de autorización -- y se deja
-- sin cambios a propósito, fuera del alcance de este fix.
--
-- Verificado en producción antes de aplicar: los 4 administradores reales
-- actuales tienen app_metadata.role='admin' y user_metadata.role NULL --
-- sin riesgo de lockout conocido (misma verificación que el fix de
-- wa_is_admin()).
--
-- Firma y comportamiento preservados exactamente salvo el gate de
-- autorización.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_search_users(
  search_term  TEXT    DEFAULT '',
  p_limit      INT     DEFAULT 100,
  p_offset     INT     DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  calling_user_id UUID;
  is_admin        BOOLEAN;
  result          JSONB;
BEGIN
  -- Obtener usuario actual
  calling_user_id := auth.uid();
  IF calling_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Verificar rol admin EXCLUSIVAMENTE en app_metadata -- NUNCA
  -- user_metadata (editable por el propio usuario, sin privilegios
  -- especiales; fix de escalación de privilegios, 2026-08-17).
  SELECT (
    COALESCE(raw_app_meta_data->>'role', '') = 'admin'
  ) INTO is_admin
  FROM auth.users
  WHERE id = calling_user_id;

  IF NOT COALESCE(is_admin, FALSE) THEN
    RAISE EXCEPTION 'Forbidden: solo admins';
  END IF;

  -- Construir resultado: usuarios con sus negocios
  WITH user_businesses AS (
    SELECT
      b.user_id,
      jsonb_agg(
        jsonb_build_object(
          'id',               b.id,
          'name',             b.name,
          'slug',             b.slug,
          'email',            b.email,
          'plan_slug',        b.plan_slug,
          'plan_expires_at',  b.plan_expires_at,
          'trial_expires_at', b.trial_expires_at,
          'is_active',        b.is_active
        ) ORDER BY b.created_at DESC
      ) AS businesses
    FROM wa_businesses b
    GROUP BY b.user_id
  ),
  matching_users AS (
    SELECT DISTINCT u.id
    FROM auth.users u
    LEFT JOIN wa_businesses b ON b.user_id = u.id
    WHERE (
      search_term = ''
      OR u.email        ILIKE '%' || search_term || '%'
      OR u.id::text              =   search_term
      OR b.name         ILIKE '%' || search_term || '%'
      OR b.email        ILIKE '%' || search_term || '%'
      OR b.slug         ILIKE '%' || search_term || '%'
      OR b.id::text              =   search_term
    )
  )
  SELECT COALESCE(jsonb_agg(row ORDER BY row.created_at DESC), '[]'::jsonb) INTO result
  FROM (
    SELECT
      u.id,
      u.email,
      u.created_at,
      u.last_sign_in_at,
      u.banned_until,
      -- Campo informativo para la UI del panel admin (qué rol muestra
      -- listar), no es una decisión de autorización -- fuera del alcance
      -- de este fix, sin cambios.
      COALESCE(u.raw_app_meta_data->>'role', u.raw_user_meta_data->>'role') AS role,
      COALESCE(ub.businesses, '[]'::jsonb)                                  AS businesses
    FROM auth.users u
    INNER JOIN matching_users m ON m.id = u.id
    LEFT JOIN  user_businesses ub ON ub.user_id = u.id
    ORDER BY u.created_at DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) row;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_search_users(TEXT, INT, INT) TO authenticated;

COMMENT ON FUNCTION public.admin_search_users IS
  'Busca usuarios (auth.users + wa_businesses) para el panel admin. Solo accesible a admins -- gate de autorización basado exclusivamente en app_metadata.role (nunca user_metadata, fix 2026-08-17). El campo `role` devuelto en cada fila es informativo, no de autorización.';

NOTIFY pgrst, 'reload schema';
