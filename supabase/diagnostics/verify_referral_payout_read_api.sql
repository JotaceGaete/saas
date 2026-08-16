-- Verificación MANUAL de 20260816100000_referral_payout_read_api.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción.
-- Solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluida
--                                   Fase 5D.1)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_referral_payout_read_api.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- required_paid_months=2, reward_amount=5.00, reward_currency='USD' (base)
-- vienen del seed real de referral_program_terms. Todo el script corre en
-- una sola transacción con ROLLBACK final -- nada de esto queda persistido.

BEGIN;

-- Secreto de Vault de PRUEBA (exclusivo de esta transacción, revertido
-- por el ROLLBACK final) -- necesario desde Fase C2/C3: tanto
-- wa_set_my_referral_payout_method() como wa_request_referral_payout()
-- consultan wa_referral_payout_method_encryption_key(). Nunca el valor
-- real de producción (mismo patrón que el resto de diagnósticos).
SELECT vault.create_secret('diagnostic-only-test-key-never-used-in-production', 'referral_payout_method_encryption_key');

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: usuarios + helpers.
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'read-d1@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e1', 'read-e1@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'read-e2@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e3', 'read-e3@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e4', 'read-e4@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d2', 'read-d2@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e5', 'read-e5@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ad', 'read-admin@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated');

CREATE OR REPLACE FUNCTION pg_temp.setup_attribution(p_referrer UUID, p_referred UUID, p_code TEXT)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_code_id UUID;
  v_code    TEXT;
  v_attribution_id UUID;
BEGIN
  INSERT INTO public.referral_codes (user_id, code, display_name)
  VALUES (p_referrer, p_code, 'Referidor de Test')
  ON CONFLICT (user_id) DO UPDATE SET code = public.referral_codes.code
  RETURNING id, code INTO v_code_id, v_code;

  INSERT INTO public.referral_attributions (referred_user_id, referrer_user_id, referral_code_id, code_snapshot, status)
  VALUES (p_referred, p_referrer, v_code_id, v_code, 'qualified')
  RETURNING id INTO v_attribution_id;

  RETURN v_attribution_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.get_approved_commission(p_referred UUID, p_ref_prefix TEXT)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_commission_id UUID;
BEGIN
  PERFORM public.wa_register_referral_paid_period(p_referred, p_ref_prefix || '-ene', '2026-01-15T00:00:00Z');
  PERFORM public.wa_register_referral_paid_period(p_referred, p_ref_prefix || '-feb', '2026-02-15T00:00:00Z');

  SELECT rc.id INTO v_commission_id
  FROM public.referral_commissions rc
  JOIN public.referral_attributions ra ON ra.id = rc.referral_attribution_id
  WHERE ra.referred_user_id = p_referred;

  UPDATE public.referral_commissions SET hold_until = now() - INTERVAL '1 day' WHERE id = v_commission_id;
  PERFORM public.wa_mature_referral_commissions();

  RETURN v_commission_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.valid_snapshot(p_holder TEXT DEFAULT 'Juan Perez')
RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'method', 'bank_transfer',
    'country', 'CL',
    'holder_name', p_holder,
    'holder_tax_id', '11.111.111-1',
    'bank_name', 'Banco Estado',
    'account_type', 'checking',
    'account_number', '1234567890',
    'email', 'contacto@example.test'
  );
$$;

-- wa_mask_account_number() es un helper interno (REVOKE ALL FROM PUBLIC,
-- anon, authenticated -- a propósito, ver migración) -- no se puede llamar
-- directamente bajo SET LOCAL ROLE authenticated dentro de los bloques de
-- test. Se calcula UNA vez acá, como postgres (dueño de la función), y se
-- guarda en un GUC de sesión para comparar más abajo sin volver a invocarla.
DO $$
BEGIN
  PERFORM set_config('test.expected_masked_account', public.wa_mask_account_number('1234567890'), true);
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Datos: d1 termina con 4 retiros -- P1 paid (USD), P2 rejected (USD),
-- P3 requested (USD), P4 requested (CLP) -- cada uno creado con su propia
-- llamada a wa_request_referral_payout() para que cada payout contenga
-- exactamente 1 comisión. d2 tiene 1 retiro propio, exclusivamente para
-- probar aislamiento entre afiliados.
-- ══════════════════════════════════════════════════════════════════════════

-- P1 (USD) — quedará paid.
DO $$
BEGIN
  PERFORM pg_temp.setup_attribution('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', 'read-code-d1');
  PERFORM pg_temp.get_approved_commission('00000000-0000-0000-0000-0000000000e1', 'r-e1');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE v_result JSONB;
BEGIN
  -- Post-C3: el snapshot se construye server-side desde un método
  -- guardado (Fase C2) -- se configura UNA vez para d1 acá; persiste
  -- para P2/P3/P4 (misma transacción, mismo usuario).
  PERFORM public.wa_set_my_referral_payout_method(
    'CL', 'P1 Holder', '11.111.111-1', 'Banco Estado', 'checking', '1234567890', NULL
  );
  SELECT public.wa_request_referral_payout() INTO v_result;
  ASSERT (v_result->'payouts'->0->>'created')::boolean = true, 'FAIL setup P1 — debía crearse';
  PERFORM set_config('test.p1_id', v_result->'payouts'->0->>'payoutId', true);
END $$;

RESET ROLE;

