-- Verificación MANUAL de 20260921110000_fix_plan_admin_rpcs_authorization.sql
-- (SEGURIDAD-WALINKA-1B).
-- NO es una migración -- no vive en supabase/migrations/ a propósito, para
-- que el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción -- solo contra una instancia
-- local/throwaway.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluido el fix)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_plan_admin_rpcs_authorization.sql
--   4. supabase stop              (apaga y descarta todo -- nada persiste)
--
-- Mismo patrón de simulación de sesión que verify_analytics_rpcs_tenant_isolation.sql
-- (SEGURIDAD-WALINKA-1A) y verify_crm_pos_payment_methods.sql: SET LOCAL ROLE
-- <rol> + set_config('request.jwt.claim.sub', ...) / set_config('request.jwt.claims', ...)
-- antes de cada llamada. Todo el script corre en una sola transacción con
-- ROLLBACK final -- nunca persiste nada.
--
-- Cubre la matriz completa pedida por SEGURIDAD-WALINKA-1B:
--
-- PLAN RPCs (wa_get_plan_usage, wa_check_order_limit, wa_check_product_limit):
--   1. Dueño de A consulta A                        -> permitido
--   2. Dueño de A consulta B (ajeno)                 -> Forbidden
--   3. Dueño de B consulta A (ajeno)                 -> Forbidden
--   4. authenticated SIN negocio consulta A          -> Forbidden
--   5. anon consulta A                               -> permission denied
--   6. admin consulta A (ajeno a él) -- SOLO wa_get_plan_usage -> permitido
--
-- ADMIN RPCs (wa_admin_plan_stats, wa_admin_suspicious_businesses, wa_admin_notify):
--   7. admin ejecuta las 3                           -> permitido
--   8. usuario normal (authenticated, no admin) ejecuta las 3 -> Forbidden /
--      permission denied según el diseño final (wa_admin_notify: ninguna GRANT)
--   9. anon ejecuta las 3                            -> permission denied
--  10. wa_admin_notify: el trigger interno (simulando el webhook de MP vía
--      un UPDATE en wa_payments) SIGUE insertando la notificación -- prueba
--      de que revocar EXECUTE a roles cliente no rompió el único consumidor
--      real.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: negocio A (user A), negocio B (user B), user C sin negocio,
-- user D admin (app_metadata.role=admin, sin negocio propio), 1 producto
-- activo + 1 pedido del mes en A (para que wa_check_*_limit/wa_get_plan_usage
-- tengan algo real que contar), y 1 pago 'pending' en A (para probar el
-- trigger de wa_admin_notify más abajo).
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, created_at, aud, role) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'owner-a@verify.test', '{}'::jsonb, '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b002', 'owner-b@verify.test', '{}'::jsonb, '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c003', 'no-business@verify.test', '{}'::jsonb, '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d004', 'admin@verify.test', '{}'::jsonb, '{"role":"admin"}'::jsonb, now(), 'authenticated', 'authenticated');

DO $$
DECLARE
  v_biz_a UUID;
  v_biz_b UUID;
  v_product_a UUID;
  v_order_a UUID;
  v_payment_a UUID;
