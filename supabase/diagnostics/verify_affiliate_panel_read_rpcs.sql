-- Verificación MANUAL de 20260809100000_affiliate_panel_read_rpcs.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción (project-ref hxxdketymcntadffmajf)
-- — solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluidas
--                                   Parte 1, la corrección user-centric y
--                                   estas 2 RPCs de lectura)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_affiliate_panel_read_rpcs.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- Los fixtures de atribución/progreso de este script insertan directo en
-- referral_attributions y llaman wa_register_referral_paid_period() en vez
-- de re-probar wa_attribute_referral() end-to-end -- esa cobertura ya
-- existe en verify_referral_core_user_centric.sql. Este archivo se enfoca
-- exclusivamente en las 2 RPCs de lectura nuevas.
--
-- Simula usuarios autenticados vía request.jwt.claim(s) + SET LOCAL ROLE
-- (auth.uid() lee esos GUCs). Todo el script corre en una sola transacción
-- con ROLLBACK final.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: 10 usuarios reales (vía INSERT en auth.users, dispara R1 sin
-- tocarlo) + 1 cuenta SSO duplicada (11 en total).
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES
  ('00000000-0000-0000-0000-0000000000d0', 'affiliate-empty@example.test',        '{"full_name": "Referidor Vacio"}'::jsonb,     now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d1', 'affiliate-main@example.test',         '{"full_name": "Referidor Principal"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d2', 'affiliate-ref-0m@example.test',       '{"full_name": "Referido 0 Meses"}'::jsonb,    now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d3', 'affiliate-ref-1m@example.test',       '{"full_name": "Referido 1 Mes"}'::jsonb,      now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d4', 'affiliate-ref-pending@example.test',  '{"full_name": "Referido Pending"}'::jsonb,    now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d5', 'affiliate-ref-approved@example.test', '{"full_name": "Referido Approved"}'::jsonb,   now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d6', 'affiliate-ref-paid@example.test',     '{"full_name": "Referido Paid"}'::jsonb,       now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d7', 'affiliate-ref-reversed@example.test', '{"full_name": "Referido Reversed"}'::jsonb,   now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d9', 'affiliate-other-referrer@example.test','{"full_name": "Otro Referidor"}'::jsonb,     now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000da', 'affiliate-other-referred@example.test','{"full_name": "Referido De Otro"}'::jsonb,   now(), 'authenticated', 'authenticated');

-- d8: cuenta SSO con el mismo email que d1 -- solo para tener una
-- atribución 'disqualified' real que probar que invitedCount excluye
-- (mismo vector documentado en verify_referral_core_user_centric.sql).
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role, is_sso_user)
VALUES ('00000000-0000-0000-0000-0000000000d8', 'affiliate-main@example.test', '{"full_name": "Cuenta SSO Duplicada"}'::jsonb, now(), 'authenticated', 'authenticated', true);

-- d0 y d1 deben probar "funciona sin negocio".
DELETE FROM public.wa_businesses WHERE user_id IN (
  '00000000-0000-0000-0000-0000000000d0',
  '00000000-0000-0000-0000-0000000000d1'
);

DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000d0'),
    'FAIL: setup — d0 todavía tiene negocio';
  ASSERT NOT EXISTS (SELECT 1 FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000d1'),
    'FAIL: setup — d1 todavía tiene negocio';
  RAISE NOTICE 'OK: setup — 11 usuarios creados; d0 y d1 sin wa_businesses';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 1: usuario SIN negocio y SIN ningún referido — stats vacías, todo
-- en cero, código igual se crea.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d0', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d0','role','authenticated')::text, true);

DO $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT public.wa_get_my_referral_stats() INTO v_stats;

  ASSERT v_stats->>'code' IS NOT NULL, 'FAIL: caso 1 — code debería crearse automáticamente';
  ASSERT (v_stats->>'rewardAmount')::numeric = 5.00, 'FAIL: caso 1 — rewardAmount esperado 5.00';
  ASSERT v_stats->>'rewardCurrency' = 'USD', 'FAIL: caso 1 — rewardCurrency esperado USD';
  ASSERT (v_stats->>'requiredPaidMonths')::int = 2, 'FAIL: caso 1 — requiredPaidMonths esperado 2';
  ASSERT (v_stats->>'invitedCount')::int = 0, 'FAIL: caso 1 — invitedCount esperado 0';
  ASSERT (v_stats->>'oneMonthCount')::int = 0, 'FAIL: caso 1 — oneMonthCount esperado 0';
  ASSERT (v_stats->>'qualifiedCount')::int = 0, 'FAIL: caso 1 — qualifiedCount esperado 0';
  ASSERT (v_stats->>'pendingAmount')::numeric = 0, 'FAIL: caso 1 — pendingAmount esperado 0';
  ASSERT (v_stats->>'availableAmount')::numeric = 0, 'FAIL: caso 1 — availableAmount esperado 0';
  ASSERT (v_stats->>'totalEarnedAmount')::numeric = 0, 'FAIL: caso 1 — totalEarnedAmount esperado 0';

  RAISE NOTICE 'OK: caso 1 — usuario SIN negocio y sin referidos: code creado, todo en cero';