-- P2 (USD) — quedará rejected.
DO $$
BEGIN
  PERFORM pg_temp.setup_attribution('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e2', 'read-code-d1');
  PERFORM pg_temp.get_approved_commission('00000000-0000-0000-0000-0000000000e2', 'r-e2');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE v_result JSONB;
BEGIN
  -- d1 ya tiene un método guardado desde P1 (misma transacción).
  SELECT public.wa_request_referral_payout() INTO v_result;
  ASSERT (v_result->'payouts'->0->>'created')::boolean = true, 'FAIL setup P2 — debía crearse';
  PERFORM set_config('test.p2_id', v_result->'payouts'->0->>'payoutId', true);
END $$;

RESET ROLE;

-- P3 (USD) — se queda requested.
DO $$
BEGIN
  PERFORM pg_temp.setup_attribution('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e3', 'read-code-d1');
  PERFORM pg_temp.get_approved_commission('00000000-0000-0000-0000-0000000000e3', 'r-e3');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE v_result JSONB;
BEGIN
  -- d1 ya tiene un método guardado desde P1 (misma transacción).
  SELECT public.wa_request_referral_payout() INTO v_result;
  ASSERT (v_result->'payouts'->0->>'created')::boolean = true, 'FAIL setup P3 — debía crearse';
  PERFORM set_config('test.p3_id', v_result->'payouts'->0->>'payoutId', true);
END $$;

RESET ROLE;

-- P4 (CLP) — se queda requested. referral_program_terms.reward_currency se
-- flipea temporalmente a CLP (columna mutable por diseño desde 5A.1 --
-- exactamente el caso real que justifica pendingPayoutsByCurrency) y se
-- restaura a USD inmediatamente después para no afectar nada más del script.
DO $$
BEGIN
  UPDATE public.referral_program_terms SET reward_currency = 'CLP';
  PERFORM pg_temp.setup_attribution('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e4', 'read-code-d1');
  PERFORM pg_temp.get_approved_commission('00000000-0000-0000-0000-0000000000e4', 'r-e4');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE v_result JSONB;
BEGIN
  -- d1 ya tiene un método guardado desde P1 (misma transacción).
  SELECT public.wa_request_referral_payout() INTO v_result;
  ASSERT (v_result->'payouts'->0->>'created')::boolean = true, 'FAIL setup P4 — debía crearse';
  ASSERT (v_result->'payouts'->0->>'currency') = 'CLP', 'FAIL setup P4 — moneda esperada CLP';
  PERFORM set_config('test.p4_id', v_result->'payouts'->0->>'payoutId', true);
END $$;

RESET ROLE;

-- 35) Las RPCs que reemplazan el acceso directo son SECURITY DEFINER,
-- tienen search_path fijo y conservan los grants mínimos esperados.
DO $$
DECLARE
  v_signature REGPROCEDURE;
  v_signatures REGPROCEDURE[] := ARRAY[
    'public.wa_get_my_referral_stats()'::regprocedure,
    'public.wa_request_referral_payout(jsonb)'::regprocedure,
    'public.wa_list_my_referral_payouts(integer,integer)'::regprocedure,
    'public.wa_admin_list_referral_payouts(text,integer,integer)'::regprocedure,
    'public.wa_admin_get_referral_payout_detail(uuid)'::regprocedure,
    'public.wa_admin_mark_referral_payout_paid(uuid,text)'::regprocedure,
    'public.wa_admin_reject_referral_payout(uuid,text)'::regprocedure
  ];
  v_prosecdef BOOLEAN;
  v_proconfig TEXT[];
  v_owner NAME;
BEGIN
  FOREACH v_signature IN ARRAY v_signatures LOOP
    SELECT p.prosecdef, p.proconfig, r.rolname
      INTO v_prosecdef, v_proconfig, v_owner
    FROM pg_proc p
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE p.oid = v_signature::oid;

    ASSERT v_prosecdef, 'FAIL 35 — RPC debe ser SECURITY DEFINER: ' || v_signature::TEXT;
    -- Post-C3 (20260818120000): wa_request_referral_payout() necesita
    -- 'extensions' en el search_path para invocar pgp_sym_decrypt() al
    -- construir el snapshot desde el método guardado (Fase C2) -- ya
    -- verificado explícitamente en verify_referral_payout_method_cutover.sql
    -- (caso 22). Sigue siendo un search_path FIJO y explícito (nunca
    -- mutable ni vacío) -- el resto de las RPCs de esta lista conserva la
    -- exigencia estricta original de 'search_path=public' únicamente.
    IF v_signature = 'public.wa_request_referral_payout(jsonb)'::regprocedure THEN
      ASSERT v_proconfig @> ARRAY['search_path=public, extensions'], 'FAIL 35 — search_path inseguro: ' || v_signature::TEXT;
    ELSE
      ASSERT v_proconfig @> ARRAY['search_path=public'], 'FAIL 35 — search_path inseguro: ' || v_signature::TEXT;
    END IF;
    ASSERT v_owner NOT IN ('anon', 'authenticated'), 'FAIL 35 — owner cliente inseguro: ' || v_signature::TEXT;
    ASSERT has_function_privilege('authenticated', v_signature, 'EXECUTE'), 'FAIL 35 — authenticated necesita EXECUTE: ' || v_signature::TEXT;
    ASSERT NOT has_function_privilege('anon', v_signature, 'EXECUTE'), 'FAIL 35 — anon no debe tener EXECUTE: ' || v_signature::TEXT;
  END LOOP;

  RAISE NOTICE 'OK: test 35 — SECURITY DEFINER, search_path, owners y grants de EXECUTE correctos';
