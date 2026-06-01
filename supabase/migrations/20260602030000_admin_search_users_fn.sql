-- Función SQL para buscar usuarios desde el panel admin sin depender de Edge Functions.
-- Usa SECURITY DEFINER para acceder a auth.users. Solo ejecutable por usuarios admin.

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

  -- Verificar rol admin en app_metadata o user_metadata
  SELECT (
    COALESCE(raw_app_meta_data->>'role', raw_user_meta_data->>'role', '') = 'admin'
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

-- Permitir que usuarios autenticados ejecuten la función (la función misma verifica admin)
GRANT EXECUTE ON FUNCTION public.admin_search_users(TEXT, INT, INT) TO authenticated;

COMMENT ON FUNCTION public.admin_search_users IS
  'Busca usuarios (auth.users + wa_businesses) para el panel admin. Solo accesible a admins.';
