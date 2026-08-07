-- Aísla la actualización de raw_app_meta_data (auth.users) dentro de su propio
-- sub-bloque BEGIN..EXCEPTION..END en wa_handle_new_user_business().
--
-- Motivo: el bloque EXCEPTION de la función envuelve TODO su cuerpo, incluida
-- la UPDATE final sobre auth.users. En PL/pgSQL, un bloque EXCEPTION implica
-- un savepoint implícito para todo lo que contiene — si esa UPDATE falla,
-- Postgres revierte también el INSERT de wa_businesses y el INSERT de
-- billing_subscriptions que ya se habían ejecutado exitosamente antes en la
-- misma invocación, dejando al usuario sin negocio y sin rastro visible del
-- error (solo un RAISE WARNING en logs de Postgres).
--
-- raw_app_meta_data es un espejo para claims del JWT (plan_slug, trial_active);
-- ningún código de la app lo usa como fuente de verdad — wa_businesses y
-- billing_subscriptions sí. Por eso es seguro que su fallo quede aislado sin
-- afectar la creación real del negocio.
--
-- No cambia: creación de wa_businesses, trial de 14 días, creación de
-- billing_subscriptions, la guarda por user_id, cálculo de país/moneda/slug,
-- ni ningún otro comportamiento. Único cambio funcional: la UPDATE de
-- auth.users pasa a un sub-bloque con su propio EXCEPTION, que ya no puede
-- deshacer el trabajo previo si falla.

CREATE OR REPLACE FUNCTION public.wa_handle_new_user_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name          TEXT;
  v_whatsapp      TEXT;
  v_slug          TEXT;
  v_base_slug     TEXT;
  v_counter       INTEGER := 0;
  v_country_code  TEXT;
  v_phone_digits  TEXT;
  v_start         TIMESTAMPTZ;
  v_trial_end     TIMESTAMPTZ;
  v_currency      TEXT;
  v_business_id   UUID;
BEGIN
  v_start     := COALESCE(NEW.created_at, now());
  v_trial_end := v_start + interval '14 days';

  v_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1),
    'Mi Negocio'
  );

  v_whatsapp := COALESCE(NEW.raw_user_meta_data->>'whatsapp', '');

  v_country_code := upper(COALESCE(NULLIF(NEW.raw_user_meta_data->>'country_code', ''), ''));

  IF v_country_code = '' THEN
    v_phone_digits := regexp_replace(v_whatsapp, '\D', '', 'g');
    v_country_code := CASE
      WHEN v_phone_digits LIKE '57%' THEN 'CO'
      WHEN v_phone_digits LIKE '54%' THEN 'AR'
      WHEN v_phone_digits LIKE '56%' THEN 'CL'
      WHEN v_phone_digits LIKE '598%' THEN 'UY'
      WHEN v_phone_digits LIKE '595%' THEN 'PY'
      WHEN v_phone_digits LIKE '51%' THEN 'PE'
      WHEN v_phone_digits LIKE '52%' THEN 'MX'
      ELSE NULL
    END;
  END IF;

  IF v_country_code IS NOT NULL AND v_country_code NOT IN ('AR','BO','BR','CL','CO','CR','EC','GT','MX','PA','PE','PY','UY') THEN
    v_country_code := NULL;
  END IF;

  v_currency := CASE v_country_code
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
  END;

  v_base_slug := lower(regexp_replace(regexp_replace(v_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN v_base_slug := 'negocio'; END IF;
  v_slug := v_base_slug;

  WHILE EXISTS (SELECT 1 FROM public.wa_businesses WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug    := v_base_slug || '-' || v_counter;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.wa_businesses WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

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
    v_currency,
    v_slug,
    true,
    'pro',
    v_start,
    v_trial_end,
    v_trial_end,
    NULL,
    NULL
  ) RETURNING id INTO v_business_id;

  INSERT INTO public.billing_subscriptions (
    business_id,
    provider,
    provider_subscription_id,
    plan_slug,
    currency_code,
    amount,
    interval_unit,
    status,
    provider_status,
    trial_ends_at,
    starts_at,
    current_period_starts_at,
    current_period_ends_at,
    cancel_at_period_end,
    cancelled_at,
    metadata_json
  ) VALUES (
    v_business_id,
    'signup',
    NULL,
    'pro',
    v_currency,
    NULL,
    'month',
    'trial',
    NULL,
    v_trial_end,
    v_start,
    v_start,
    v_trial_end,
    false,
    NULL,
    jsonb_build_object(
      'source', 'signup_trial',
      'trial_days', 14,
      'contact_email', NEW.email
    )
  );

  -- Aislado a propósito: un fallo acá (permisos, lock, lo que sea) NO debe
  -- deshacer wa_businesses ni billing_subscriptions, ya creados arriba.
  -- raw_app_meta_data es solo un espejo para el JWT, prescindible.
  BEGIN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
      'plan_slug', 'pro',
      'trial_active', true
    )
    WHERE id = NEW.id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'wa_handle_new_user_business: raw_app_meta_data update failed for user % (business % ya creado): %', NEW.id, v_business_id, SQLERRM;
  END;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'wa_handle_new_user_business failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.wa_handle_new_user_business() IS
  'Crea negocio Pro con trial 14d y billing_subscriptions (status=trial) de forma atómica entre sí. '
  'La actualización de raw_app_meta_data (espejo para JWT) está aislada en su propio sub-bloque: '
  'si falla, no revierte el negocio ni la suscripción ya creados.';

NOTIFY pgrst, 'reload schema';