END $$;

DO $$
BEGIN
  UPDATE public.referral_program_terms SET reward_currency = 'USD';
END $$;

-- d2: 1 retiro propio, para aislamiento.
DO $$
BEGIN
  PERFORM pg_temp.setup_attribution('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e5', 'read-code-d2');
  PERFORM pg_temp.get_approved_commission('00000000-0000-0000-0000-0000000000e5', 'r-e5');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d2','role','authenticated')::text, true);

DO $$
DECLARE v_result JSONB;
BEGIN
  -- d2 necesita su propio método guardado (usuario distinto de d1).
  PERFORM public.wa_set_my_referral_payout_method(
    'CL', 'D2 Holder', '22.222.222-2', 'Banco Santander', 'savings', '9988776655', NULL
  );
  SELECT public.wa_request_referral_payout() INTO v_result;
  ASSERT (v_result->'payouts'->0->>'created')::boolean = true, 'FAIL setup Pd2 — debía crearse';
  PERFORM set_config('test.pd2_id', v_result->'payouts'->0->>'payoutId', true);
END $$;

RESET ROLE;

-- Admin resuelve P1 (paid) y P2 (rejected). P3 y P4 quedan requested.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000ad','role','authenticated','app_metadata', json_build_object('role','admin'))::text, true);

DO $$
DECLARE
  v_result JSONB;
  v_p1_id UUID := current_setting('test.p1_id', true)::uuid;
  v_p2_id UUID := current_setting('test.p2_id', true)::uuid;
BEGIN
  SELECT public.wa_admin_mark_referral_payout_paid(v_p1_id, 'TXN-P1') INTO v_result;
  ASSERT (v_result->>'ok')::boolean = true, 'FAIL setup — P1 debía pagarse: %', v_result;

  SELECT public.wa_admin_reject_referral_payout(v_p2_id, 'motivo de prueba') INTO v_result;
  ASSERT (v_result->>'ok')::boolean = true, 'FAIL setup — P2 debía rechazarse: %', v_result;
END $$;

RESET ROLE;

-- Escalonar requested_at para que el orden DESC sea determinista (dentro de
-- una misma transacción, now() es constante -- todas las filas creadas
-- arriba comparten el mismo timestamp de no forzarlo).
DO $$
DECLARE
  v_p1_id UUID := current_setting('test.p1_id', true)::uuid;
  v_p2_id UUID := current_setting('test.p2_id', true)::uuid;
  v_p3_id UUID := current_setting('test.p3_id', true)::uuid;
  v_p4_id UUID := current_setting('test.p4_id', true)::uuid;
BEGIN
  UPDATE public.referral_payout_requests SET requested_at = now() - INTERVAL '4 hours' WHERE id = v_p1_id;
  UPDATE public.referral_payout_requests SET requested_at = now() - INTERVAL '3 hours' WHERE id = v_p2_id;
  UPDATE public.referral_payout_requests SET requested_at = now() - INTERVAL '2 hours' WHERE id = v_p3_id;
  UPDATE public.referral_payout_requests SET requested_at = now() - INTERVAL '1 hours' WHERE id = v_p4_id;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SELF-SERVICE: wa_list_my_referral_payouts (tests 1-6) +
-- wa_get_my_referral_stats().pendingPayoutsByCurrency (tests 7-10 + multi-
-- moneda explícito).
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE
  v_list JSONB;
  v_p1_id UUID := current_setting('test.p1_id', true)::uuid;
  v_p2_id UUID := current_setting('test.p2_id', true)::uuid;
  v_p3_id UUID := current_setting('test.p3_id', true)::uuid;
  v_p4_id UUID := current_setting('test.p4_id', true)::uuid;
  v_pd2_id UUID := current_setting('test.pd2_id', true)::uuid;
  v_ids TEXT[];