END $$;

DO $$
DECLARE
  v_list JSONB;
BEGIN
  SELECT public.wa_list_my_referrals(20, 0) INTO v_list;
  ASSERT v_list = '[]'::jsonb, 'FAIL: caso 1b — la lista debería ser un array vacío, no NULL ni error';
  RAISE NOTICE 'OK: caso 1b — wa_list_my_referrals sin referidos devuelve []';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 2 (setup): d1 obtiene su código y atribuye 7 referidos directo
-- (6 qualified + 1 disqualified), simulando distintos progresos.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE
  v_code TEXT;
BEGIN
  SELECT public.wa_get_or_create_my_referral_code() INTO v_code;
  PERFORM set_config('test.d1_code', v_code, true);
  RAISE NOTICE 'OK: caso 2 (setup) — código de d1: %', v_code;
END $$;

RESET ROLE;

DO $$
DECLARE
  v_code_id UUID;
  v_code    TEXT := current_setting('test.d1_code', true);
BEGIN
  SELECT id INTO v_code_id FROM public.referral_codes WHERE code = v_code;

  INSERT INTO public.referral_attributions (referred_user_id, referrer_user_id, referral_code_id, code_snapshot, status)
  VALUES
    ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', v_code_id, v_code, 'qualified'),
    ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1', v_code_id, v_code, 'qualified'),
    ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d1', v_code_id, v_code, 'qualified'),
    ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d1', v_code_id, v_code, 'qualified'),
    ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000d1', v_code_id, v_code, 'qualified'),
    ('00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000d1', v_code_id, v_code, 'qualified'),
    ('00000000-0000-0000-0000-0000000000d8', '00000000-0000-0000-0000-0000000000d1', v_code_id, v_code, 'disqualified');

  RAISE NOTICE 'OK: caso 2 — 7 atribuciones creadas para d1 (6 qualified + 1 disqualified)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 3: progreso real vía wa_register_referral_paid_period()
-- (la misma RPC de Affiliate Core, sin tocarla) — d2=0, d3=1, d4..d7=2.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_result JSONB;
BEGIN
  -- d2 se queda en 0 (no se registra ningún período).

  -- d3: 1 mes pagado.
  SELECT public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000d3', 'aff-d3-period-1') INTO v_result;
  ASSERT (v_result->>'registered')::boolean = true, 'FAIL: caso 3 — período de d3 no se registró';
  ASSERT (v_result->>'rewardCreated')::boolean = false, 'FAIL: caso 3 — d3 no debía generar recompensa con 1 solo período';

  -- d4, d5, d6, d7: 2 meses pagados cada uno -> cada uno genera su propia
  -- qualification_reward en status='pending' (comportamiento real de la RPC).
  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000d4', 'aff-d4-period-1');
  SELECT public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000d4', 'aff-d4-period-2') INTO v_result;
  ASSERT (v_result->>'rewardCreated')::boolean = true, 'FAIL: caso 3 — recompensa de d4 no se creó';

  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000d5', 'aff-d5-period-1');
  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000d5', 'aff-d5-period-2');
  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000d6', 'aff-d6-period-1');
  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000d6', 'aff-d6-period-2');
  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000d7', 'aff-d7-period-1');
  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000d7', 'aff-d7-period-2');

  RAISE NOTICE 'OK: caso 3 — progreso registrado: d2=0/2, d3=1/2, d4/d5/d6/d7=2/2 (cada uno con su propia qualification_reward pending)';
END $$;

