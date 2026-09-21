-- Verificación MANUAL de 20260921100000_fix_analytics_rpcs_cross_tenant.sql
-- (SEGURIDAD-WALINKA-1A).
-- NO es una migración -- no vive en supabase/migrations/ a propósito, para
-- que el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción -- solo contra una instancia
-- local/throwaway.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluido el fix)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_analytics_rpcs_tenant_isolation.sql
--   4. supabase stop              (apaga y descarta todo -- nada persiste)
--
-- Mismo patrón de simulación de sesión que verify_crm_pos_payment_methods.sql
-- / verify_crm_cash_session_reconciliations.sql: SET LOCAL ROLE <rol> +
-- set_config('request.jwt.claim.sub', ...) / set_config('request.jwt.claims', ...)
-- antes de cada llamada, RESET ROLE después. Todo el script corre en una
-- sola transacción con ROLLBACK final -- nunca persiste nada.
--
-- Cubre la matriz completa pedida por SEGURIDAD-WALINKA-1A para las 3 RPC
-- (rpc_top_products, rpc_orders_by_day, rpc_dashboard_funnel):
--   1. Dueño de Negocio A consulta Negocio A            -> permitido, datos correctos
--   2. Dueño de Negocio A consulta Negocio B (ajeno)     -> Forbidden
--   3. Dueño de Negocio B consulta Negocio A (ajeno)     -> Forbidden
--   4. anon (sin sesión) consulta Negocio A              -> permission denied (sin EXECUTE)
--   5. authenticated SIN negocio propio consulta Negocio A -> Forbidden
--   6. Grants efectivos: anon sin EXECUTE, authenticated con EXECUTE, PUBLIC sin EXECUTE

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: 2 negocios reales (A y B), cada uno con su dueño, un producto y un
-- pedido pagado -- para que un acceso permitido devuelva datos reales (no
-- solo "no truena"), y un acceso cross-tenant, si no estuviera bloqueado,
-- devolvería datos reales y verificables del negocio ajeno.
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'owner-a@verify.test', '{"name":"Owner A"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b002', 'owner-b@verify.test', '{"name":"Owner B"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c003', 'no-business@verify.test', '{"name":"Sin negocio"}'::jsonb, now(), 'authenticated', 'authenticated');

DO $$
DECLARE
  v_biz_a UUID;
  v_biz_b UUID;
  v_product_a UUID;
  v_product_b UUID;
  v_order_a UUID;
  v_order_b UUID;
BEGIN
  INSERT INTO public.wa_businesses (user_id, name, whatsapp)
    VALUES ('00000000-0000-0000-0000-00000000a001', 'Negocio A (verify)', '56900001111')
    RETURNING id INTO v_biz_a;
  INSERT INTO public.wa_businesses (user_id, name, whatsapp)
    VALUES ('00000000-0000-0000-0000-00000000b002', 'Negocio B (verify)', '56900002222')
    RETURNING id INTO v_biz_b;
  ASSERT v_biz_a IS NOT NULL AND v_biz_b IS NOT NULL, 'FAIL: setup -- no se crearon los negocios de prueba';

  INSERT INTO public.wa_products (business_id, name, price, is_active)
    VALUES (v_biz_a, 'Producto A1', 1000, true) RETURNING id INTO v_product_a;
  INSERT INTO public.wa_products (business_id, name, price, is_active)
    VALUES (v_biz_b, 'Producto B1 (secreto)', 9999, true) RETURNING id INTO v_product_b;

  INSERT INTO public.wa_orders (business_id, customer_name, total_amount, payment_status, created_at, updated_at)
    VALUES (v_biz_a, 'Cliente A', 5000, 'pagado', now(), now()) RETURNING id INTO v_order_a;
  INSERT INTO public.wa_orders (business_id, customer_name, total_amount, payment_status, created_at, updated_at)
    VALUES (v_biz_b, 'Cliente B (secreto)', 777000, 'pagado', now(), now()) RETURNING id INTO v_order_b;

  INSERT INTO public.wa_order_items (order_id, product_id, product_name, quantity, product_price, subtotal)
    VALUES (v_order_a, v_product_a, 'Producto A1', 5, 1000, 5000);
  INSERT INTO public.wa_order_items (order_id, product_id, product_name, quantity, product_price, subtotal)
    VALUES (v_order_b, v_product_b, 'Producto B1 (secreto)', 77, 9999, 777000);

  PERFORM set_config('test.biz_a', v_biz_a::text, true);
  PERFORM set_config('test.biz_b', v_biz_b::text, true);
  RAISE NOTICE 'OK: setup -- Negocio A (%) y Negocio B (%) con producto y pedido pagado cada uno', v_biz_a, v_biz_b;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 1 -- Dueño de A consulta A: permitido, con los datos reales del
-- pedido pagado (5000 de revenue, 1 pedido, etc.).
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000a001','role','authenticated')::text, true);

DO $$
DECLARE
  v_biz_a UUID := current_setting('test.biz_a')::uuid;
  v_top RECORD;
  v_days RECORD;
  v_funnel JSON;
  v_found_products BOOLEAN := false;
  v_found_today BOOLEAN := false;