BEGIN
  INSERT INTO public.wa_businesses (user_id, name, whatsapp, plan_slug)
    VALUES ('00000000-0000-0000-0000-00000000a001', 'Negocio A (verify)', '56900001111', 'starter')
    RETURNING id INTO v_biz_a;
  INSERT INTO public.wa_businesses (user_id, name, whatsapp, plan_slug)
    VALUES ('00000000-0000-0000-0000-00000000b002', 'Negocio B (verify)', '56900002222', 'starter')
    RETURNING id INTO v_biz_b;
  ASSERT v_biz_a IS NOT NULL AND v_biz_b IS NOT NULL, 'FAIL: setup -- no se crearon los negocios de prueba';

  INSERT INTO public.wa_products (business_id, name, price, status, is_active)
    VALUES (v_biz_a, 'Producto A1', 1000, 'active', true) RETURNING id INTO v_product_a;

  INSERT INTO public.wa_orders (business_id, customer_name, total_amount, payment_status, created_at, updated_at)
    VALUES (v_biz_a, 'Cliente A', 5000, 'pagado', now(), now()) RETURNING id INTO v_order_a;

  INSERT INTO public.wa_payments (business_id, user_id, plan_slug, amount, status, mp_status, external_reference)
    VALUES (v_biz_a, '00000000-0000-0000-0000-00000000a001', 'pro', 5990, 'pending', 'pending', 'verify-1b-' || v_biz_a::text)
    RETURNING id INTO v_payment_a;

  PERFORM set_config('test.biz_a', v_biz_a::text, true);
  PERFORM set_config('test.biz_b', v_biz_b::text, true);
  PERFORM set_config('test.payment_a', v_payment_a::text, true);
  RAISE NOTICE 'OK: setup -- Negocio A (%), Negocio B (%), pago pendiente (%) creados', v_biz_a, v_biz_b, v_payment_a;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Helper: PERFORM_FORBIDDEN(expr) -- envuelve una llamada RPC y assert que
-- lanza exactamente 'Forbidden'. Se repite inline (plpgsql no permite pasar
-- un statement arbitrario como parámetro fácilmente sin dynamic SQL, y acá
-- preferimos evitar EXECUTE con SQL dinámico incluso en el diagnóstico).
-- ══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 1 -- Dueño de A consulta A (las 3 PLAN RPC): permitido, datos reales.
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000a001','role','authenticated','app_metadata', json_build_object())::text, true);

DO $$
DECLARE
  v_biz_a UUID := current_setting('test.biz_a')::uuid;
  v_usage JSONB;
  v_order_ok BOOLEAN;
  v_product_ok BOOLEAN;
BEGIN
  v_usage := public.wa_get_plan_usage(v_biz_a);
  ASSERT (v_usage->>'activeProducts')::int = 1, 'FAIL caso 1: activeProducts de A debería ser 1, fue ' || (v_usage->>'activeProducts');
  ASSERT (v_usage->>'ordersThisMonth')::int = 1, 'FAIL caso 1: ordersThisMonth de A debería ser 1, fue ' || (v_usage->>'ordersThisMonth');

  v_order_ok := public.wa_check_order_limit(v_biz_a);
  ASSERT v_order_ok = true, 'FAIL caso 1: wa_check_order_limit(A) debería ser true (1 de 30), fue ' || v_order_ok;

  v_product_ok := public.wa_check_product_limit(v_biz_a);
  ASSERT v_product_ok = true, 'FAIL caso 1: wa_check_product_limit(A) debería ser true (1 de 10), fue ' || v_product_ok;

  RAISE NOTICE 'OK: caso 1 -- dueño de A consulta A: las 3 PLAN RPC devuelven datos correctos de su propio negocio';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 2 -- Dueño de A intenta consultar B (ajeno): Forbidden en las 3.
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000a001','role','authenticated','app_metadata', json_build_object())::text, true);

DO $$
DECLARE
  v_biz_b UUID := current_setting('test.biz_b')::uuid;
  v_caught BOOLEAN;
BEGIN
  v_caught := false;
  BEGIN
    PERFORM public.wa_get_plan_usage(v_biz_b);
    RAISE EXCEPTION 'FAIL caso 2: wa_get_plan_usage(B) llamado por dueño de A NO lanzó excepción -- fuga cross-tenant reabierta';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 2: wa_get_plan_usage no lanzó exactamente "Forbidden"';

  v_caught := false;
  BEGIN
    PERFORM public.wa_check_order_limit(v_biz_b);
    RAISE EXCEPTION 'FAIL caso 2: wa_check_order_limit(B) llamado por dueño de A NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 2: wa_check_order_limit no lanzó exactamente "Forbidden"';

  v_caught := false;
  BEGIN
    PERFORM public.wa_check_product_limit(v_biz_b);
    RAISE EXCEPTION 'FAIL caso 2: wa_check_product_limit(B) llamado por dueño de A NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 2: wa_check_product_limit no lanzó exactamente "Forbidden"';

  RAISE NOTICE 'OK: caso 2 -- dueño de A intenta consultar B: las 3 PLAN RPC rechazan con Forbidden';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 3 -- Dueño de B intenta consultar A (ajeno): simétrico al caso 2.
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b002', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000b002','role','authenticated','app_metadata', json_build_object())::text, true);

