CREATE OR REPLACE FUNCTION public.wa_create_business_from_onboarding(
  p_name text,
  p_whatsapp text,
  p_country_code text,
  p_currency text,
  p_email text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_logo_url text DEFAULT NULL
)
RETURNS public.wa_businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_business public.wa_businesses%ROWTYPE;
  v_name text := NULLIF(trim(coalesce(p_name, '')), '');
  v_whatsapp text := NULLIF(trim(coalesce(p_whatsapp, '')), '');
  v_country_code text := upper(NULLIF(trim(coalesce(p_country_code, '')), ''));
  v_currency text := NULLIF(trim(coalesce(p_currency, '')), '');
  v_email text := NULLIF(trim(coalesce(p_email, '')), '');
  v_country_name text;
  v_base_slug text;
  v_slug text;
  v_suffix integer := 0;
  v_now timestamptz := now();
  v_trial_end timestamptz := now() + interval '14 days';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'El nombre del negocio es obligatorio';
  END IF;

  IF v_whatsapp IS NULL THEN
    RAISE EXCEPTION 'El WhatsApp del negocio es obligatorio';
  END IF;

  IF v_country_code IS NULL OR v_country_code NOT IN ('AR','BO','BR','CL','CO','CR','EC','GT','MX','PA','PE','PY','UY') THEN
    RAISE EXCEPTION 'Debes seleccionar un pais valido';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wa_onboarding_business'), hashtext(v_user_id::text));

  SELECT *
  INTO v_business
  FROM public.wa_businesses
  WHERE user_id = v_user_id
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF FOUND THEN
    IF v_business.onboarding_step = 'completed' OR v_business.onboarding_completed_at IS NOT NULL THEN
      RETURN v_business;
    END IF;

    UPDATE public.wa_businesses
    SET
      name = COALESCE(NULLIF(name, ''), v_name),
      whatsapp = COALESCE(NULLIF(whatsapp, ''), v_whatsapp),
      email = COALESCE(NULLIF(email, ''), v_email),
      description = COALESCE(description, NULLIF(trim(coalesce(p_description, '')), '')),
      address = COALESCE(address, NULLIF(trim(coalesce(p_address, '')), '')),
      city = COALESCE(city, NULLIF(trim(coalesce(p_city, '')), '')),
      region = COALESCE(region, NULLIF(trim(coalesce(p_region, '')), '')),
      country = COALESCE(country, CASE v_country_code
        WHEN 'AR' THEN 'Argentina'
        WHEN 'BO' THEN 'Bolivia'
        WHEN 'BR' THEN 'Brasil'
        WHEN 'CL' THEN 'Chile'
        WHEN 'CO' THEN 'Colombia'
        WHEN 'CR' THEN 'Costa Rica'
        WHEN 'EC' THEN 'Ecuador'
        WHEN 'GT' THEN 'Guatemala'
        WHEN 'MX' THEN 'Mexico'
        WHEN 'PA' THEN 'Panama'
        WHEN 'PE' THEN 'Peru'
        WHEN 'PY' THEN 'Paraguay'
        WHEN 'UY' THEN 'Uruguay'
        ELSE v_country_code
      END),
      country_code = COALESCE(country_code, v_country_code),
      currency = COALESCE(currency, v_currency, 'USD'),
      logo_url = COALESCE(logo_url, NULLIF(trim(coalesce(p_logo_url, '')), '')),
      onboarding_step = CASE
        WHEN onboarding_step IS NULL OR onboarding_step = 'business_basics' THEN 'first_product'
        ELSE onboarding_step
      END
    WHERE id = v_business.id
    RETURNING *
    INTO v_business;

    RETURN v_business;
  END IF;

  v_base_slug := lower(NULLIF(trim(coalesce(p_slug, '')), ''));
  IF v_base_slug IS NULL THEN
    v_base_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  END IF;
  v_base_slug := regexp_replace(v_base_slug, '(^-+|-+$)', '', 'g');
  IF v_base_slug IS NULL OR v_base_slug = '' THEN
    v_base_slug := 'mi-negocio';
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.wa_businesses WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix::text;
  END LOOP;

  v_country_name := CASE v_country_code
    WHEN 'AR' THEN 'Argentina'
    WHEN 'BO' THEN 'Bolivia'
    WHEN 'BR' THEN 'Brasil'
    WHEN 'CL' THEN 'Chile'
    WHEN 'CO' THEN 'Colombia'
    WHEN 'CR' THEN 'Costa Rica'
    WHEN 'EC' THEN 'Ecuador'
    WHEN 'GT' THEN 'Guatemala'
    WHEN 'MX' THEN 'Mexico'
    WHEN 'PA' THEN 'Panama'
    WHEN 'PE' THEN 'Peru'
    WHEN 'PY' THEN 'Paraguay'
    WHEN 'UY' THEN 'Uruguay'
    ELSE v_country_code
  END;

  INSERT INTO public.wa_businesses (
    user_id,
    name,
    description,
    whatsapp,
    email,
    address,
    city,
    region,
    country,
    country_code,
    currency,
    logo_url,
    slug,
    is_active,
    plan_slug,
    plan_started_at,
    plan_expires_at,
    trial_expires_at,
    scheduled_plan_slug,
    scheduled_change_at,
    onboarding_step
  )
  VALUES (
    v_user_id,
    v_name,
    NULLIF(trim(coalesce(p_description, '')), ''),
    v_whatsapp,
    v_email,
    NULLIF(trim(coalesce(p_address, '')), ''),
    NULLIF(trim(coalesce(p_city, '')), ''),
    NULLIF(trim(coalesce(p_region, '')), ''),
    v_country_name,
    v_country_code,
    COALESCE(v_currency, 'USD'),
    NULLIF(trim(coalesce(p_logo_url, '')), ''),
    v_slug,
    true,
    'pro',
    v_now,
    v_trial_end,
    v_trial_end,
    'starter',
    v_trial_end,
    'first_product'
  )
  RETURNING *
  INTO v_business;

  RETURN v_business;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_create_business_from_onboarding(
  text, text, text, text, text, text, text, text, text, text, text
) TO authenticated;