BEGIN
  FOR v_top IN SELECT * FROM public.rpc_top_products(v_biz_a, 5, NULL) LOOP
    v_found_products := true;
    ASSERT v_top.total_revenue = 5000.00, 'FAIL caso 1: revenue de A debería ser 5000, fue ' || v_top.total_revenue;
  END LOOP;
  ASSERT v_found_products, 'FAIL caso 1: rpc_top_products(A) como dueño de A no devolvió filas';

  FOR v_days IN SELECT * FROM public.rpc_orders_by_day(v_biz_a, 7) WHERE day = to_char(now(), 'YYYY-MM-DD') LOOP
    v_found_today := true;
    ASSERT v_days.count = 1, 'FAIL caso 1: rpc_orders_by_day(A) debería contar 1 pedido hoy, contó ' || v_days.count;
  END LOOP;
  ASSERT v_found_today, 'FAIL caso 1: rpc_orders_by_day(A) no devolvió la fila de hoy';

  v_funnel := public.rpc_dashboard_funnel(v_biz_a, now() - interval '7 days', now(), now() - interval '14 days', now() - interval '7 days');
  ASSERT (v_funnel->>'paid_revenue')::numeric = 5000.00, 'FAIL caso 1: paid_revenue de A debería ser 5000, fue ' || (v_funnel->>'paid_revenue');

  RAISE NOTICE 'OK: caso 1 -- dueño de A consulta A: las 3 RPC devuelven datos correctos de su propio negocio';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 2 -- Dueño de A intenta consultar B (ajeno): las 3 deben lanzar
-- 'Forbidden'. Si CUALQUIERA devuelve datos de B (ej. los 777000 del pedido
-- secreto), el script debe fallar fuerte -- eso sería el bug reabierto.
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000a001','role','authenticated')::text, true);

DO $$
DECLARE
  v_biz_b UUID := current_setting('test.biz_b')::uuid;
  v_leaked RECORD;
  v_caught BOOLEAN := false;
BEGIN
  BEGIN
    SELECT * INTO v_leaked FROM public.rpc_top_products(v_biz_b, 5, NULL) LIMIT 1;
    -- Si llegamos acá sin excepción, o bien no hay fuga (0 filas, lo cual
    -- igual sería un bug porque debería ser Forbidden explícito, no vacío
    -- silencioso) o hay fuga real -- ambos casos son FAIL.
    RAISE EXCEPTION 'FAIL caso 2: rpc_top_products(B) llamado por dueño de A NO lanzó excepción -- fuga cross-tenant reabierta (revenue expuesto: %)', v_leaked.total_revenue;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN
      v_caught := true;
    ELSE
      RAISE;
    END IF;
  END;
  ASSERT v_caught, 'FAIL caso 2: rpc_top_products(B) no lanzó exactamente "Forbidden"';

  v_caught := false;
  BEGIN
    PERFORM * FROM public.rpc_orders_by_day(v_biz_b, 7);
    RAISE EXCEPTION 'FAIL caso 2: rpc_orders_by_day(B) llamado por dueño de A NO lanzó excepción -- fuga cross-tenant reabierta';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 2: rpc_orders_by_day(B) no lanzó exactamente "Forbidden"';

  v_caught := false;
  BEGIN
    PERFORM public.rpc_dashboard_funnel(v_biz_b, now() - interval '7 days', now(), now() - interval '14 days', now() - interval '7 days');
    RAISE EXCEPTION 'FAIL caso 2: rpc_dashboard_funnel(B) llamado por dueño de A NO lanzó excepción -- fuga cross-tenant reabierta';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 2: rpc_dashboard_funnel(B) no lanzó exactamente "Forbidden"';

  RAISE NOTICE 'OK: caso 2 -- dueño de A intenta consultar B: las 3 RPC rechazan con Forbidden, cero datos de B expuestos';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 3 -- Dueño de B intenta consultar A (ajeno): simétrico al caso 2.
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b002', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000b002','role','authenticated')::text, true);

DO $$
DECLARE
  v_biz_a UUID := current_setting('test.biz_a')::uuid;
  v_caught BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM * FROM public.rpc_top_products(v_biz_a, 5, NULL);
    RAISE EXCEPTION 'FAIL caso 3: rpc_top_products(A) llamado por dueño de B NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 3: rpc_top_products(A) no lanzó exactamente "Forbidden"';

  v_caught := false;
  BEGIN
    PERFORM * FROM public.rpc_orders_by_day(v_biz_a, 7);
    RAISE EXCEPTION 'FAIL caso 3: rpc_orders_by_day(A) llamado por dueño de B NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 3: rpc_orders_by_day(A) no lanzó exactamente "Forbidden"';

  v_caught := false;
  BEGIN
    PERFORM public.rpc_dashboard_funnel(v_biz_a, now() - interval '7 days', now(), now() - interval '14 days', now() - interval '7 days');
    RAISE EXCEPTION 'FAIL caso 3: rpc_dashboard_funnel(A) llamado por dueño de B NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 3: rpc_dashboard_funnel(A) no lanzó exactamente "Forbidden"';

  RAISE NOTICE 'OK: caso 3 -- dueño de B intenta consultar A: las 3 RPC rechazan con Forbidden';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 4 -- anon (sin JWT) intenta consultar A: debe rechazar por falta de
