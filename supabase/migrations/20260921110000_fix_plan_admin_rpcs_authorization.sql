-- ============================================================
-- SEGURIDAD-WALINKA-1B — fix P1: wa_get_plan_usage, wa_check_order_limit,
-- wa_check_product_limit, wa_admin_plan_stats, wa_admin_suspicious_businesses,
-- wa_admin_notify sin autorización correcta.
--
-- CAUSA RAÍZ (idéntica en espíritu a SEGURIDAD-WALINKA-1A): las seis
-- funciones son SECURITY DEFINER creadas sin validar auth.uid()/wa_is_admin()
-- internamente, y ninguna de sus migraciones originales revocó el EXECUTE
-- que Postgres otorga a PUBLIC por defecto al crear una función -- todas
-- eran ejecutables por `anon` sin sesión (confirmado con
-- has_function_privilege('anon', ..., 'EXECUTE') = true en las 6, antes de
-- este fix).
--
-- AUDITORÍA DE GRAFO DE LLAMADAS (obligatoria antes de tocar nada, ver
-- reporte de SEGURIDAD-WALINKA-1B): el patrón mecánico de 1A NO se aplica
-- igual a las 6 -- dos de ellas tienen consumidores reales que el guard
-- "solo dueño" habría roto:
--
--   * wa_get_plan_usage: consumida por getPlanUsage() en
--     src/services/waBusinessService.js, llamada desde DOS lugares --
--     src/pages/dashboard/index.jsx (con el propio business.id del usuario)
--     Y src/pages/admin/AdminBusinessDetailPage.jsx (con el business_id de
--     OTRO negocio, que el admin está gestionando desde el panel admin).
--     Guard: dueño DEL negocio O wa_is_admin() -- nunca "solo dueño".
--
--   * wa_admin_notify: CERO consumidores en src/, api/, backend/,
--     supabase/functions/ -- pero SÍ tiene 2 llamadas SQL internas desde
--     wa_trigger_payment_status_notify() (trigger AFTER UPDATE en
--     wa_payments, creado en la misma migración 20260310400000), disparado
--     por el webhook mp-webhook, que actualiza wa_payments.status corriendo
--     con service_role (sin auth.uid() de usuario). Agregar un gate interno
--     de wa_is_admin()/auth.uid() acá ROMPERÍA ese trigger en producción --
--     cada pago aprobado/rechazado dejaría de generar su notificación
--     admin. La corrección correcta es exclusivamente de GRANT: revocar
--     EXECUTE a todo rol cliente (PUBLIC, anon, authenticated) sin GRANT de
--     reemplazo. Una llamada SECURITY DEFINER a SECURITY DEFINER (trigger
--     -> wa_admin_notify) se evalúa con los privilegios del DUEÑO de la
--     función llamante (postgres), no con los del rol que originó la
--     sesión -- el trigger sigue funcionando exactamente igual sin ningún
--     GRANT EXECUTE a un rol cliente. Ningún cliente (ni admin) necesita
--     llamarla directo: no hay ningún consumidor legítimo fuera del
--     trigger.
--
--   * wa_check_order_limit / wa_check_product_limit: CERO consumidores en
--     todo el repo (ni frontend, ni backend, ni Edge Functions, ni
--     llamadas SQL internas desde otra función/trigger) -- confirmado con
--     grep exhaustivo. Huérfanas hoy. Se les aplica igual el guard
--     "solo dueño" (mínimo privilegio, consistente con el resto del
--     sistema) en vez de dejarlas sin gate, por si se conectan en el
--     futuro -- nunca se les vuelve a otorgar EXECUTE a anon/PUBLIC.
--
--   * wa_admin_plan_stats / wa_admin_suspicious_businesses: consumidas por
--     getAdminStats()/getAdminSuspiciousInfo() en waBusinessService.js,
--     llamadas únicamente desde src/pages/admin/AdminBusinessesPage.jsx.
--     Sin llamadas SQL internas. Se les agrega el gate wa_is_admin() que
--     usan sus funciones hermanas (wa_admin_payments_stats,
--     wa_admin_get_site_visit_stats, etc.) -- mismo patrón vigente, sin
--     inventar un mecanismo nuevo.
--
-- Firma, tipo de retorno, cálculos y nombres de campos/columnas: IDÉNTICOS
-- en las 6 -- este es un fix de autorización, no de producto.
-- ============================================================

-- ── wa_get_plan_usage: dueño del negocio O admin ──────────────────────
CREATE OR REPLACE FUNCTION public.wa_get_plan_usage(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses
    WHERE id = p_business_id AND user_id = auth.uid()
  ) AND NOT public.wa_is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

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

COMMENT ON FUNCTION public.wa_get_plan_usage(uuid) IS
  'Uso del plan (productos activos, pedidos del mes) de un negocio. SEGURIDAD-WALINKA-1B (2026-09-21): requiere ser dueño del negocio O admin (wa_is_admin()) -- este último caso es real: AdminBusinessDetailPage.jsx la llama con el business_id de un negocio ajeno que el admin está gestionando. Antes: cualquier authenticated (y anon, por el EXECUTE implícito a PUBLIC) podía leer el plan/uso de cualquier negocio.';

REVOKE ALL ON FUNCTION public.wa_get_plan_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_get_plan_usage(uuid) TO authenticated;

