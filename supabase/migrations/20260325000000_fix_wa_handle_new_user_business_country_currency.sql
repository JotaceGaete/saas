-- Fix: wa_handle_new_user_business should not force fallback CL/CLP.
-- Root cause:
-- - country_code missing in raw_user_meta_data → defaulted to 'CL'
-- - currency set with `CASE WHEN v_country_code = 'AR' THEN 'ARS' ELSE 'CLP' END`
--
-- New rules:
-- - If metadata has a supported country_code, preserve it.
-- - If missing/unsupported, leave country_code NULL (neutral) and currency 'USD' (table default).
--   The real onboarding (createBusiness) will persist final country_code/currency.

CREATE OR REPLACE FUNCTION public.wa_handle_new_user_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name         TEXT;
  v_whatsapp     TEXT;
  v_slug         TEXT;
  v_base_slug    TEXT;
  v_counter      INTEGER := 0;
  v_country_code TEXT;
  v_phone_digits TEXT;
  v_trial_end    TIMESTAMPTZ;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1),
    'Mi Negocio'
  );

  -- Detección Inteligente de País por Prefijo de WhatsApp
  v_whatsapp := COALESCE(NEW.raw_user_meta_data->>'whatsapp', '');

  -- 1. Intentar obtenerlo de los metadatos primero
  v_country_code := upper(COALESCE(NULLIF(NEW.raw_user_meta_data->>'country_code', ''), ''));

  -- 2. Si no viene en metadatos, inferir por el prefijo del número de teléfono
  IF v_country_code = '' THEN
    v_phone_digits := regexp_replace(v_whatsapp, '\D', '', 'g');
    v_country_code := CASE
      WHEN v_phone_digits LIKE '57%' THEN 'CO'  -- Colombia
      WHEN v_phone_digits LIKE '54%' THEN 'AR'  -- Argentina
      WHEN v_phone_digits LIKE '56%' THEN 'CL'  -- Chile
      WHEN v_phone_digits LIKE '598%' THEN 'UY' -- Uruguay
      WHEN v_phone_digits LIKE '595%' THEN 'PY' -- Paraguay
      WHEN v_phone_digits LIKE '51%' THEN 'PE'  -- Perú
      WHEN v_phone_digits LIKE '52%' THEN 'MX'  -- México
      ELSE NULL
    END;
  END IF;

  -- Validar contra la lista permitida
  IF v_country_code IS NOT NULL AND v_country_code NOT IN ('AR','BO','BR','CL','CO','CR','EC','GT','MX','PA','PE','PY','UY') THEN
    v_country_code := NULL;
  END IF;

  v_base_slug := lower(regexp_replace(regexp_replace(v_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN v_base_slug := 'negocio'; END IF;
  v_slug := v_base_slug;

  WHILE EXISTS (SELECT 1 FROM public.wa_businesses WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug    := v_base_slug || '-' || v_counter;
  END LOOP;

  -- Keep current trial duration (14 days) behavior.
  v_trial_end := now() + interval '14 days';

  INSERT INTO public.wa_businesses (
    user_id,
    name,
    whatsapp,
    email,
    country_code,
    currency,
    slug,
    is_active,
    plan_slug,
    plan_started_at,
    plan_expires_at,
    trial_expires_at,
    scheduled_plan_slug,
    scheduled_change_at
  ) VALUES (
    NEW.id,
    v_name,
    v_whatsapp,
    NEW.email,
    v_country_code,
    CASE v_country_code
      WHEN 'AR' THEN 'ARS'
      WHEN 'CL' THEN 'CLP'
      WHEN 'UY' THEN 'UYU'
      WHEN 'PY' THEN 'PYG'
      WHEN 'MX' THEN 'MXN'
      WHEN 'BO' THEN 'BOB'
      WHEN 'BR' THEN 'BRL'
      WHEN 'CO' THEN 'COP'
      WHEN 'CR' THEN 'CRC'
      WHEN 'EC' THEN 'USD'
      WHEN 'GT' THEN 'GTQ'
      WHEN 'PA' THEN 'USD'
      WHEN 'PE' THEN 'PEN'
      ELSE 'USD'
    END,
    v_slug,
    true,
    'pro',
    now(),
    v_trial_end,
    v_trial_end,
    'starter',
    v_trial_end
  ) ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'wa_handle_new_user_business failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Optional backfill for the specific bug: UY signups saved as CL/CLP.
-- Safe heuristic: whatsapp starts with +598 (or digits 598...) and current country_code is CL.
UPDATE public.wa_businesses
SET country_code = 'UY', currency = 'UYU'
WHERE country_code = 'CL'
  AND regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') LIKE '598%';

-- Also remove the forced defaults that convert "unknown" into Chile.
ALTER TABLE public.wa_businesses
  ALTER COLUMN country_code DROP DEFAULT,
  ALTER COLUMN country_code DROP NOT NULL;

-- Keep constraint but allow NULL.
ALTER TABLE public.wa_businesses
  DROP CONSTRAINT IF EXISTS wa_businesses_country_code_check;
ALTER TABLE public.wa_businesses
  ADD CONSTRAINT wa_businesses_country_code_check
  CHECK (country_code IS NULL OR country_code IN ('AR','BO','BR','CL','CO','CR','EC','GT','MX','PA','PE','PY','UY'));

NOTIFY pgrst, 'reload schema';