DO $$
DECLARE
  v_biz_a UUID := current_setting('test.biz_a')::uuid;
  v_caught BOOLEAN;
BEGIN
  v_caught := false;
  BEGIN
    PERFORM public.wa_get_plan_usage(v_biz_a);
    RAISE EXCEPTION 'FAIL caso 3: wa_get_plan_usage(A) llamado por dueño de B NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 3: wa_get_plan_usage no lanzó exactamente "Forbidden"';

  v_caught := false;
  BEGIN
    PERFORM public.wa_check_order_limit(v_biz_a);
    RAISE EXCEPTION 'FAIL caso 3: wa_check_order_limit(A) llamado por dueño de B NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 3: wa_check_order_limit no lanzó exactamente "Forbidden"';

  v_caught := false;
  BEGIN
    PERFORM public.wa_check_product_limit(v_biz_a);
    RAISE EXCEPTION 'FAIL caso 3: wa_check_product_limit(A) llamado por dueño de B NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 3: wa_check_product_limit no lanzó exactamente "Forbidden"';

  RAISE NOTICE 'OK: caso 3 -- dueño de B intenta consultar A: las 3 PLAN RPC rechazan con Forbidden';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 4 -- authenticated SIN negocio propio (user C) consulta A: Forbidden
-- en las 3 PLAN RPC.
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c003', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000c003','role','authenticated','app_metadata', json_build_object())::text, true);

DO $$
DECLARE
  v_biz_a UUID := current_setting('test.biz_a')::uuid;
  v_caught BOOLEAN;
BEGIN
  v_caught := false;
  BEGIN
    PERFORM public.wa_get_plan_usage(v_biz_a);
    RAISE EXCEPTION 'FAIL caso 4: wa_get_plan_usage(A) llamado por user sin negocio NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 4: wa_get_plan_usage no lanzó exactamente "Forbidden"';

  v_caught := false;
  BEGIN
    PERFORM public.wa_check_order_limit(v_biz_a);
    RAISE EXCEPTION 'FAIL caso 4: wa_check_order_limit(A) llamado por user sin negocio NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 4: wa_check_order_limit no lanzó exactamente "Forbidden"';

  v_caught := false;
  BEGIN
    PERFORM public.wa_check_product_limit(v_biz_a);
    RAISE EXCEPTION 'FAIL caso 4: wa_check_product_limit(A) llamado por user sin negocio NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 4: wa_check_product_limit no lanzó exactamente "Forbidden"';

  RAISE NOTICE 'OK: caso 4 -- authenticated sin negocio propio: las 3 PLAN RPC rechazan con Forbidden';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 5 -- anon consulta A: permission denied (sin EXECUTE) en las 3.
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

DO $$
DECLARE
  v_biz_a UUID := current_setting('test.biz_a')::uuid;
  v_caught BOOLEAN;
BEGIN
  v_caught := false;
  BEGIN
    PERFORM public.wa_get_plan_usage(v_biz_a);
    RAISE EXCEPTION 'FAIL caso 5: wa_get_plan_usage(A) llamado por anon NO lanzó excepción';
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  ASSERT v_caught, 'FAIL caso 5: wa_get_plan_usage no rechazó a anon con insufficient_privilege';

  v_caught := false;
  BEGIN
    PERFORM public.wa_check_order_limit(v_biz_a);
    RAISE EXCEPTION 'FAIL caso 5: wa_check_order_limit(A) llamado por anon NO lanzó excepción';
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  ASSERT v_caught, 'FAIL caso 5: wa_check_order_limit no rechazó a anon con insufficient_privilege';

  v_caught := false;
  BEGIN
    PERFORM public.wa_check_product_limit(v_biz_a);
    RAISE EXCEPTION 'FAIL caso 5: wa_check_product_limit(A) llamado por anon NO lanzó excepción';
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  ASSERT v_caught, 'FAIL caso 5: wa_check_product_limit no rechazó a anon con insufficient_privilege';

  RAISE NOTICE 'OK: caso 5 -- anon no tiene EXECUTE en ninguna de las 3 PLAN RPC';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 6 -- admin consulta el uso de A (negocio ajeno al admin): permitido.