BEGIN
  SELECT public.wa_list_my_referral_payouts(20, 0) INTO v_list;

  -- 1) d1 ve solo sus propios payouts. 2) el de d2 nunca aparece.
  ASSERT jsonb_array_length(v_list) = 4, 'FAIL 1 — d1 debía ver exactamente 4 payouts propios';
  SELECT array_agg(elem->>'payoutId') INTO v_ids FROM jsonb_array_elements(v_list) elem;
  ASSERT v_p1_id::text = ANY(v_ids), 'FAIL 1 — P1 debía estar';
  ASSERT v_p2_id::text = ANY(v_ids), 'FAIL 1 — P2 debía estar';
  ASSERT v_p3_id::text = ANY(v_ids), 'FAIL 1 — P3 debía estar';
  ASSERT v_p4_id::text = ANY(v_ids), 'FAIL 1 — P4 debía estar';
  ASSERT NOT (v_pd2_id::text = ANY(v_ids)), 'FAIL 2 — el payout de d2 NUNCA debía aparecer en la lista de d1';

  -- 3) orden DESC correcto: P4 (más nuevo) primero, P1 (más viejo) último.
  ASSERT v_list->0->>'payoutId' = v_p4_id::text, 'FAIL 3 — el primero debía ser P4 (más reciente)';
  ASSERT v_list->3->>'payoutId' = v_p1_id::text, 'FAIL 3 — el último debía ser P1 (más viejo)';

  -- 5) estados representados correctamente.
  ASSERT (SELECT elem->>'status' FROM jsonb_array_elements(v_list) elem WHERE elem->>'payoutId' = v_p1_id::text) = 'paid',
    'FAIL 5 — P1 debía figurar como paid';
  ASSERT (SELECT elem->>'status' FROM jsonb_array_elements(v_list) elem WHERE elem->>'payoutId' = v_p2_id::text) = 'rejected',
    'FAIL 5 — P2 debía figurar como rejected';
  ASSERT (SELECT elem->>'status' FROM jsonb_array_elements(v_list) elem WHERE elem->>'payoutId' = v_p3_id::text) = 'requested',
    'FAIL 5 — P3 debía figurar como requested';

  -- 6) nunca datos bancarios completos: ni holderTaxId, ni email del
  -- snapshot, ni accountNumber sin enmascarar -- solo payoutMethod +
  -- maskedAccountNumber (ver justificación en la migración).
  ASSERT NOT (v_list->0 ? 'holderTaxId'), 'FAIL 6 — holderTaxId NUNCA debía estar en el historial propio';
  ASSERT NOT (v_list->0 ? 'accountNumber'), 'FAIL 6 — accountNumber (sin enmascarar) NUNCA debía estar';
  ASSERT NOT (v_list->0 ? 'payoutMethodSnapshot'), 'FAIL 6 — el snapshot completo NUNCA debía estar en el historial';
  ASSERT (v_list->0->>'maskedAccountNumber') = current_setting('test.expected_masked_account', true),
    'FAIL 6 — maskedAccountNumber esperado ' || current_setting('test.expected_masked_account', true) || ', fue: ' || (v_list->0->>'maskedAccountNumber');
  ASSERT (v_list->0->>'maskedAccountNumber') <> '1234567890', 'FAIL 6 — maskedAccountNumber NUNCA debe ser el número real sin enmascarar';
  ASSERT right(v_list->0->>'maskedAccountNumber', 4) = '7890', 'FAIL 6 — los últimos 4 dígitos deben seguir visibles';

  RAISE NOTICE 'OK: tests 1,2,3,5,6 — wa_list_my_referral_payouts: aislamiento, orden DESC, estados y masking correctos';
END $$;

-- 4) limit/offset correcto.
DO $$
DECLARE
  v_list JSONB;
  v_p3_id UUID := current_setting('test.p3_id', true)::uuid;
  v_p2_id UUID := current_setting('test.p2_id', true)::uuid;
BEGIN
  SELECT public.wa_list_my_referral_payouts(2, 1) INTO v_list;
  ASSERT jsonb_array_length(v_list) = 2, 'FAIL 4 — limit=2 debía devolver exactamente 2 filas';
  ASSERT v_list->0->>'payoutId' = v_p3_id::text, 'FAIL 4 — offset=1 debía saltar P4 y arrancar en P3';
  ASSERT v_list->1->>'payoutId' = v_p2_id::text, 'FAIL 4 — segunda fila esperada P2';

  RAISE NOTICE 'OK: test 4 — limit/offset correctos';
END $$;

-- 7,8,9: pendingPayoutsByCurrency correcto (excluye paid y rejected) +
-- multi-moneda explícito (10a). 10: availableAmount conserva semántica 5C.
DO $$
DECLARE
  v_stats JSONB;
  v_by_currency JSONB;
BEGIN
  SELECT public.wa_get_my_referral_stats() INTO v_stats;
  v_by_currency := v_stats->'pendingPayoutsByCurrency';

  -- 7) correcto para las monedas que SÍ deben aparecer.
  -- 8) P1 (paid, USD) no suma. 9) P2 (rejected, USD) no suma.
  -- Solo P3 (requested, USD, 5.00) y P4 (requested, CLP, 5.00) cuentan.
  ASSERT jsonb_array_length(v_by_currency) = 2, 'FAIL 7/8/9 — debían quedar exactamente 2 grupos de moneda (USD de P3, CLP de P4)';

  -- Multi-moneda EXPLÍCITO: jamás se combinan en un solo número. Orden
  -- determinista por currency ASC -- 'CLP' < 'USD'.
  ASSERT v_by_currency->0->>'currency' = 'CLP', 'FAIL multi-moneda — primer grupo esperado CLP (orden alfabético)';
  ASSERT (v_by_currency->0->>'amount')::numeric = 5.00, 'FAIL multi-moneda — monto CLP esperado 5.00 (solo P4)';
  ASSERT v_by_currency->1->>'currency' = 'USD', 'FAIL multi-moneda — segundo grupo esperado USD';
  ASSERT (v_by_currency->1->>'amount')::numeric = 5.00, 'FAIL multi-moneda — monto USD esperado 5.00 (solo P3 -- P1 paid y P2 rejected NO suman)';

  -- Nunca una suma cruzada tipo 10.00 (5+5 combinados) ni ningún objeto que
  -- mezcle ambas monedas en un solo campo numérico.
  ASSERT NOT (v_stats ? 'pendingPayoutAmount'), 'FAIL multi-moneda — NO debe existir un campo pendingPayoutAmount (número único) -- fue reemplazado deliberadamente por pendingPayoutsByCurrency';

  -- 10) availableAmount conserva la semántica de 5C: e1 (paid) no cuenta
  -- (no está approved); e3/e4 siguen reservadas en P3/P4 (requested) y
  -- tampoco cuentan; e2 SÍ cuenta -- wa_admin_reject_referral_payout()
  -- liberó su vínculo (released_at) al rechazar P2, y la comisión de e2
  -- nunca dejó de estar 'approved' -- vuelve a estar disponible, tal como
  -- 5C diseñó explícitamente el flujo de rechazo -> liberación -> reuso.
  ASSERT (v_stats->>'availableAmount')::numeric = 5.00,
    'FAIL 10 — availableAmount esperado 5.00 (solo la comisión de e2, liberada por el rechazo de P2); fue: ' || (v_stats->>'availableAmount');

  RAISE NOTICE 'OK: tests 7,8,9,10 + multi-moneda explícito — pendingPayoutsByCurrency nunca combina monedas, availableAmount conserva semántica de 5C';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- ADMIN LIST: wa_admin_list_referral_payouts (tests 11-21).
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000ad','role','authenticated','app_metadata', json_build_object('role','admin'))::text, true);