-- Redistribuir manualmente los 4 estados posibles de referral_commissions
-- (pending/approved/paid/reversed) entre d4/d5/d6/d7 para poder probar la
-- suma de cada uno por separado.
UPDATE public.referral_commissions SET status = 'approved'
  WHERE referral_attribution_id = (SELECT id FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000d5');
UPDATE public.referral_commissions SET status = 'paid'
  WHERE referral_attribution_id = (SELECT id FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000d6');
UPDATE public.referral_commissions SET status = 'reversed', reversed_reason = 'manual', reversed_at = now()
  WHERE referral_attribution_id = (SELECT id FROM public.referral_attributions WHERE referred_user_id = '00000000-0000-0000-0000-0000000000d7');

DO $$
DECLARE
  v_pending INTEGER; v_approved INTEGER; v_paid INTEGER; v_reversed INTEGER;
BEGIN
  SELECT count(*) FILTER (WHERE status='pending'), count(*) FILTER (WHERE status='approved'),
         count(*) FILTER (WHERE status='paid'), count(*) FILTER (WHERE status='reversed')
  INTO v_pending, v_approved, v_paid, v_reversed
  FROM public.referral_commissions WHERE referrer_user_id = '00000000-0000-0000-0000-0000000000d1';

  ASSERT v_pending = 1 AND v_approved = 1 AND v_paid = 1 AND v_reversed = 1,
    'FAIL: setup estados — se esperaba 1 comisión de cada estado, obtuvo pending=' || v_pending || ' approved=' || v_approved || ' paid=' || v_paid || ' reversed=' || v_reversed;
  RAISE NOTICE 'OK: setup — 4 comisiones de d1, una por cada estado (pending/approved/paid/reversed), USD 5.00 cada una';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 4: wa_get_my_referral_stats() de d1 — conteos y montos exactos.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT public.wa_get_my_referral_stats() INTO v_stats;

  ASSERT (v_stats->>'invitedCount')::int = 6,
    'FAIL: caso 4 — invitedCount esperado 6 (excluye disqualified d8), obtuvo ' || (v_stats->>'invitedCount');
  ASSERT (v_stats->>'oneMonthCount')::int = 1,
    'FAIL: caso 4 — oneMonthCount esperado 1 (solo d3), obtuvo ' || (v_stats->>'oneMonthCount');
  ASSERT (v_stats->>'qualifiedCount')::int = 4,
    'FAIL: caso 4 — qualifiedCount esperado 4 (d4/d5/d6/d7), obtuvo ' || (v_stats->>'qualifiedCount');
  ASSERT (v_stats->>'pendingAmount')::numeric = 5.00,
    'FAIL: caso 4 — pendingAmount esperado 5.00 (solo d4), obtuvo ' || (v_stats->>'pendingAmount');
  ASSERT (v_stats->>'availableAmount')::numeric = 5.00,
    'FAIL: caso 4 — availableAmount esperado 5.00 (solo d5 approved), obtuvo ' || (v_stats->>'availableAmount');
  ASSERT (v_stats->>'totalEarnedAmount')::numeric = 10.00,
    'FAIL: caso 4 — totalEarnedAmount esperado 10.00 (approved d5 + paid d6; excluye pending d4 y reversed d7), obtuvo ' || (v_stats->>'totalEarnedAmount');

  RAISE NOTICE 'OK: caso 4 — stats de d1 exactas: invitedCount=6, oneMonthCount=1, qualifiedCount=4, pendingAmount=5.00, availableAmount=5.00, totalEarnedAmount=10.00';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 5: wa_list_my_referrals() — sin PII, formato de publicLabel,
-- conteo de qualified en la lista.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_list JSONB;
  v_row  JSONB;
  v_qualified_in_list INTEGER;
BEGIN
  SELECT public.wa_list_my_referrals(20, 0) INTO v_list;

  ASSERT jsonb_array_length(v_list) = 6,
    'FAIL: caso 5 — la lista debería tener 6 filas (excluye disqualified), tiene ' || jsonb_array_length(v_list);

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_list) LOOP
    ASSERT (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_row) AS key) = ARRAY['createdAt','paidMonths','publicLabel','qualified'],
      'FAIL: caso 5 — la fila expone claves distintas a las 4 esperadas: ' || v_row::text;
    ASSERT v_row->>'publicLabel' ~ '^Usuario #[0-9A-F]{4}$',
      'FAIL: caso 5 — publicLabel con formato inesperado: ' || (v_row->>'publicLabel');
    ASSERT NOT (v_row ? 'email') AND NOT (v_row ? 'user_id') AND NOT (v_row ? 'business_id') AND NOT (v_row ? 'referred_user_id'),
      'FAIL: caso 5 — la fila expone un campo sensible: ' || v_row::text;
  END LOOP;

  SELECT count(*) INTO v_qualified_in_list
  FROM jsonb_array_elements(v_list) row
  WHERE (row->>'qualified')::boolean = true;
  ASSERT v_qualified_in_list = 4, 'FAIL: caso 5 — se esperaban 4 filas qualified=true, hay ' || v_qualified_in_list;

  RAISE NOTICE 'OK: caso 5 — wa_list_my_referrals: 6 filas, sin PII, publicLabel anónimo (Usuario #XXXX), 4 marcadas qualified';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 6: paginación — corte correcto + clamp server-side de límites.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_page1 JSONB;
  v_page2 JSONB;
  v_full  JSONB;