-- Solo aplica a wa_get_plan_usage (la única con excepción de admin, por su
-- consumidor real en AdminBusinessDetailPage.jsx). wa_check_order_limit y
-- wa_check_product_limit NO tienen esta excepción a propósito (sin
-- consumidor admin conocido).
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d004', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000d004','role','authenticated','app_metadata', json_build_object('role','admin'))::text, true);

DO $$
DECLARE
  v_biz_a UUID := current_setting('test.biz_a')::uuid;
  v_usage JSONB;
BEGIN
  v_usage := public.wa_get_plan_usage(v_biz_a);
  ASSERT (v_usage->>'activeProducts')::int = 1, 'FAIL caso 6: admin debería poder leer el uso de A (activeProducts=1), obtuvo ' || (v_usage->>'activeProducts');
  RAISE NOTICE 'OK: caso 6 -- admin consulta el plan/uso de un negocio ajeno (A): permitido, dato correcto';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 7 -- admin ejecuta las 3 ADMIN RPC: permitido.
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d004', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000d004','role','authenticated','app_metadata', json_build_object('role','admin'))::text, true);

DO $$
DECLARE
  v_stats JSONB;
  v_suspicious JSONB;
  v_notify_id UUID;
BEGIN
  v_stats := public.wa_admin_plan_stats();
  ASSERT v_stats IS NOT NULL, 'FAIL caso 7: wa_admin_plan_stats() admin debería devolver datos';
  ASSERT (v_stats->>'starter')::int >= 2, 'FAIL caso 7: wa_admin_plan_stats debería contar al menos 2 negocios starter (A y B), obtuvo ' || (v_stats->>'starter');

  v_suspicious := public.wa_admin_suspicious_businesses();
  ASSERT v_suspicious IS NOT NULL, 'FAIL caso 7: wa_admin_suspicious_businesses() admin debería devolver datos';

  -- wa_admin_notify no tiene GRANT a NINGÚN rol cliente, ni siquiera admin
  -- vía RPC directo (su único consumidor legítimo es el trigger interno,
  -- ver caso 10) -- acá confirmamos que incluso el admin recibe
  -- permission denied si intentara llamarla directo.
  BEGIN
    PERFORM public.wa_admin_notify('test', 'test', NULL, NULL);
    RAISE EXCEPTION 'FAIL caso 7: wa_admin_notify() llamada directa por admin NO lanzó excepción -- debería ser inalcanzable vía RPC para cualquier rol cliente';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- esperado
  END;

  RAISE NOTICE 'OK: caso 7 -- admin ejecuta wa_admin_plan_stats/wa_admin_suspicious_businesses (permitido); wa_admin_notify sigue inalcanzable vía RPC incluso para admin (por diseño, ver caso 10)';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 8 -- usuario normal (authenticated, NO admin) ejecuta las 3 ADMIN RPC:
-- Forbidden (las 2 con gate interno) / permission denied (wa_admin_notify,
-- sin GRANT a ningún rol cliente).
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000a001','role','authenticated','app_metadata', json_build_object())::text, true);

DO $$
DECLARE
  v_caught BOOLEAN;
