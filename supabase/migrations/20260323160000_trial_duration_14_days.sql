-- Trial signup defaults: nuevos negocios con trial PRO de 14 días.
-- Ajusta la función de alta para que plan_expires_at / trial_expires_at / scheduled_change_at
-- queden alineados en 14 días desde el registro.

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
  v_trial_end    TIMESTAMPTZ;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1),
    'Mi Negocio'
  );

  v_whatsapp     := COALESCE(NEW.raw_user_meta_data->>'whatsapp', '');
  v_country_code := upper(COALESCE(NEW.raw_user_meta_data->>'country_code', 'CL'));

  IF v_country_code NOT IN ('AR','BO','BR','CL','CO','CR','EC','GT','MX','PA','PE','PY','UY') THEN
    v_country_code := 'CL';
  END IF;

  v_base_slug := lower(regexp_replace(regexp_replace(v_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN v_base_slug := 'negocio'; END IF;
  v_slug := v_base_slug;

  WHILE EXISTS (SELECT 1 FROM public.wa_businesses WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug    := v_base_slug || '-' || v_counter;
  END LOOP;

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
    CASE WHEN v_country_code = 'AR' THEN 'ARS' ELSE 'CLP' END,
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

NOTIFY pgrst, 'reload schema';