-- EXECUTE (permission denied), ni siquiera debe llegar a evaluar el guard.
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

DO $$
DECLARE
  v_biz_a UUID := current_setting('test.biz_a')::uuid;
  v_caught BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM * FROM public.rpc_top_products(v_biz_a, 5, NULL);
    RAISE EXCEPTION 'FAIL caso 4: rpc_top_products(A) llamado por anon NO lanzó excepción -- anon nunca debería poder ejecutar esta función';
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'FAIL caso 4: rpc_top_products no rechazó a anon con insufficient_privilege';

  v_caught := false;
  BEGIN
    PERFORM * FROM public.rpc_orders_by_day(v_biz_a, 7);
    RAISE EXCEPTION 'FAIL caso 4: rpc_orders_by_day(A) llamado por anon NO lanzó excepción';
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'FAIL caso 4: rpc_orders_by_day no rechazó a anon con insufficient_privilege';

  v_caught := false;
  BEGIN
    PERFORM public.rpc_dashboard_funnel(v_biz_a, now() - interval '7 days', now(), now() - interval '14 days', now() - interval '7 days');
    RAISE EXCEPTION 'FAIL caso 4: rpc_dashboard_funnel(A) llamado por anon NO lanzó excepción';
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := true;
  END;
  ASSERT v_caught, 'FAIL caso 4: rpc_dashboard_funnel no rechazó a anon con insufficient_privilege';

  RAISE NOTICE 'OK: caso 4 -- anon no tiene EXECUTE en ninguna de las 3 RPC (permission denied antes de evaluar nada)';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 5 -- authenticated SIN negocio propio (usuario C) intenta consultar
-- A: debe rechazar con Forbidden (tiene EXECUTE, pero el guard lo bloquea
-- porque no existe ningún wa_businesses con su user_id).
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c003', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000c003','role','authenticated')::text, true);

DO $$
DECLARE
  v_biz_a UUID := current_setting('test.biz_a')::uuid;
  v_caught BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM * FROM public.rpc_top_products(v_biz_a, 5, NULL);
    RAISE EXCEPTION 'FAIL caso 5: rpc_top_products(A) llamado por usuario sin negocio NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 5: rpc_top_products no lanzó exactamente "Forbidden" para usuario sin negocio';

  v_caught := false;
  BEGIN
    PERFORM * FROM public.rpc_orders_by_day(v_biz_a, 7);
    RAISE EXCEPTION 'FAIL caso 5: rpc_orders_by_day(A) llamado por usuario sin negocio NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 5: rpc_orders_by_day no lanzó exactamente "Forbidden" para usuario sin negocio';

  v_caught := false;
  BEGIN
    PERFORM public.rpc_dashboard_funnel(v_biz_a, now() - interval '7 days', now(), now() - interval '14 days', now() - interval '7 days');
    RAISE EXCEPTION 'FAIL caso 5: rpc_dashboard_funnel(A) llamado por usuario sin negocio NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 5: rpc_dashboard_funnel no lanzó exactamente "Forbidden" para usuario sin negocio';

  RAISE NOTICE 'OK: caso 5 -- authenticated sin negocio propio: las 3 RPC rechazan con Forbidden';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 6 -- Grants efectivos: anon sin EXECUTE, authenticated con EXECUTE,
-- PUBLIC sin EXECUTE (el REVOKE explícito debe haber limpiado el EXECUTE
-- implícito que Postgres otorga a PUBLIC al crear una función).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn TEXT;
  v_anon BOOLEAN;
  v_auth BOOLEAN;
  v_public BOOLEAN;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.rpc_top_products(uuid,int,int)',
    'public.rpc_orders_by_day(uuid,int)',
    'public.rpc_dashboard_funnel(uuid,timestamptz,timestamptz,timestamptz,timestamptz)'
  ] LOOP
    v_anon   := has_function_privilege('anon', v_fn, 'EXECUTE');
    v_auth   := has_function_privilege('authenticated', v_fn, 'EXECUTE');
    v_public := has_function_privilege('public', v_fn, 'EXECUTE');
    ASSERT v_anon = false, 'FAIL caso 6: anon tiene EXECUTE en ' || v_fn;
    ASSERT v_auth = true, 'FAIL caso 6: authenticated NO tiene EXECUTE en ' || v_fn;
    ASSERT v_public = false, 'FAIL caso 6: PUBLIC (pseudo-rol) tiene EXECUTE en ' || v_fn;
  END LOOP;
  RAISE NOTICE 'OK: caso 6 -- grants efectivos correctos en las 3 RPC (anon=false, authenticated=true, PUBLIC=false)';
END $$;

DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TODOS LOS CASOS PASARON -- SEGURIDAD-WALINKA-1A verificado';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
