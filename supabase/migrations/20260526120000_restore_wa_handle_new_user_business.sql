-- Restore signup business creation.
-- Production currently has auth.users -> wa_on_auth_user_created -> wa_handle_new_user_business(),
-- but the function is a noop. Keep this migration scoped to the trigger function only.
--
-- Note: wa_businesses.user_id has a regular index in the migrations history, not a
-- unique constraint. Do not add a constraint here without auditing existing duplicates.

CREATE OR REPLACE FUNCTION public.wa_handle_new_user_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_name       TEXT;
  v_slug_seed  TEXT;
  v_base_slug  TEXT;
  v_slug       TEXT;
  v_suffix     TEXT;
  v_counter    INTEGER := 0;
BEGIN
  -- Prevent duplicate businesses without assuming a unique constraint on user_id.
  IF EXISTS (
    SELECT 1
    FROM public.wa_businesses
    WHERE user_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  v_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'business_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(btrim(split_part(COALESCE(NEW.email, ''), '@', 1)), ''),
    'Mi negocio'
  );

  v_slug_seed := COALESCE(NULLIF(v_name, ''), NULLIF(NEW.email, ''), 'negocio');
  v_base_slug := lower(v_slug_seed);
  v_base_slug := regexp_replace(v_base_slug, '[^a-z0-9]+', '-', 'g');
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN
    v_base_slug := 'negocio';
  END IF;

  v_suffix := substr(replace(NEW.id::TEXT, '-', ''), 1, 6);
  IF v_suffix = '' THEN
    v_suffix := substr(md5(COALESCE(NEW.email, v_name, random()::TEXT)), 1, 6);
  END IF;

  v_slug := v_base_slug || '-' || v_suffix;

  WHILE EXISTS (
    SELECT 1
    FROM public.wa_businesses
    WHERE slug = v_slug
  ) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_suffix || '-' || v_counter::TEXT;
  END LOOP;

  INSERT INTO public.wa_businesses (
    user_id,
    name,
    whatsapp,
    email,
    slug,
    is_active,
    plan_slug,
    trial_expires_at
  ) VALUES (
    NEW.id,
    v_name,
    COALESCE(NEW.raw_user_meta_data->>'whatsapp', ''),
    NEW.email,
    v_slug,
    true,
    'pro',
    now() + interval '14 days'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'wa_handle_new_user_business failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.wa_handle_new_user_business() IS
  'Creates a wa_businesses row for new auth.users. Safe trigger function: never aborts signup.';

-- Backfill opcional, NO ejecutado automáticamente.
-- Úsalo manualmente solo después de revisar duplicados en wa_businesses.user_id.
-- Crea negocios faltantes para usuarios existentes sin negocio, con Pro trial por 14 días desde now().
/*
WITH missing_users AS (
  SELECT
    u.id,
    u.email,
    u.raw_user_meta_data,
    COALESCE(
      NULLIF(btrim(u.raw_user_meta_data->>'business_name'), ''),
      NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(btrim(split_part(COALESCE(u.email, ''), '@', 1)), ''),
      'Mi negocio'
    ) AS business_name
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.wa_businesses b
    WHERE b.user_id = u.id
  )
),
prepared AS (
  SELECT
    id,
    email,
    raw_user_meta_data,
    business_name,
    COALESCE(
      NULLIF(
        trim(both '-' from regexp_replace(lower(business_name), '[^a-z0-9]+', '-', 'g')),
        ''
      ),
      'negocio'
    ) AS base_slug,
    substr(replace(id::TEXT, '-', ''), 1, 6) AS suffix
  FROM missing_users
)
INSERT INTO public.wa_businesses (
  user_id,
  name,
  whatsapp,
  email,
  slug,
  is_active,
  plan_slug,
  trial_expires_at
)
SELECT
  id,
  business_name,
  COALESCE(raw_user_meta_data->>'whatsapp', ''),
  email,
  base_slug || '-' || suffix,
  true,
  'pro',
  now() + interval '14 days'
FROM prepared
ON CONFLICT (slug) DO NOTHING;
*/