DO $$
DECLARE
  v_result JSONB;
  v_p1_id UUID := current_setting('test.p1_id', true)::uuid;
  v_pd2_id UUID := current_setting('test.pd2_id', true)::uuid;
BEGIN
  -- 11) admin puede listar.
  SELECT public.wa_admin_list_referral_payouts(NULL, 50, 0) INTO v_result;
  ASSERT (v_result->>'ok')::boolean = true, 'FAIL 11 — admin debía poder listar';

  -- 17) totalCount correcto: 4 de d1 + 1 de d2 = 5.
  ASSERT (v_result->>'totalCount')::int = 5, 'FAIL 17 — totalCount esperado 5, fue ' || (v_result->>'totalCount');
  ASSERT jsonb_array_length(v_result->'payouts') = 5, 'FAIL 17 — payouts devueltos esperados 5';

  -- 18) email/identidad del afiliado correcto (resuelto vía JOIN a auth.users).
  ASSERT (
    SELECT elem->>'referrerEmail' FROM jsonb_array_elements(v_result->'payouts') elem WHERE elem->>'payoutId' = v_p1_id::text
  ) = 'read-d1@example.test', 'FAIL 18 — referrerEmail de P1 esperado read-d1@example.test';
  ASSERT (
    SELECT elem->>'referrerEmail' FROM jsonb_array_elements(v_result->'payouts') elem WHERE elem->>'payoutId' = v_pd2_id::text
  ) = 'read-d2@example.test', 'FAIL 18 — referrerEmail de Pd2 esperado read-d2@example.test';

  -- 19) account_number enmascarado. 20) holder_tax_id ausente.
  -- 21) snapshot completo ausente.
  ASSERT (
    SELECT elem->>'maskedAccountNumber' FROM jsonb_array_elements(v_result->'payouts') elem WHERE elem->>'payoutId' = v_p1_id::text
  ) = current_setting('test.expected_masked_account', true), 'FAIL 19 — maskedAccountNumber no coincide con el masking esperado';
  ASSERT NOT (v_result->'payouts'->0 ? 'holderTaxId'), 'FAIL 20 — holderTaxId NUNCA debía estar en el listado admin';
  ASSERT NOT (v_result->'payouts'->0 ? 'accountNumber'), 'FAIL 21 — accountNumber (sin enmascarar) NUNCA debía estar';
  ASSERT NOT (v_result->'payouts'->0 ? 'payoutMethodSnapshot'), 'FAIL 21 — el snapshot completo NUNCA debía estar en el listado';

  RAISE NOTICE 'OK: tests 11,17,18,19,20,21 — listado admin correcto, identidad resuelta, masking server-side confirmado';
END $$;

-- 13,14,15: filtros por estado.
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT public.wa_admin_list_referral_payouts('requested', 50, 0) INTO v_result;
  ASSERT (v_result->>'totalCount')::int = 3, 'FAIL 13 — filtro requested esperaba 3 (P3 USD + P4 CLP de d1 + Pd2), fue ' || (v_result->>'totalCount');
  ASSERT (SELECT bool_and(elem->>'status' = 'requested') FROM jsonb_array_elements(v_result->'payouts') elem),
    'FAIL 13 — todas las filas devueltas debían tener status requested';

  SELECT public.wa_admin_list_referral_payouts('paid', 50, 0) INTO v_result;
  ASSERT (v_result->>'totalCount')::int = 1, 'FAIL 14 — filtro paid esperaba 1 (P1)';
  ASSERT v_result->'payouts'->0->>'status' = 'paid', 'FAIL 14 — status devuelto debía ser paid';

  SELECT public.wa_admin_list_referral_payouts('rejected', 50, 0) INTO v_result;
  ASSERT (v_result->>'totalCount')::int = 1, 'FAIL 15 — filtro rejected esperaba 1 (P2)';
  ASSERT v_result->'payouts'->0->>'status' = 'rejected', 'FAIL 15 — status devuelto debía ser rejected';

  RAISE NOTICE 'OK: tests 13,14,15 — filtros por estado correctos';
END $$;

