-- Verificación MANUAL de 20260808120000_referral_core_user_centric.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción (project-ref hxxdketymcntadffmajf)
-- — solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluidas
--                                   Parte 1 y esta corrección user-centric)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_referral_core_user_centric.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- Reemplaza a verify_referral_core_part1.sql como verificación VIGENTE del
-- modelo actual (ese archivo queda intacto como historia del diseño
-- anterior, no se borra ni se edita).
--
-- Simula usuarios autenticados vía request.jwt.claim(s) + SET LOCAL ROLE
-- (auth.uid() lee esos GUCs). Todo el script corre en una sola transacción
-- con ROLLBACK final.
--
-- Nota sobre R1: wa_on_auth_user_created (AFTER INSERT ON auth.users) crea
-- SIEMPRE un wa_businesses por cada nuevo usuario -- no se toca ese trigger
-- acá. Para simular honestamente "usuario SIN negocio" este script borra
-- explícitamente, dentro de su propia transacción, el negocio que R1 acaba
-- de crear para los usuarios que necesitan probar ese estado.
--
-- Nota sobre duplicate-person: la comparación es auth.users.email (nunca
-- wa_businesses.email). Dos cuentas normales NUNCA pueden compartir email
-- (índice único parcial sobre auth.users(email) WHERE is_sso_user = false)
-- -- el caso 5 simula específicamente el vector real que SÍ puede
-- colisionar: una cuenta vinculada a SSO (is_sso_user = true) con el mismo
-- email, que queda fuera de ese índice único parcial.
--
-- Nota sobre wa_register_referral_paid_period: esta función NO mira
-- wa_payments, NO conoce providers, NO hace ningún cálculo de fechas de
-- plan. Simplemente registra en referral_paid_periods cada period_ref que
-- Billing (hoy no construido) le entregue, y cuenta. Por eso los fixtures
-- de este bloque no crean absolutamente ninguna fila de wa_payments ni de
-- wa_businesses reales para el flujo de pago -- reflejan fielmente la
-- interfaz real: Billing llama con (referred_user_id, period_ref) y nada más.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: 7 usuarios reales (vía INSERT en auth.users, dispara el trigger
-- real de R1 sin tocarlo -- cada uno recibe un wa_businesses automático)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'referrer-nobiz@example.test',      '{"full_name": "Referidor Sin Negocio"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'referido-recompensa@example.test','{"full_name": "Referido Con Recompensa"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c4', 'click-window-test@example.test',  '{"full_name": "Click Window Test"}'::jsonb,     now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c5', 'third-party-test@example.test',   '{"full_name": "Tercero Ajeno"}'::jsonb,         now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c6', 'second-referrer-test@example.test','{"full_name": "Segundo Referidor"}'::jsonb,    now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c7', 'never-referred-test@example.test','{"full_name": "Nunca Referido"}'::jsonb,       now(), 'authenticated', 'authenticated');

-- c1 y c2 deben probar el estado "SIN negocio" -- se borra explícitamente
-- el wa_businesses que R1 acaba de crearles.
DELETE FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000c1';
DELETE FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000c2';

DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000c1'),
    'FAIL: setup — c1 (referidor) todavía tiene un negocio';
  ASSERT NOT EXISTS (SELECT 1 FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000c2'),
    'FAIL: setup — c2 (referido) todavía tiene un negocio';
  RAISE NOTICE 'OK: setup — 6 usuarios creados; c1 y c2 quedaron explícitamente sin wa_businesses';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 1: wa_get_or_create_my_referral_code() — referidor SIN negocio
-- obtiene código, y la llamada es idempotente.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c1','role','authenticated')::text, true);

DO $$
DECLARE
  v_code_1 TEXT;
  v_code_2 TEXT;
BEGIN
  SELECT public.wa_get_or_create_my_referral_code() INTO v_code_1;
  ASSERT v_code_1 IS NOT NULL AND v_code_1 ~ '^[a-z0-9][a-z0-9-]{2,31}$',
    'FAIL: caso 1 — código inválido o nulo: ' || COALESCE(v_code_1, 'NULL');

  SELECT public.wa_get_or_create_my_referral_code() INTO v_code_2;
  ASSERT v_code_1 = v_code_2, 'FAIL: caso 1 — la segunda llamada devolvió un código distinto (no es idempotente)';

  PERFORM set_config('test.referrer_code', v_code_1, true);
  RAISE NOTICE 'OK: caso 1 — referidor SIN negocio obtiene código y es idempotente. code=%', v_code_1;
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 2: wa_resolve_referral_code() — resolución pública sigue funcionando.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE anon;

DO $$
DECLARE
  v_code   TEXT := current_setting('test.referrer_code', true);
  v_result JSONB;
BEGIN
  SELECT public.wa_resolve_referral_code(v_code) INTO v_result;
  ASSERT (v_result->>'valid')::boolean = true, 'FAIL: caso 2 — código válido resuelto como inválido';
  ASSERT v_result->>'referrerName' = 'Referidor Sin Negocio',
    'FAIL: caso 2 — referrerName no coincide. obtuvo=' || (v_result->>'referrerName');
  ASSERT NOT (v_result ? 'user_id') AND NOT (v_result ? 'email') AND NOT (v_result ? 'business_id'),
    'FAIL: caso 2 — la resolución pública expone datos sensibles';

  SELECT public.wa_resolve_referral_code('no-existe-xyz') INTO v_result;
  ASSERT (v_result->>'valid')::boolean = false, 'FAIL: caso 2 — código inexistente resuelto como válido';

  RAISE NOTICE 'OK: caso 2 — wa_resolve_referral_code() sigue funcionando para anon';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 3: wa_attribute_referral() — referido SIN negocio se atribuye
-- inmediatamente.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c2','role','authenticated')::text, true);

DO $$
DECLARE
  v_code   TEXT := current_setting('test.referrer_code', true);
  v_result JSONB;
BEGIN
  SELECT public.wa_attribute_referral(v_code) INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = true, 'FAIL: caso 3 — atribución esperada no ocurrió: ' || v_result::text;
  ASSERT v_result->>'status' = 'qualified', 'FAIL: caso 3 — status esperado qualified';
  ASSERT (SELECT referrer_user_id FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c2') = '00000000-0000-0000-0000-0000000000c1',
    'FAIL: caso 3 — referrer_user_id incorrecto en la atribución';
  ASSERT (SELECT referred_business_id FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c2') IS NULL,
    'FAIL: caso 3 — referred_business_id debería ser NULL';

  RAISE NOTICE 'OK: caso 3 — referido SIN negocio se atribuye inmediatamente, sin ningún business_id';
END $$;

-- Reintento — idempotencia de atribución.
DO $$
DECLARE
  v_code   TEXT := current_setting('test.referrer_code', true);
  v_result JSONB;
BEGIN
  SELECT public.wa_attribute_referral(v_code) INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = false, 'FAIL: caso 3b — el reintento debía ser rechazado';
  ASSERT v_result->>'reason' = 'already_attributed', 'FAIL: caso 3b — reason esperado already_attributed';
  ASSERT (SELECT count(*) FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c2') = 1,
    'FAIL: caso 3b — el reintento creó una segunda fila';
  RAISE NOTICE 'OK: caso 3b — reintento de atribución es no-op idempotente';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 4: auto-referido — comparación directa por user_id
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c1','role','authenticated')::text, true);

DO $$
DECLARE
  v_code   TEXT := current_setting('test.referrer_code', true);
  v_result JSONB;
BEGIN
  SELECT public.wa_attribute_referral(v_code) INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = false, 'FAIL: caso 4 — el auto-referido debía ser rechazado';
  ASSERT v_result->>'reason' = 'self_referral', 'FAIL: caso 4 — reason esperado self_referral';
  ASSERT NOT EXISTS (SELECT 1 FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c1'),
    'FAIL: caso 4 — se creó una fila de auto-referido';
  RAISE NOTICE 'OK: caso 4 — auto-referido rechazado, sin fila creada';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 5: duplicate-person — vector real: cuenta SSO con el MISMO email
-- que el referidor.
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role, is_sso_user)
VALUES ('00000000-0000-0000-0000-0000000000c3', 'referrer-nobiz@example.test', '{"full_name": "Cuenta SSO Duplicada"}'::jsonb, now(), 'authenticated', 'authenticated', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c3','role','authenticated')::text, true);

DO $$
DECLARE
  v_code   TEXT := current_setting('test.referrer_code', true);
  v_result JSONB;
BEGIN
  SELECT public.wa_attribute_referral(v_code) INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = true, 'FAIL: caso 5 — la fila de trazabilidad no se creó: ' || v_result::text;
  ASSERT v_result->>'status' = 'disqualified', 'FAIL: caso 5 — status esperado disqualified';
  ASSERT (SELECT disqualified_reason FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c3') = 'duplicate_person',
    'FAIL: caso 5 — disqualified_reason incorrecto';
  RAISE NOTICE 'OK: caso 5 — duplicate-person detectado vía auth.users.email (cuenta SSO), fila disqualified';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 6: ventana de 30 días
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c4','role','authenticated')::text, true);

DO $$
DECLARE
  v_code   TEXT := current_setting('test.referrer_code', true);
  v_result JSONB;
BEGIN
  SELECT public.wa_attribute_referral(v_code, now() + interval '2 hours') INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = false AND v_result->>'reason' = 'click_in_future',
    'FAIL: caso 6a — click_at futuro debía rechazarse';

  SELECT public.wa_attribute_referral(v_code, now() - interval '31 days') INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = false AND v_result->>'reason' = 'click_window_expired',
    'FAIL: caso 6b — click_at de 31 días debía rechazarse';

  ASSERT NOT EXISTS (SELECT 1 FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c4'),
    'FAIL: caso 6 — se creó una fila con click_at fuera de ventana';

  SELECT public.wa_attribute_referral(v_code, now() - interval '5 days') INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = true AND v_result->>'status' = 'qualified',
    'FAIL: caso 6c — click_at de 5 días debía atribuir';

  RAISE NOTICE 'OK: caso 6 — ventana de 30 días intacta';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 7: first-attribution-wins por referred_user_id
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c6', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c6','role','authenticated')::text, true);

DO $$
DECLARE
  v_second_code TEXT;
BEGIN
  SELECT public.wa_get_or_create_my_referral_code() INTO v_second_code;
  PERFORM set_config('test.second_referrer_code', v_second_code, true);
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c2','role','authenticated')::text, true);

DO $$
DECLARE
  v_second_code TEXT := current_setting('test.second_referrer_code', true);
  v_result      JSONB;
BEGIN
  SELECT public.wa_attribute_referral(v_second_code) INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = false AND v_result->>'reason' = 'already_attributed',
    'FAIL: caso 7 — el segundo código no debía poder atribuir';
  ASSERT (SELECT referrer_user_id FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c2') = '00000000-0000-0000-0000-0000000000c1',
    'FAIL: caso 7 — el referrer_user_id cambió';
  RAISE NOTICE 'OK: caso 7 — first-attribution-wins: un segundo código no reemplaza la atribución existente';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 8: el overload antiguo de 3 argumentos ya no existe.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM public.wa_attribute_referral(gen_random_uuid(), 'algun-codigo', now());
  EXCEPTION WHEN undefined_function THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'FAIL: caso 8 — el overload de 3 argumentos todavía existe';
  RAISE NOTICE 'OK: caso 8 — overload antiguo eliminado explícitamente';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 9: wa_register_referral_paid_period — primer período: progreso
-- 1/2, sin recompensa.
-- Sin SET LOCAL ROLE: corre con privilegios de service_role/postgres
-- (conexión local de `supabase start`), igual que Billing lo haría.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000c2', 'period-2026-08') INTO v_result;

  ASSERT (v_result->>'registered')::boolean = true, 'FAIL: caso 9 — el primer período debía registrarse: ' || v_result::text;
  ASSERT (v_result->>'paidMonths')::int = 1, 'FAIL: caso 9 — paidMonths esperado 1, fue ' || (v_result->>'paidMonths');
  ASSERT (v_result->>'rewardCreated')::boolean = false, 'FAIL: caso 9 — no debía crearse recompensa todavía';
  ASSERT (SELECT count(*) FROM public.referral_paid_periods
          WHERE referral_attribution_id = (SELECT id FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c2')) = 1,
    'FAIL: caso 9 — no hay exactamente 1 fila en el ledger';
  ASSERT (SELECT count(*) FROM public.referral_commissions
          WHERE referral_attribution_id = (SELECT id FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c2')) = 0,
    'FAIL: caso 9 — no debía existir ninguna fila de recompensa todavía';

  RAISE NOTICE 'OK: caso 9 — primer período pagado registrado: progreso 1/2, sin recompensa';
END $$;

-- ── Caso 10: repetir el MISMO period_ref — sigue en 1/2, idempotente ───────

DO $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000c2', 'period-2026-08') INTO v_result;

  ASSERT (v_result->>'registered')::boolean = false, 'FAIL: caso 10 — el period_ref repetido debía rechazarse';
  ASSERT v_result->>'reason' = 'duplicate_period', 'FAIL: caso 10 — reason esperado duplicate_period';
  ASSERT (SELECT count(*) FROM public.referral_paid_periods
          WHERE referral_attribution_id = (SELECT id FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c2')) = 1,
    'FAIL: caso 10 — el ledger no debía crecer (protegido por UNIQUE(referral_attribution_id, period_ref) -- misma protección aplicaría ante llamadas concurrentes reales)';

  RAISE NOTICE 'OK: caso 10 — repetir el mismo period_ref es no-op idempotente, sigue en progreso 1/2';
END $$;

-- ── Caso 11: segundo period_ref DISTINTO — crea la recompensa US$5 ────────

DO $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000c2', 'period-2026-09') INTO v_result;

  ASSERT (v_result->>'registered')::boolean = true, 'FAIL: caso 11 — el segundo período debía registrarse: ' || v_result::text;
  ASSERT (v_result->>'paidMonths')::int = 2, 'FAIL: caso 11 — paidMonths esperado 2, fue ' || (v_result->>'paidMonths');
  ASSERT (v_result->>'rewardCreated')::boolean = true, 'FAIL: caso 11 — la recompensa debía crearse al llegar a 2: ' || v_result::text;

  ASSERT (
    SELECT referrer_user_id = '00000000-0000-0000-0000-0000000000c1'
       AND kind = 'qualification_reward'
       AND reward_amount = 5.00
       AND reward_currency = 'USD'
       AND required_paid_months = 2
       AND terms_version = 1
       AND status = 'pending'
       AND hold_until > now()
    FROM public.referral_commissions
    WHERE referral_attribution_id = (SELECT id FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c2')
  ), 'FAIL: caso 11 — snapshot de la recompensa incorrecto (reward_amount/reward_currency/required_paid_months/terms_version/status/hold)';

  PERFORM set_config('test.attribution_id', (SELECT id::text FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c2'), true);
  RAISE NOTICE 'OK: caso 11 — segundo período pagado (period_ref distinto) crea qualification_reward = USD 5.00, con snapshot correcto';
END $$;

-- ── Caso 12: tercer período — NO crea una segunda recompensa ──────────────

DO $$
DECLARE
  v_result JSONB;
  v_attribution_id UUID := current_setting('test.attribution_id', true)::UUID;
BEGIN
  SELECT public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000c2', 'period-2026-10') INTO v_result;

  ASSERT (v_result->>'registered')::boolean = true, 'FAIL: caso 12 — el tercer período sí debe registrarse en el ledger';
  ASSERT (v_result->>'rewardCreated')::boolean = false, 'FAIL: caso 12 — no debía crearse una segunda recompensa';
  ASSERT v_result->>'reason' = 'already_rewarded', 'FAIL: caso 12 — reason esperado already_rewarded';

  ASSERT (SELECT count(*) FROM public.referral_paid_periods WHERE referral_attribution_id = v_attribution_id) = 3,
    'FAIL: caso 12 — el ledger debía tener 3 filas (el progreso se sigue registrando aunque ya haya recompensa)';
  ASSERT (SELECT count(*) FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id AND kind = 'qualification_reward') = 1,
    'FAIL: caso 12 — debe seguir habiendo exactamente 1 recompensa, nunca 2';

  RAISE NOTICE 'OK: caso 12 — un tercer período pagado no genera una segunda recompensa (única por referral_attribution_id)';
END $$;

-- ── Caso 13: usuario NUNCA referido — no crea progreso ni recompensa ──────

DO $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000c7', 'period-2026-08') INTO v_result;

  ASSERT (v_result->>'registered')::boolean = false, 'FAIL: caso 13 — no debía registrarse progreso para un usuario sin atribución';
  ASSERT v_result->>'reason' = 'no_qualified_attribution', 'FAIL: caso 13 — reason esperado no_qualified_attribution';
  ASSERT NOT EXISTS (SELECT 1 FROM public.referral_paid_periods WHERE referred_user_id = '00000000-0000-0000-0000-0000000000c7'),
    'FAIL: caso 13 — se creó una fila de progreso para un usuario nunca referido';

  RAISE NOTICE 'OK: caso 13 — un usuario nunca referido no genera progreso ni recompensa';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 14: authenticated no puede registrar períodos; INSERT directo
-- también bloqueado.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c2','role','authenticated')::text, true);

DO $$
DECLARE
  v_failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000c2', 'client-forged-period');
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'FAIL: caso 14a — un cliente autenticado pudo invocar wa_register_referral_paid_period()';
  RAISE NOTICE 'OK: caso 14a — wa_register_referral_paid_period sigue inalcanzable para authenticated';
END $$;

DO $$
DECLARE
  v_failed BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO public.referral_paid_periods (referral_attribution_id, referred_user_id, period_ref)
    VALUES (
      current_setting('test.attribution_id', true)::UUID,
      '00000000-0000-0000-0000-0000000000c2',
      'client-direct-insert'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'FAIL: caso 14b — un cliente autenticado pudo insertar directamente en referral_paid_periods';
  RAISE NOTICE 'OK: caso 14b — INSERT directo en referral_paid_periods bloqueado (sin policy de INSERT bajo RLS)';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 15: RLS user-centric — referidor consulta el progreso de su
-- referido; el referido consulta su propio progreso; un tercero no ve nada.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c1','role','authenticated')::text, true);

DO $$
DECLARE
  v_visible_periods INTEGER;
  v_visible_commissions INTEGER;
BEGIN
  SELECT count(*) INTO v_visible_periods
  FROM public.referral_paid_periods
  WHERE referral_attribution_id = current_setting('test.attribution_id', true)::UUID;
  ASSERT v_visible_periods = 3, 'FAIL: caso 15a — el referidor no ve el progreso completo de su referido (esperaba 3, vio ' || v_visible_periods || ')';

  SELECT count(*) INTO v_visible_commissions FROM public.referral_commissions WHERE referrer_user_id = auth.uid();
  ASSERT v_visible_commissions = 1, 'FAIL: caso 15a — el referidor sin negocio no ve su propia recompensa';

  RAISE NOTICE 'OK: caso 15a — el referidor SIN negocio ve el progreso y la recompensa de su referido, sin wa_businesses';
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c2','role','authenticated')::text, true);

DO $$
DECLARE
  v_own_periods INTEGER;
BEGIN
  SELECT count(*) INTO v_own_periods FROM public.referral_paid_periods WHERE referred_user_id = auth.uid();
  ASSERT v_own_periods = 3, 'FAIL: caso 15b — el referido no ve su propio progreso completo';
  RAISE NOTICE 'OK: caso 15b — el referido consulta su propio progreso';
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c5','role','authenticated')::text, true);

DO $$
DECLARE
  v_visible_codes INTEGER;
  v_visible_attributions INTEGER;
  v_visible_commissions INTEGER;
  v_visible_periods INTEGER;
BEGIN
  SELECT count(*) INTO v_visible_codes FROM public.referral_codes;
  SELECT count(*) INTO v_visible_attributions FROM public.referral_attributions;
  SELECT count(*) INTO v_visible_commissions FROM public.referral_commissions;
  SELECT count(*) INTO v_visible_periods FROM public.referral_paid_periods;

  ASSERT v_visible_codes = 0, 'FAIL: caso 15c — el tercero ajeno ve códigos ajenos';
  ASSERT v_visible_attributions = 0, 'FAIL: caso 15c — el tercero ajeno ve atribuciones ajenas';
  ASSERT v_visible_commissions = 0, 'FAIL: caso 15c — el tercero ajeno ve comisiones ajenas';
  ASSERT v_visible_periods = 0, 'FAIL: caso 15c — el tercero ajeno ve períodos ajenos';

  RAISE NOTICE 'OK: caso 15c — RLS user-centric aísla correctamente: un tercero ajeno no ve nada';
END $$;

RESET ROLE;

-- Revertir todo — este script nunca deja datos de prueba en la base.
ROLLBACK;