-- ── wa_check_order_limit: solo dueño del negocio (sin consumidor admin conocido) ──
CREATE OR REPLACE FUNCTION public.wa_check_order_limit(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan          TEXT;
  v_expires       TIMESTAMPTZ;
  v_trial_expires TIMESTAMPTZ;
  v_eff_plan      TEXT;
  v_max           INT;
  v_month_cnt     INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses
    WHERE id = p_business_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

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

COMMENT ON FUNCTION public.wa_check_order_limit(uuid) IS
  'Chequea si un negocio puede crear más pedidos este mes según su plan. SEGURIDAD-WALINKA-1B (2026-09-21): requiere ser dueño del negocio -- sin consumidor conocido en el repo hoy (frontend/backend/Edge Functions/SQL interno), se protege igual por mínimo privilegio. Antes: cualquier authenticated y anon podían consultar el límite de cualquier negocio.';

REVOKE ALL ON FUNCTION public.wa_check_order_limit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_check_order_limit(uuid) TO authenticated;

-- ── wa_check_product_limit: solo dueño del negocio (sin consumidor admin conocido) ──
CREATE OR REPLACE FUNCTION public.wa_check_product_limit(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan          TEXT;
  v_expires       TIMESTAMPTZ;
  v_trial_expires TIMESTAMPTZ;
  v_eff_plan      TEXT;
  v_max           INT;
  v_active_cnt    INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses
    WHERE id = p_business_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

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

COMMENT ON FUNCTION public.wa_check_product_limit(uuid) IS
  'Chequea si un negocio puede activar más productos según su plan. SEGURIDAD-WALINKA-1B (2026-09-21): requiere ser dueño del negocio -- sin consumidor conocido en el repo hoy, mismo criterio que wa_check_order_limit. Antes: cualquier authenticated y anon podían consultar el límite de cualquier negocio.';

REVOKE ALL ON FUNCTION public.wa_check_product_limit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_check_product_limit(uuid) TO authenticated;

-- ── wa_admin_plan_stats: gate wa_is_admin(), mismo patrón que sus hermanas ──
CREATE OR REPLACE FUNCTION public.wa_admin_plan_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '{}';
  v_row    RECORD;
BEGIN
  IF NOT public.wa_is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

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

COMMENT ON FUNCTION public.wa_admin_plan_stats() IS
  'Conteo de negocios por plan efectivo, para el panel admin. SEGURIDAD-WALINKA-1B (2026-09-21): agrega el gate wa_is_admin() que ya usan sus funciones hermanas wa_admin_* -- a diferencia de ellas, nunca lo había tenido. Antes: cualquier authenticated y anon podían leer estadísticas agregadas de todos los negocios de la plataforma.';

REVOKE ALL ON FUNCTION public.wa_admin_plan_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_admin_plan_stats() TO authenticated;

-- ── wa_admin_suspicious_businesses: gate wa_is_admin(), mismo patrón ────
CREATE OR REPLACE FUNCTION public.wa_admin_suspicious_businesses()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result   JSONB := '[]';
  v_multi    JSONB;
  v_demos    JSONB;
BEGIN
  IF NOT public.wa_is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

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

COMMENT ON FUNCTION public.wa_admin_suspicious_businesses() IS
  'Usuarios con más de 1 negocio y negocios con nombre/slug demo/test, para el panel admin. SEGURIDAD-WALINKA-1B (2026-09-21): agrega el gate wa_is_admin() -- antes cualquier authenticated y anon podían leerla.';

REVOKE ALL ON FUNCTION public.wa_admin_suspicious_businesses() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_admin_suspicious_businesses() TO authenticated;

-- ── wa_admin_notify: SIN gate interno (rompería el trigger de pagos) ────
-- Único fix aplicable acá es de GRANT: revocar EXECUTE a todo rol cliente.
-- El único consumidor real es wa_trigger_payment_status_notify() (trigger
-- interno sobre wa_payments), que la invoca vía PERFORM -- esa llamada
-- función-a-función se evalúa con los privilegios del dueño de la función
-- llamante (postgres), nunca con los del rol que originó la sesión, así
-- que el trigger sigue funcionando exactamente igual sin ningún GRANT
-- EXECUTE a un rol cliente.
REVOKE ALL ON FUNCTION public.wa_admin_notify(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_admin_notify(text, text, text, jsonb) IS
  'Inserta una notificación interna en wa_admin_notifications. SEGURIDAD-WALINKA-1B (2026-09-21): revocado EXECUTE de PUBLIC/anon/authenticated -- sin GRANT de reemplazo a ningún rol cliente, ni siquiera authenticated/admin: el único consumidor legítimo es wa_trigger_payment_status_notify() (trigger interno sobre wa_payments), que sigue pudiendo invocarla porque una llamada SECURITY DEFINER a SECURITY DEFINER se evalúa con los privilegios del dueño de la función llamante, no con los del rol de sesión. No se agregó gate interno de auth.uid()/wa_is_admin() a propósito: el trigger corre disparado por mp-webhook con service_role, sin auth.uid() de usuario -- un gate interno lo habría roto. Antes: cualquier authenticated y anon podían insertar notificaciones falsas de admin.';

NOTIFY pgrst, 'reload schema';