-- 16) filtro inválido -> respuesta controlada.
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT public.wa_admin_list_referral_payouts('en_camion', 50, 0) INTO v_result;
  ASSERT (v_result->>'ok')::boolean = false, 'FAIL 16 — status inválido debía responder ok:false';
  ASSERT v_result->>'error' = 'invalid_status', 'FAIL 16 — error esperado invalid_status';

  RAISE NOTICE 'OK: test 16 — filtro inválido controlado, sin excepción cruda';
END $$;

RESET ROLE;

-- 12) no-admin -> forbidden.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT public.wa_admin_list_referral_payouts(NULL, 50, 0) INTO v_result;
  ASSERT (v_result->>'ok')::boolean = false, 'FAIL 12 — no-admin debía recibir ok:false';
  ASSERT v_result->>'error' = 'forbidden', 'FAIL 12 — error esperado forbidden';

  RAISE NOTICE 'OK: test 12 — no-admin recibe forbidden en el listado admin';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- ADMIN DETAIL: wa_admin_get_referral_payout_detail (tests 22-29).
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000ad','role','authenticated','app_metadata', json_build_object('role','admin'))::text, true);

DO $$
DECLARE
  v_result JSONB;
  v_p1_id UUID := current_setting('test.p1_id', true)::uuid;
  v_p2_id UUID := current_setting('test.p2_id', true)::uuid;
BEGIN
  -- 22) admin obtiene detalle.
  SELECT public.wa_admin_get_referral_payout_detail(v_p1_id) INTO v_result;
  ASSERT (v_result->>'ok')::boolean = true, 'FAIL 22 — admin debía obtener el detalle';

  -- 25) snapshot completo disponible ÚNICAMENTE acá. Post-C3: el
  -- snapshot se construye desde referral_payout_methods (Fase C2), que
  -- normaliza el RUT al guardarlo (quita puntos) -- '11.111.111-1' ->
  -- '11111111-1', mismo valor real, mismo comportamiento ya verificado
  -- en verify_referral_payout_method_cutover.sql (caso 4).
  ASSERT (v_result->'payout' ? 'payoutMethodSnapshot'), 'FAIL 25 — el detalle SÍ debía traer el snapshot completo';
  ASSERT (v_result->'payout'->'payoutMethodSnapshot'->>'holder_tax_id') = '11111111-1',
    'FAIL 25 — holder_tax_id completo (normalizado) esperado en el snapshot del detalle';
  ASSERT (v_result->'payout'->'payoutMethodSnapshot'->>'account_number') = '1234567890',
    'FAIL 25 — account_number SIN enmascarar esperado en el snapshot del detalle (el admin lo necesita para transferir)';

  -- 26,27) comisiones asociadas correctas + reward_amount_snapshot.
  ASSERT jsonb_array_length(v_result->'commissions') = 1, 'FAIL 26 — P1 debía tener exactamente 1 comisión vinculada';
  ASSERT (v_result->'commissions'->0->>'rewardAmountSnapshot')::numeric = 5.00, 'FAIL 27 — rewardAmountSnapshot esperado 5.00';
  ASSERT (v_result->'commissions'->0->>'active')::boolean = true, 'FAIL 26 — la comisión de P1 (paid) sigue activa (nunca se libera al pagar)';

  RAISE NOTICE 'OK: tests 22,25,26,27 — detalle admin trae snapshot completo y comisiones correctas';

  -- 28) released_at/released_reason representados correctamente -- P2 fue
  -- rechazado, su comisión debe figurar liberada.
  SELECT public.wa_admin_get_referral_payout_detail(v_p2_id) INTO v_result;
  ASSERT (v_result->'commissions'->0->>'active')::boolean = false, 'FAIL 28 — la comisión de P2 (rejected) debía figurar liberada (active=false)';
  ASSERT v_result->'commissions'->0->>'releasedReason' = 'rejected', 'FAIL 28 — releasedReason esperado rejected';
  ASSERT (v_result->'commissions'->0->>'releasedAt') IS NOT NULL, 'FAIL 28 — releasedAt debía estar seteado';

  RAISE NOTICE 'OK: test 28 — released_at/released_reason representados correctamente';
END $$;

-- 24) payout inexistente -> respuesta controlada.
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT public.wa_admin_get_referral_payout_detail('00000000-0000-0000-0000-00000000dead') INTO v_result;
  ASSERT (v_result->>'ok')::boolean = false, 'FAIL 24 — payout inexistente debía responder ok:false';
  ASSERT v_result->>'error' = 'payout_not_found', 'FAIL 24 — error esperado payout_not_found';

  RAISE NOTICE 'OK: test 24 — payout inexistente controlado, sin excepción cruda';
END $$;

RESET ROLE;

-- 23) no-admin -> forbidden.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE
  v_result JSONB;
  v_p1_id UUID := current_setting('test.p1_id', true)::uuid;
BEGIN
  SELECT public.wa_admin_get_referral_payout_detail(v_p1_id) INTO v_result;
  ASSERT (v_result->>'ok')::boolean = false, 'FAIL 23 — no-admin debía recibir ok:false';
  ASSERT v_result->>'error' = 'forbidden', 'FAIL 23 — error esperado forbidden';

  RAISE NOTICE 'OK: test 23 — no-admin recibe forbidden en el detalle admin';
END $$;

RESET ROLE;

