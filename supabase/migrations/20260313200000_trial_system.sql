-- ──────────────────────────────────────────────────────────────────────────────
-- Trial system: 7-day PRO trial for new users + expiration automation.
-- Removes plan 'control' from constraints and helper functions.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Columna trial_expires_at
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.wa_businesses.trial_expires_at IS
  'Fecha/hora en que vence el período de prueba PRO. NULL = no es trial (plan pago o legacy).';

-- 2. Actualizar CHECK constraint: quitar "control", dejar solo los tres planes reales.
--    Negocios existentes con plan_slug = "control" pasan a "starter" antes del constraint.
UPDATE public.wa_businesses
  SET plan_slug = 'starter'
WHERE plan_slug = 'control';

ALTER TABLE public.wa_businesses
  DROP CONSTRAINT IF EXISTS wa_businesses_plan_slug_check;

ALTER TABLE public.wa_businesses
  ADD CONSTRAINT wa_businesses_plan_slug_check
  CHECK (plan_slug IN ('starter', 'pro', 'business'));

-- 3. wa_get_effective_plan: acepta tercer parámetro opcional (trial_expires_at).
--    Reglas:
--      - Si plan es pro/business Y plan_expires_at está activo  → plan de pago válido.
--      - Si plan es pro/business Y trial_expires_at está activo → trial activo.
--      - Si plan es pro/business Y ninguno aplica Y ambos son NULL → legacy admin, válido.
--      - En cualquier otro caso → starter.
CREATE OR REPLACE FUNCTION public.wa_get_effective_plan(
  p_plan_slug        TEXT,
  p_plan_expires_at  TIMESTAMPTZ,
  p_trial_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF p_plan_slug IS NULL OR p_plan_slug NOT IN ('pro', 'business') THEN
    RETURN COALESCE(p_plan_slug, 'starter');
  END IF;

  -- Plan de pago activo
  IF p_plan_expires_at IS NOT NULL AND p_plan_expires_at > now() THEN
    RETURN p_plan_slug;
  END IF;

  -- Trial activo
  IF p_trial_expires_at IS NOT NULL AND p_trial_expires_at > now() THEN
    RETURN p_plan_slug;
  END IF;

  -- Legacy: sin ningún vencimiento configurado (plan asignado por admin)
  IF p_plan_expires_at IS NULL AND p_trial_expires_at IS NULL THEN
    RETURN p_plan_slug;
  END IF;

  RETURN 'starter';
END;
$$;

-- 4. wa_plan_max_products: eliminar caso "control" (mismo límite que starter).
CREATE OR REPLACE FUNCTION public.wa_plan_max_products(p_plan TEXT)
RETURNS INT LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN CASE p_plan
    WHEN 'starter'  THEN 10
    WHEN 'pro'      THEN 50
    WHEN 'business' THEN NULL
    ELSE 10
  END;
END;
$$;

-- 5. wa_plan_max_orders_per_month: eliminar caso "control".
CREATE OR REPLACE FUNCTION public.wa_plan_max_orders_per_month(p_plan TEXT)
RETURNS INT LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN CASE p_plan
    WHEN 'starter'  THEN 30
    WHEN 'pro'      THEN NULL
    WHEN 'business' THEN NULL
    ELSE 30
  END;
END;
$$;

-- 6. wa_check_product_limit: pasar trial_expires_at a wa_get_effective_plan.
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
   WHERE business_id = p_business_id AND is_active = TRUE;

  RETURN v_active_cnt < v_max;
END;
$$;

-- 7. wa_check_order_limit: pasar trial_expires_at.
CREATE OR REPLACE FUNCTION public.wa_check_order_limit(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_plan          TEXT;
  v_expires       TIMESTAMPTZ;
  v_trial_expires TIMESTAMPTZ;
  v_eff_plan      TEXT;
  v_max           INT;
  v_month_cnt     INT;
BEGIN
  SELECT plan_slug, plan_expires_at, trial_expires_at
    INTO v_plan, v_expires, v_trial_expires
    FROM public.wa_businesses
   WHERE id = p_business_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_eff_plan := public.wa_get_effective_plan(v_plan, v_expires, v_trial_expires);
  v_max      := public.wa_plan_max_orders_per_month(v_eff_plan);

  IF v_max IS NULL THEN RETURN TRUE; END IF;

  SELECT COUNT(*) INTO v_month_cnt
    FROM public.wa_orders
   WHERE business_id = p_business_id
     AND created_at >= date_trunc('month', now());

  RETURN v_month_cnt < v_max;
END;
$$;

-- 8. wa_get_plan_usage: incluir trial_expires_at y campo isTrial en salida.
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
      'isTrial', false
    );
  END IF;

  v_eff_plan     := public.wa_get_effective_plan(v_plan, v_expires, v_trial_expires);
  v_max_products := public.wa_plan_max_products(v_eff_plan);
  v_max_orders   := public.wa_plan_max_orders_per_month(v_eff_plan);

  SELECT COUNT(*) INTO v_active_prod
    FROM public.wa_products
   WHERE business_id = p_business_id AND is_active = TRUE;

  SELECT COUNT(*) INTO v_orders_month
    FROM public.wa_orders
   WHERE business_id = p_business_id
     AND created_at >= date_trunc('month', now());

  RETURN jsonb_build_object(
    'planSlug',          v_plan,
    'effectivePlan',     v_eff_plan,
    'planExpiresAt',     v_expires,
    'trialExpiresAt',    v_trial_expires,
    'isTrial',           (v_trial_expires IS NOT NULL AND v_expires IS NULL AND v_trial_expires > now()),
    'activeProducts',    v_active_prod,
    'maxProducts',       v_max_products,
    'ordersThisMonth',   v_orders_month,
    'maxOrdersPerMonth', v_max_orders
  );
END;
$$;

-- 9. wa_admin_business_overview: incluir trial_expires_at.
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
  (b.trial_expires_at IS NOT NULL AND b.plan_expires_at IS NULL AND b.trial_expires_at > now()) AS is_trial,
  b.created_at,
  COUNT(DISTINCT p.id)                                         AS total_products,
  COUNT(DISTINCT p.id) FILTER (WHERE p.is_active)              AS active_products,
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
LEFT JOIN public.wa_products p     ON p.business_id = b.id
LEFT JOIN public.wa_orders   o     ON o.business_id = b.id
LEFT JOIN auth.users         u     ON u.id = b.user_id
GROUP BY b.id, b.name, b.slug, b.email, b.whatsapp, b.is_active,
         b.plan_slug, b.plan_expires_at, b.trial_expires_at, b.created_at,
         b.user_id, u.email, u.created_at;

-- 10. wa_expire_trials: mover negocios con trial expirado a starter.
--     Llamar vía cron (pg_cron o Supabase scheduled function) cada hora o cada día.
--     En algunos entornos esta función ya existe con otro tipo de retorno; la eliminamos primero.
DROP FUNCTION IF EXISTS public.wa_expire_trials();

CREATE FUNCTION public.wa_expire_trials()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.wa_businesses
     SET plan_slug       = 'starter',
         trial_expires_at = NULL
   WHERE plan_slug IN ('pro', 'business')
     AND trial_expires_at IS NOT NULL
     AND trial_expires_at <= now()
     AND plan_expires_at IS NULL;   -- no tiene plan de pago activo

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'wa_expire_trials: % negocios movidos a starter', v_count;
  RETURN v_count;
END;
$$;

-- 11. Trigger: nuevos usuarios reciben PRO trial por 7 días.
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
    v_counter  := v_counter + 1;
    v_slug     := v_base_slug || '-' || v_counter;
  END LOOP;

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
    trial_expires_at
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
    now() + interval '7 days'
  ) ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'wa_handle_new_user_business failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 12. Permisos
GRANT EXECUTE ON FUNCTION public.wa_get_effective_plan TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wa_plan_max_products TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_plan_max_orders_per_month TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_check_product_limit TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wa_check_order_limit TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wa_get_plan_usage TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wa_expire_trials TO service_role;

NOTIFY pgrst, 'reload schema';
