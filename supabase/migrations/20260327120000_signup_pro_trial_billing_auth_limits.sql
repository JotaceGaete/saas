-- Signup: 14 días de Pro + fila en billing_subscriptions + raw_app_meta_data (JWT).
-- Límites (productos/pedidos): wa_get_effective_plan vuelve a considerar trial_expires_at.
-- scheduled_plan_slug / scheduled_change_at en NULL al crear (sin downgrade programado al Starter).

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

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'plan_slug', 'pro',
    'trial_active', true
  )
  WHERE id = NEW.id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'wa_handle_new_user_business failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.wa_handle_new_user_business() IS
  'Crea negocio Pro con trial 14d, billing_subscriptions (status=trial), y app metadata para JWT.';

-- ─── Límites: pasar trial_expires_at a wa_get_effective_plan ───

CREATE OR REPLACE FUNCTION public.wa_check_product_limit(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_plan          TEXT;
  v_expires       TIMESTAMPTZ;
  v_trial_expires TIMESTAMPTZ;
  v_eff_plan      TEXT;
  v_max           INT;
  v_active_cnt    INT;
BEGIN
  SELECT plan_slug, plan_expires_at, trial_expires_at
    INTO v_plan, v_expires, v_trial_expires
    FROM public.wa_businesses
   WHERE id = p_business_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_eff_plan := public.wa_get_effective_plan(v_plan, v_expires, v_trial_expires);
  v_max      := public.wa_plan_max_products(v_eff_plan);
  IF v_max IS NULL THEN RETURN TRUE; END IF;

  SELECT COUNT(*) INTO v_active_cnt
    FROM public.wa_products
   WHERE business_id = p_business_id AND status = 'active';

  RETURN v_active_cnt < v_max;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_get_plan_usage(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_plan          TEXT;
  v_expires       TIMESTAMPTZ;
  v_trial_expires TIMESTAMPTZ;
  v_eff_plan      TEXT;
  v_max_products  INT;
  v_max_orders    INT;
  v_active_prod   INT;
  v_orders_month  INT;
BEGIN
  SELECT plan_slug, plan_expires_at, trial_expires_at
    INTO v_plan, v_expires, v_trial_expires
    FROM public.wa_businesses
   WHERE id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'planSlug', 'starter', 'effectivePlan', 'starter',
      'activeProducts', 0, 'maxProducts', 10,
      'ordersThisMonth', 0, 'maxOrdersPerMonth', 30,
      'isTrial', false,
      'trialExpiresAt', NULL,
      'planExpiresAt', NULL
    );
  END IF;

  v_eff_plan     := public.wa_get_effective_plan(v_plan, v_expires, v_trial_expires);
  v_max_products := public.wa_plan_max_products(v_eff_plan);
  v_max_orders   := public.wa_plan_max_orders_per_month(v_eff_plan);

  SELECT COUNT(*) INTO v_active_prod
    FROM public.wa_products
   WHERE business_id = p_business_id AND status = 'active';

  SELECT COUNT(*) INTO v_orders_month
    FROM public.wa_orders
   WHERE business_id = p_business_id
     AND created_at >= date_trunc('month', now());

  RETURN jsonb_build_object(
    'planSlug',          v_plan,
    'effectivePlan',     v_eff_plan,
    'planExpiresAt',     v_expires,
    'trialExpiresAt',    v_trial_expires,
    'isTrial',           (v_trial_expires IS NOT NULL AND v_trial_expires > now()),
    'activeProducts',    v_active_prod,
    'maxProducts',       v_max_products,
    'ordersThisMonth',   v_orders_month,
    'maxOrdersPerMonth', v_max_orders
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_products_enforce_limit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bid    UUID;
  v_max    INT;
  v_count  INT;
  v_eff    TEXT;
  v_plan   TEXT;
  v_exp    TIMESTAMPTZ;
  v_trial  TIMESTAMPTZ;
  v_will_be_active BOOLEAN;
BEGIN
  v_bid := NEW.business_id;
  v_will_be_active := (COALESCE(NEW.status, CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END) = 'active');
  IF NOT v_will_be_active THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;

  SELECT plan_slug, plan_expires_at, trial_expires_at INTO v_plan, v_exp, v_trial
  FROM public.wa_businesses WHERE id = v_bid;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_eff := public.wa_get_effective_plan(v_plan, v_exp, v_trial);
  v_max := public.wa_plan_max_products(v_eff);
  IF v_max IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.wa_products
  WHERE business_id = v_bid AND status = 'active';

  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    v_count := v_count - 1;
  END IF;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED:Has alcanzado el límite de % productos activos de tu plan. Desactiva uno o actualiza tu plan.', v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_orders_enforce_limit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_eff   TEXT;
  v_max   INT;
  v_count INT;
  v_plan  TEXT;
  v_exp   TIMESTAMPTZ;
  v_trial TIMESTAMPTZ;
BEGIN
  SELECT plan_slug, plan_expires_at, trial_expires_at INTO v_plan, v_exp, v_trial
  FROM public.wa_businesses WHERE id = NEW.business_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_eff := public.wa_get_effective_plan(v_plan, v_exp, v_trial);
  v_max := public.wa_plan_max_orders_per_month(v_eff);
  IF v_max IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.wa_orders
  WHERE business_id = NEW.business_id
    AND created_at >= date_trunc('month', now());
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED:Tu plan Free permite 30 pedidos por mes. Actualiza a Pro para recibir pedidos ilimitados.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP VIEW IF EXISTS public.wa_admin_business_overview;

CREATE VIEW public.wa_admin_business_overview AS
SELECT
  b.id,
  b.name,
  b.slug,
  b.email,
  b.whatsapp,
  b.is_active,
  b.plan_slug,
  b.plan_expires_at,
  b.trial_expires_at,
  public.wa_get_effective_plan(b.plan_slug, b.plan_expires_at, b.trial_expires_at) AS effective_plan,
  (b.trial_expires_at IS NOT NULL AND b.trial_expires_at > now()) AS is_trial,
  b.created_at,
  COUNT(DISTINCT p.id)                                         AS total_products,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active')        AS active_products,
  COUNT(DISTINCT o.id)                                         AS total_orders,
  COUNT(DISTINCT o.id) FILTER (
    WHERE o.created_at >= date_trunc('month', now())
  )                                                            AS orders_this_month,
  b.user_id,
  u.email                                                      AS user_email,
  u.created_at                                                 AS user_created_at,
  (b.name ILIKE '%test%' OR b.name ILIKE '%demo%' OR b.name ILIKE '%prueba%'
   OR b.slug ILIKE '%test%' OR b.slug ILIKE '%demo%')          AS is_demo_suspected
FROM public.wa_businesses b
LEFT JOIN public.wa_products p ON p.business_id = b.id
LEFT JOIN public.wa_orders   o ON o.business_id = b.id
LEFT JOIN auth.users         u ON u.id = b.user_id
GROUP BY b.id, b.name, b.slug, b.email, b.whatsapp, b.is_active,
         b.plan_slug, b.plan_expires_at, b.trial_expires_at, b.created_at,
         b.user_id, u.email, u.created_at;

NOTIFY pgrst, 'reload schema';
