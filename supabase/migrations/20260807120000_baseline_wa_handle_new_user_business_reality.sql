-- Línea base de reconciliación: documenta en `main` la definición REAL de
-- wa_handle_new_user_business() que ya corre en producción, sin modificarla.
--
-- Contexto (investigación completa, no repetida acá): `main` quedó describiendo
-- una versión de esta función (país/moneda inferidos, INSERT en
-- billing_subscriptions, UPDATE de auth.users.raw_app_meta_data) que dejó de
-- estar vigente en producción desde el 20 de abril, cuando otra rama
-- (feat/onboarding-country-gate, nunca fusionada a main) reemplazó el trigger
-- por un no-op y movió la creación de negocio a un flujo de onboarding manual.
-- El 26 de mayo, la rama fix/signup-email-confirmation-response (tampoco
-- fusionada a main) restauró una versión mínima del trigger — esa es la que
-- confirmamos byte a byte contra producción y es la que este archivo fija
-- como línea base.
--
-- Diseño aceptado a partir de acá: Auth -> trigger -> wa_businesses.
-- Deliberadamente NO crea billing_subscriptions, NO actualiza auth.users,
-- NO infiere país/moneda. Eso se resuelve en otras capas (StoreCreationStep /
-- Configuración / providers de billing), no en el trigger de signup.
--
-- Esta migración es un CREATE OR REPLACE con contenido idéntico al que ya
-- está vivo en producción: aplicarla ahí no cambia ningún comportamiento,
-- solo hace que el historial de `main` dejara de estar desactualizado.

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
  'Crea una fila mínima en wa_businesses al signup (Auth -> trigger -> wa_businesses). '
  'Deliberadamente no crea billing_subscriptions, no actualiza auth.users ni infiere '
  'país/moneda -- eso se resuelve en otras capas. Línea base de reconciliación con '
  'producción (2026-08-07), reemplaza la definición desactualizada que main tenía antes.';
