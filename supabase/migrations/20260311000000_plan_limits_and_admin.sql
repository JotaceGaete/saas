-- ──────────────────────────────────────────────────────────────────────────────
-- Plan limits enforcement & admin observability
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── Helper: plan efectivo (pro/business vencidos → starter) ──────────────────
CREATE OR REPLACE FUNCTION public.wa_get_effective_plan(
  p_plan_slug      TEXT,
  p_plan_expires_at TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF p_plan_slug IS NULL OR p_plan_slug NOT IN ('pro','business') THEN
    RETURN COALESCE(p_plan_slug, 'starter');
  END IF;
  IF p_plan_expires_at IS NULL THEN
    RETURN p_plan_slug;
  END IF;
  IF p_plan_expires_at <= now() THEN
    RETURN 'starter';
  END IF;
  RETURN p_plan_slug;
END;
$$;

-- ─── Helper: límite máximo de productos por plan ───────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_plan_max_products(p_plan TEXT)
RETURNS INT LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN CASE p_plan
    WHEN 'starter'  THEN 10
    WHEN 'control'  THEN 10
    WHEN 'pro'      THEN 50
    WHEN 'business' THEN NULL
    ELSE 10
  END;
END;
$$;

-- ─── Helper: límite máximo de pedidos por mes por plan ────────────────────────
CREATE OR REPLACE FUNCTION public.wa_plan_max_orders_per_month(p_plan TEXT)
RETURNS INT LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN CASE p_plan
    WHEN 'starter'  THEN 30
    WHEN 'control'  THEN 30
    WHEN 'pro'      THEN NULL
    WHEN 'business' THEN NULL
    ELSE 30
  END;
END;
$$;

-- ─── Check: ¿puede el negocio crear más productos activos? ────────────────────
-- Retorna TRUE si puede, FALSE si ha alcanzado el límite.
CREATE OR REPLACE FUNCTION public.wa_check_product_limit(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_plan       TEXT;
  v_expires    TIMESTAMPTZ;
  v_eff_plan   TEXT;
  v_max        INT;
  v_active_cnt INT;
BEGIN
  SELECT plan_slug, plan_expires_at
    INTO v_plan, v_expires
    FROM public.wa_businesses
   WHERE id = p_business_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_eff_plan := public.wa_get_effective_plan(v_plan, v_expires);
  v_max      := public.wa_plan_max_products(v_eff_plan);

  IF v_max IS NULL THEN RETURN TRUE; END IF;

  SELECT COUNT(*) INTO v_active_cnt
    FROM public.wa_products
   WHERE business_id = p_business_id AND is_active = TRUE;

  RETURN v_active_cnt < v_max;
END;
$$;

-- ─── Check: ¿puede el negocio crear más pedidos este mes? ────────────────────
CREATE OR REPLACE FUNCTION public.wa_check_order_limit(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_plan       TEXT;
  v_expires    TIMESTAMPTZ;
  v_eff_plan   TEXT;
  v_max        INT;
  v_month_cnt  INT;
BEGIN
  SELECT plan_slug, plan_expires_at
    INTO v_plan, v_expires
    FROM public.wa_businesses
   WHERE id = p_business_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_eff_plan := public.wa_get_effective_plan(v_plan, v_expires);
  v_max      := public.wa_plan_max_orders_per_month(v_eff_plan);

  IF v_max IS NULL THEN RETURN TRUE; END IF;

  SELECT COUNT(*) INTO v_month_cnt
    FROM public.wa_orders
   WHERE business_id = p_business_id
     AND created_at >= date_trunc('month', now());

  RETURN v_month_cnt < v_max;
END;
$$;

-- ─── RPC: uso actual del plan (para dashboard) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_get_plan_usage(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_plan          TEXT;
  v_expires       TIMESTAMPTZ;
  v_eff_plan      TEXT;
  v_max_products  INT;
  v_max_orders    INT;
  v_active_prod   INT;
  v_orders_month  INT;
BEGIN
  SELECT plan_slug, plan_expires_at
    INTO v_plan, v_expires
    FROM public.wa_businesses
   WHERE id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'planSlug', 'starter', 'effectivePlan', 'starter',
      'activeProducts', 0, 'maxProducts', 10,
      'ordersThisMonth', 0, 'maxOrdersPerMonth', 30
    );
  END IF;

  v_eff_plan     := public.wa_get_effective_plan(v_plan, v_expires);
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
    'planSlug',        v_plan,
    'effectivePlan',   v_eff_plan,
    'planExpiresAt',   v_expires,
    'activeProducts',  v_active_prod,
    'maxProducts',     v_max_products,
    'ordersThisMonth', v_orders_month,
    'maxOrdersPerMonth', v_max_orders
  );
END;
$$;

-- ─── Vista admin: panorama de todos los negocios con uso ──────────────────────
CREATE OR REPLACE VIEW public.wa_admin_business_overview AS
SELECT
  b.id,
  b.name,
  b.slug,
  b.email,
  b.whatsapp,
  b.is_active,
  b.plan_slug,
  b.plan_expires_at,
  public.wa_get_effective_plan(b.plan_slug, b.plan_expires_at) AS effective_plan,
  b.created_at,
  -- productos
  COUNT(DISTINCT p.id)                                         AS total_products,
  COUNT(DISTINCT p.id) FILTER (WHERE p.is_active)              AS active_products,
  -- pedidos
  COUNT(DISTINCT o.id)                                         AS total_orders,
  COUNT(DISTINCT o.id) FILTER (
    WHERE o.created_at >= date_trunc('month', now())
  )                                                            AS orders_this_month,
  -- usuario asociado
  b.user_id,
  u.email                                                      AS user_email,
  u.created_at                                                 AS user_created_at,
  -- flags antiabuso
  (b.name ILIKE '%test%' OR b.name ILIKE '%demo%' OR b.name ILIKE '%prueba%'
   OR b.slug ILIKE '%test%' OR b.slug ILIKE '%demo%')          AS is_demo_suspected
FROM public.wa_businesses b
LEFT JOIN public.wa_products p     ON p.business_id = b.id
LEFT JOIN public.wa_orders   o     ON o.business_id = b.id
LEFT JOIN auth.users         u     ON u.id = b.user_id
GROUP BY b.id, b.name, b.slug, b.email, b.whatsapp, b.is_active,
         b.plan_slug, b.plan_expires_at, b.created_at, b.user_id,
         u.email, u.created_at;

-- ─── RPC admin: estadísticas por plan ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_admin_plan_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_result JSONB := '{}';
  v_row    RECORD;
BEGIN
  FOR v_row IN
    SELECT
      public.wa_get_effective_plan(plan_slug, plan_expires_at) AS eff_plan,
      COUNT(*) AS cnt
    FROM public.wa_businesses
    GROUP BY eff_plan
  LOOP
    v_result := v_result || jsonb_build_object(v_row.eff_plan, v_row.cnt);
  END LOOP;
  RETURN v_result;
END;
$$;

-- ─── RPC admin: negocios sospechosos o demo ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_admin_suspicious_businesses()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_result   JSONB := '[]';
  v_multi    JSONB;
  v_demos    JSONB;
BEGIN
  -- Usuarios con más de 1 negocio
  SELECT jsonb_agg(jsonb_build_object(
    'userId', user_id,
    'count', cnt
  ))
  INTO v_multi
  FROM (
    SELECT user_id, COUNT(*) AS cnt
    FROM public.wa_businesses
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) t;

  -- Negocios con nombre/slug demo/test
  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'slug', slug, 'plan_slug', plan_slug
  ))
  INTO v_demos
  FROM public.wa_businesses
  WHERE name ILIKE '%test%' OR name ILIKE '%demo%' OR name ILIKE '%prueba%'
     OR slug ILIKE '%test%' OR slug ILIKE '%demo%';

  RETURN jsonb_build_object(
    'multiBusinessUsers', COALESCE(v_multi, '[]'::JSONB),
    'demoBusinesses',     COALESCE(v_demos, '[]'::JSONB)
  );
END;
$$;

-- Permisos: solo el service role puede ejecutar estas funciones
GRANT EXECUTE ON FUNCTION public.wa_get_effective_plan TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wa_check_product_limit TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wa_check_order_limit TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wa_get_plan_usage TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wa_plan_max_products TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_plan_max_orders_per_month TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_admin_plan_stats TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_admin_suspicious_businesses TO service_role;

NOTIFY pgrst, 'reload schema';