BEGIN
  SELECT public.wa_list_my_referrals(3, 0) INTO v_page1;
  SELECT public.wa_list_my_referrals(3, 3) INTO v_page2;
  SELECT public.wa_list_my_referrals(20, 0) INTO v_full;

  ASSERT jsonb_array_length(v_page1) = 3, 'FAIL: caso 6 — página 1 debería tener 3 filas';
  ASSERT jsonb_array_length(v_page2) = 3, 'FAIL: caso 6 — página 2 debería tener 3 filas (6 total)';
  ASSERT (v_page1->0)->>'publicLabel' = (v_full->0)->>'publicLabel',
    'FAIL: caso 6 — el orden de la página 1 no coincide con la lista completa';
  ASSERT (v_page2->0)->>'publicLabel' = (v_full->3)->>'publicLabel',
    'FAIL: caso 6 — el offset no aplica el corte correcto';

  RAISE NOTICE 'OK: caso 6 — paginación (limit/offset) corta correctamente y preserva el orden';
END $$;

DO $$
DECLARE
  v_clamped JSONB;
BEGIN
  -- p_limit > 100 y p_offset negativo deben acotarse server-side, nunca fallar.
  SELECT public.wa_list_my_referrals(9999, -50) INTO v_clamped;
  ASSERT jsonb_array_length(v_clamped) = 6,
    'FAIL: caso 6b — límites fuera de rango deberían acotarse (no fallar); se esperaban las 6 filas disponibles';
  RAISE NOTICE 'OK: caso 6b — p_limit > 100 y p_offset negativo se acotan server-side sin error';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 7 (setup): un referidor completamente distinto (d9), con su propio
-- referido (da, 1 mes pagado) — para probar aislamiento.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d9', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d9','role','authenticated')::text, true);

DO $$
DECLARE
  v_code TEXT;
BEGIN
  SELECT public.wa_get_or_create_my_referral_code() INTO v_code;
  PERFORM set_config('test.d9_code', v_code, true);
END $$;

RESET ROLE;

DO $$
DECLARE
  v_code_id UUID;
  v_code    TEXT := current_setting('test.d9_code', true);
BEGIN
  SELECT id INTO v_code_id FROM public.referral_codes WHERE code = v_code;
  INSERT INTO public.referral_attributions (referred_user_id, referrer_user_id, referral_code_id, code_snapshot, status)
  VALUES ('00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-0000000000d9', v_code_id, v_code, 'qualified');
END $$;

DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000da', 'aff-da-period-1') INTO v_result;
  ASSERT (v_result->>'registered')::boolean = true, 'FAIL: setup d9 — período no se registró';
  RAISE NOTICE 'OK: setup — d9 (referidor separado) tiene 1 referido (da) con progreso 1/2';
END $$;

-- ── Caso 7: d9 solo ve sus propios datos, nunca los de d1 ──────────────────

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d9', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d9','role','authenticated')::text, true);

DO $$
DECLARE
  v_stats JSONB;
  v_list  JSONB;
BEGIN
  SELECT public.wa_get_my_referral_stats() INTO v_stats;
  ASSERT (v_stats->>'invitedCount')::int = 1,
    'FAIL: caso 7 — d9 debería ver invitedCount=1 (solo su propio referido), no los 6 de d1. obtuvo ' || (v_stats->>'invitedCount');
  ASSERT (v_stats->>'oneMonthCount')::int = 1, 'FAIL: caso 7 — d9 debería ver oneMonthCount=1';
  ASSERT (v_stats->>'qualifiedCount')::int = 0, 'FAIL: caso 7 — d9 debería ver qualifiedCount=0';
  ASSERT (v_stats->>'pendingAmount')::numeric = 0, 'FAIL: caso 7 — d9 no tiene comisiones, pendingAmount debería ser 0';

  SELECT public.wa_list_my_referrals(20, 0) INTO v_list;
  ASSERT jsonb_array_length(v_list) = 1,
    'FAIL: caso 7 — d9 debería ver exactamente 1 referido en su lista, no los 6 de d1';

  RAISE NOTICE 'OK: caso 7 — aislamiento: un referidor ajeno (d9) no ve absolutamente nada de los datos de d1';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 8: ambas RPCs son inalcanzables para anon (deben ser TO authenticated,
-- nunca anon/PUBLIC).
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE anon;

DO $$
DECLARE
  v_failed_stats BOOLEAN := false;
  v_failed_list  BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM public.wa_get_my_referral_stats();
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed_stats := true;
  END;
  ASSERT v_failed_stats, 'FAIL: caso 8 — anon pudo invocar wa_get_my_referral_stats()';

  BEGIN
    PERFORM public.wa_list_my_referrals(20, 0);
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed_list := true;
  END;
  ASSERT v_failed_list, 'FAIL: caso 8 — anon pudo invocar wa_list_my_referrals()';

  RAISE NOTICE 'OK: caso 8 — ambas RPCs de lectura son inalcanzables para anon';
END $$;

RESET ROLE;

-- Revertir todo — este script nunca deja datos de prueba en la base.
ROLLBACK;