-- 29) la lectura no modifica ningún status ni monto -- comparar snapshot
-- antes/después de TODAS las llamadas de lectura ya ejecutadas arriba.
DO $$
DECLARE
  v_commissions_count INTEGER;
  v_payouts_count INTEGER;
  v_paid_count INTEGER;
  v_rejected_count INTEGER;
  v_requested_count INTEGER;
BEGIN
  SELECT count(*) INTO v_commissions_count FROM public.referral_commissions WHERE status = 'paid';
  ASSERT v_commissions_count = 1, 'FAIL 29 — solo la comisión de P1 debía seguir paid tras todas las lecturas (ninguna RPC de este archivo escribe)';

  SELECT count(*) FILTER (WHERE status = 'paid'), count(*) FILTER (WHERE status = 'rejected'), count(*) FILTER (WHERE status = 'requested')
  INTO v_paid_count, v_rejected_count, v_requested_count
  FROM public.referral_payout_requests;
  ASSERT v_paid_count = 1 AND v_rejected_count = 1 AND v_requested_count = 3,
    'FAIL 29 — estados de referral_payout_requests debían seguir exactamente como quedaron en el setup (1 paid, 1 rejected, 3 requested: P3+P4+Pd2)';

  RAISE NOTICE 'OK: test 29 — ninguna RPC de lectura modificó status ni montos';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- PERMISOS (tests 30-34).
-- ══════════════════════════════════════════════════════════════════════════

-- 30,31) anon no puede leer tablas ni ejecutar ninguna de las 3 RPCs.
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.referral_payout_requests LIMIT 1;
    RAISE EXCEPTION 'FAIL 30-table-a — anon NO debía poder leer referral_payout_requests';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: test 30-table-a — anon bloqueado en referral_payout_requests';
  END;

  BEGIN
    PERFORM 1 FROM public.referral_payout_commissions LIMIT 1;
    RAISE EXCEPTION 'FAIL 30-table-b — anon NO debía poder leer referral_payout_commissions';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: test 30-table-b — anon bloqueado en referral_payout_commissions';
  END;

  BEGIN
    PERFORM public.wa_list_my_referral_payouts(20, 0);
    RAISE EXCEPTION 'FAIL 30 — anon NO debía poder ejecutar wa_list_my_referral_payouts';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: test 30 — anon bloqueado en wa_list_my_referral_payouts (insufficient_privilege)';
  END;

  BEGIN
    PERFORM public.wa_admin_list_referral_payouts(NULL, 10, 0);
    RAISE EXCEPTION 'FAIL 31 — anon NO debía poder ejecutar wa_admin_list_referral_payouts';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: test 31a — anon bloqueado en wa_admin_list_referral_payouts (insufficient_privilege)';
  END;

  BEGIN
    PERFORM public.wa_admin_get_referral_payout_detail('00000000-0000-0000-0000-00000000dead');
    RAISE EXCEPTION 'FAIL 31 — anon NO debía poder ejecutar wa_admin_get_referral_payout_detail';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: test 31b — anon bloqueado en wa_admin_get_referral_payout_detail (insufficient_privilege)';
  END;
END $$;

RESET ROLE;

-- 32) authenticated puede ejecutar self-service. 33) authenticated no-admin
-- SÍ puede invocar la RPC admin (grant), pero recibe forbidden (guarda
-- interna) -- no es un permission denied de Postgres, es un rechazo
-- controlado de negocio.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE v_list JSONB; v_result JSONB;
BEGIN
  BEGIN
    PERFORM payout_method_snapshot FROM public.referral_payout_requests LIMIT 1;
    RAISE EXCEPTION 'FAIL 32-table-a — authenticated NO debía poder leer payout_method_snapshot directamente';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: test 32-table-a — authenticated sin lectura directa de payout_method_snapshot';
  END;

  BEGIN
    PERFORM 1 FROM public.referral_payout_commissions LIMIT 1;
    RAISE EXCEPTION 'FAIL 32-table-b — authenticated NO debía poder leer referral_payout_commissions directamente';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: test 32-table-b — authenticated sin lectura directa de referral_payout_commissions';
  END;

  SELECT public.wa_list_my_referral_payouts(5, 0) INTO v_list;
  ASSERT v_list IS NOT NULL, 'FAIL 32 — authenticated debía poder ejecutar wa_list_my_referral_payouts';
  ASSERT v_list::TEXT NOT LIKE '%account_number%', 'FAIL 32 — self-service nunca debe devolver account_number';
  ASSERT v_list::TEXT NOT LIKE '%holder_tax_id%', 'FAIL 32 — self-service nunca debe devolver holder_tax_id';
  ASSERT v_list->0 ? 'maskedAccountNumber', 'FAIL 32 — self-service debe devolver maskedAccountNumber';
  RAISE NOTICE 'OK: test 32 — authenticated ejecuta self-service sin error';

  SELECT public.wa_admin_list_referral_payouts(NULL, 5, 0) INTO v_result;
  ASSERT (v_result->>'ok')::boolean = false AND v_result->>'error' = 'forbidden',
    'FAIL 33 — authenticated no-admin SÍ debe poder invocar la RPC (grant), pero recibir forbidden (guarda interna)';
  RAISE NOTICE 'OK: test 33 — authenticated no-admin invoca la RPC admin y recibe forbidden controlado (no un error de permisos de Postgres)';
END $$;