BEGIN
  v_caught := false;
  BEGIN
    PERFORM public.wa_admin_plan_stats();
    RAISE EXCEPTION 'FAIL caso 8: wa_admin_plan_stats() llamada por usuario normal NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 8: wa_admin_plan_stats no lanzó exactamente "Forbidden" para usuario normal';

  v_caught := false;
  BEGIN
    PERFORM public.wa_admin_suspicious_businesses();
    RAISE EXCEPTION 'FAIL caso 8: wa_admin_suspicious_businesses() llamada por usuario normal NO lanzó excepción';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Forbidden' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  ASSERT v_caught, 'FAIL caso 8: wa_admin_suspicious_businesses no lanzó exactamente "Forbidden" para usuario normal';

  v_caught := false;
  BEGIN
    PERFORM public.wa_admin_notify('test', 'test', NULL, NULL);
    RAISE EXCEPTION 'FAIL caso 8: wa_admin_notify() llamada por usuario normal NO lanzó excepción -- un no-admin pudo insertar una notificación falsa';
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  ASSERT v_caught, 'FAIL caso 8: wa_admin_notify no rechazó a usuario normal con insufficient_privilege';

  RAISE NOTICE 'OK: caso 8 -- usuario normal (no admin): las 3 ADMIN RPC rechazan (Forbidden o permission denied), ninguna notificación falsa insertada';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 9 -- anon ejecuta las 3 ADMIN RPC: permission denied (sin EXECUTE).
-- ══════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

DO $$
DECLARE
  v_caught BOOLEAN;
BEGIN
  v_caught := false;
  BEGIN
    PERFORM public.wa_admin_plan_stats();
    RAISE EXCEPTION 'FAIL caso 9: wa_admin_plan_stats() llamada por anon NO lanzó excepción';
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  ASSERT v_caught, 'FAIL caso 9: wa_admin_plan_stats no rechazó a anon con insufficient_privilege';

  v_caught := false;
  BEGIN
    PERFORM public.wa_admin_suspicious_businesses();
    RAISE EXCEPTION 'FAIL caso 9: wa_admin_suspicious_businesses() llamada por anon NO lanzó excepción';
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  ASSERT v_caught, 'FAIL caso 9: wa_admin_suspicious_businesses no rechazó a anon con insufficient_privilege';

  v_caught := false;
  BEGIN
    PERFORM public.wa_admin_notify('test', 'test', NULL, NULL);
    RAISE EXCEPTION 'FAIL caso 9: wa_admin_notify() llamada por anon NO lanzó excepción';
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  ASSERT v_caught, 'FAIL caso 9: wa_admin_notify no rechazó a anon con insufficient_privilege';

  RAISE NOTICE 'OK: caso 9 -- anon no tiene EXECUTE en ninguna de las 3 ADMIN RPC';
END $$;
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- CASO 10 -- REGRESIÓN: el trigger interno (wa_trigger_payment_status_notify,
-- disparado al aprobar un pago, como lo haría mp-webhook con service_role)
-- SIGUE insertando la notificación pese al REVOKE de EXECUTE a roles
-- cliente -- prueba de que la corrección no rompió el único consumidor real
-- de wa_admin_notify.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_payment_a UUID := current_setting('test.payment_a')::uuid;
  v_notif_count_before INT;
  v_notif_count_after INT;
BEGIN
  SELECT COUNT(*) INTO v_notif_count_before FROM public.wa_admin_notifications;

  -- Simula lo que hace mp-webhook: UPDATE wa_payments.status a 'approved'
  -- corriendo como el rol que conecta (acá, el superusuario de psql,
  -- equivalente en privilegios a service_role para este propósito -- lo
  -- que importa es que NO hay auth.uid() de usuario en esta sesión, igual
  -- que en producción cuando el webhook actualiza el pago).
  UPDATE public.wa_payments SET status = 'approved' WHERE id = v_payment_a;

  SELECT COUNT(*) INTO v_notif_count_after FROM public.wa_admin_notifications;

  ASSERT v_notif_count_after = v_notif_count_before + 1,
    'FAIL caso 10: el trigger de wa_payments no insertó la notificación esperada tras aprobar el pago -- REVOKE de wa_admin_notify rompió el flujo real de mp-webhook';

  RAISE NOTICE 'OK: caso 10 -- el trigger interno de wa_payments sigue insertando notificaciones tras el REVOKE (el flujo real de mp-webhook no se rompió)';
END $$;

DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TODOS LOS CASOS PASARON -- SEGURIDAD-WALINKA-1B verificado';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