-- 34) Endurecido tras el hallazgo de la validación anterior: ya no alcanza
-- con que la escritura directa no tenga efecto (RLS) -- se verifica
-- explícitamente que anon/authenticated NO POSEEN el privilegio de tabla
-- en absoluto (INSERT/UPDATE/DELETE), sobre las 2 tablas, y que
-- authenticated tampoco conserva SELECT. Corre como postgres (dueño), sin SET ROLE -- has_table_
-- privilege() consulta metadata, no requiere ser el rol consultado.
DO $$
BEGIN
  ASSERT has_table_privilege('anon', 'public.referral_payout_requests', 'INSERT') = false, 'FAIL 34 — anon NO debía tener INSERT en referral_payout_requests';
  ASSERT has_table_privilege('anon', 'public.referral_payout_requests', 'UPDATE') = false, 'FAIL 34 — anon NO debía tener UPDATE en referral_payout_requests';
  ASSERT has_table_privilege('anon', 'public.referral_payout_requests', 'DELETE') = false, 'FAIL 34 — anon NO debía tener DELETE en referral_payout_requests';
  ASSERT has_table_privilege('anon', 'public.referral_payout_commissions', 'INSERT') = false, 'FAIL 34 — anon NO debía tener INSERT en referral_payout_commissions';
  ASSERT has_table_privilege('anon', 'public.referral_payout_commissions', 'UPDATE') = false, 'FAIL 34 — anon NO debía tener UPDATE en referral_payout_commissions';
  ASSERT has_table_privilege('anon', 'public.referral_payout_commissions', 'DELETE') = false, 'FAIL 34 — anon NO debía tener DELETE en referral_payout_commissions';

  ASSERT has_table_privilege('authenticated', 'public.referral_payout_requests', 'INSERT') = false, 'FAIL 34 — authenticated NO debía tener INSERT en referral_payout_requests';
  ASSERT has_table_privilege('authenticated', 'public.referral_payout_requests', 'UPDATE') = false, 'FAIL 34 — authenticated NO debía tener UPDATE en referral_payout_requests';
  ASSERT has_table_privilege('authenticated', 'public.referral_payout_requests', 'DELETE') = false, 'FAIL 34 — authenticated NO debía tener DELETE en referral_payout_requests';
  ASSERT has_table_privilege('authenticated', 'public.referral_payout_commissions', 'INSERT') = false, 'FAIL 34 — authenticated NO debía tener INSERT en referral_payout_commissions';
  ASSERT has_table_privilege('authenticated', 'public.referral_payout_commissions', 'UPDATE') = false, 'FAIL 34 — authenticated NO debía tener UPDATE en referral_payout_commissions';
  ASSERT has_table_privilege('authenticated', 'public.referral_payout_commissions', 'DELETE') = false, 'FAIL 34 — authenticated NO debía tener DELETE en referral_payout_commissions';

  ASSERT has_table_privilege('authenticated', 'public.referral_payout_requests', 'SELECT') = false, 'FAIL 34 — authenticated NO debe tener SELECT en referral_payout_requests';
  ASSERT has_table_privilege('authenticated', 'public.referral_payout_commissions', 'SELECT') = false, 'FAIL 34 — authenticated NO debe tener SELECT en referral_payout_commissions';

  -- "Conserva únicamente SELECT para authenticated": anon NO debe tener
  -- SELECT tampoco -- ninguna policy de 5C es TO anon.
  ASSERT has_table_privilege('anon', 'public.referral_payout_requests', 'SELECT') = false, 'FAIL 34 — anon NO debía tener SELECT en referral_payout_requests';
  ASSERT has_table_privilege('anon', 'public.referral_payout_commissions', 'SELECT') = false, 'FAIL 34 — anon NO debía tener SELECT en referral_payout_commissions';

  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('referral_payout_requests', 'referral_payout_commissions')
  ), 'FAIL 34 — no debe quedar ninguna policy cliente sobre las tablas de payouts';

  RAISE NOTICE 'OK: test 34 (privilegios) — anon/authenticated sin acceso directo y sin policies cliente en ambas tablas';
END $$;

-- Prueba de comportamiento real (se mantiene, ahora con el resultado
-- correcto): un intento de escritura directa como authenticated debe
-- fallar con permission denied ANTES de que RLS llegue a evaluarse -- y,
-- pase lo que pase, ninguna fila cambia.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    UPDATE public.referral_payout_requests SET status = 'paid' WHERE id = current_setting('test.p3_id', true)::uuid;
    RAISE EXCEPTION 'FAIL 34a — el UPDATE directo debía ser rechazado por el GRANT (permission denied), ya no debía llegar siquiera a evaluarse por RLS';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- esperado
  END;

  RAISE NOTICE 'OK: test 34a — UPDATE directo sobre referral_payout_requests bloqueado por GRANT';

  BEGIN
    UPDATE public.referral_payout_commissions SET released_at = now(), released_reason = 'manual' WHERE payout_id = current_setting('test.p3_id', true)::uuid;
    RAISE EXCEPTION 'FAIL 34b — el UPDATE directo debía ser rechazado por el GRANT (permission denied)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- esperado
  END;

  RAISE NOTICE 'OK: test 34b — UPDATE directo sobre referral_payout_commissions bloqueado por GRANT';
END $$;

RESET ROLE;

DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TODOS LOS CASOS DE FASE 5D.1 (capa de lectura de payouts) PASARON.';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
