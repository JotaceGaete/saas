-- Verificación MANUAL de 20260815100000_referral_payout_requests.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción.
-- Solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluida
--                                   Fase 5C)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_referral_payout_requests.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- Cada escenario usa su propio referidor/referido para que la aritmética
-- sea exacta y no dependa del orden de ejecución de los demás.
-- required_paid_months=2, reward_amount=5.00, reward_currency='USD' vienen
-- del seed real de referral_program_terms. Todo el script corre en una
-- sola transacción con ROLLBACK final.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: usuarios + helpers.
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'pay-g1@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'pay-h1@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'pay-g2@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b4', 'pay-h2@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b5', 'pay-h3@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b6', 'pay-g3@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b7', 'pay-h4@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b8', 'pay-g4@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b9', 'pay-h5@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ba', 'pay-admin@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated');

-- Helper: código + atribución 'qualified' directa (bypass de RPCs de
-- escritura ya cubiertas por otros diagnósticos de Affiliate Core).
-- Idempotente en el código: un referidor tiene COMO MUCHO un código propio
-- (referral_codes_user_id_uq) -- si ya tiene uno (p.ej. este mismo
-- referidor atribuyendo a un SEGUNDO referido), se reutiliza en vez de
-- intentar crear uno nuevo.
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

-- Helper: ene+feb pagados reales -> comisión creada -> hold_until forzado
-- al pasado -> madurada a 'approved'. Devuelve el commission_id.
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

-- Snapshot bancario válido de referencia.
CREATE OR REPLACE FUNCTION pg_temp.valid_snapshot()
RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'method', 'bank_transfer',
    'country', 'CL',
    'holder_name', 'Juan Perez',
    'holder_tax_id', '11.111.111-1',
    'bank_name', 'Banco Estado',
    'account_type', 'checking',
    'account_number', '1234567890',
    'email', 'juan@example.test'
  );
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 0: validación de snapshot — CHECK constraint directo (sin pasar por
-- la RPC), casos válido e inválidos.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  ASSERT public.wa_validate_referral_payout_method_snapshot(pg_temp.valid_snapshot()) = true,
    'FAIL c0 — snapshot válido debía pasar la validación';
  ASSERT public.wa_validate_referral_payout_method_snapshot(NULL) = false,
    'FAIL c0 — NULL debía ser inválido (nunca debe devolver NULL, ver comentario de la función)';
  ASSERT public.wa_validate_referral_payout_method_snapshot('{}'::jsonb) = false,
    'FAIL c0 — objeto vacío debía ser inválido';
  ASSERT public.wa_validate_referral_payout_method_snapshot('{"method":"paypal","country":"CL","holder_name":"X","bank_name":"Y","account_type":"checking","account_number":"1"}'::jsonb) = false,
    'FAIL c0 — method distinto de bank_transfer debía ser inválido';
  ASSERT public.wa_validate_referral_payout_method_snapshot('{"method":"bank_transfer","country":"CL","holder_name":"X","bank_name":"","account_type":"checking","account_number":"1"}'::jsonb) = false,
    'FAIL c0 — bank_name vacío debía ser inválido';
  ASSERT public.wa_validate_referral_payout_method_snapshot(
    (pg_temp.valid_snapshot() - 'holder_tax_id' - 'email')
  ) = true,
    'FAIL c0 — holder_tax_id y email son opcionales, su ausencia NO debe invalidar';

  RAISE NOTICE 'OK: caso 0 — wa_validate_referral_payout_method_snapshot cubre válido/NULL/vacío/method incorrecto/campo requerido vacío/opcionales ausentes';
END $$;

-- INSERT directo (bypass de la RPC) con snapshot incompleto -> el CHECK de
-- tabla debe rechazarlo igual.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.referral_payout_requests (referrer_user_id, requested_amount, currency, payout_method_snapshot)
    VALUES ('00000000-0000-0000-0000-0000000000b1', 10.00, 'USD', '{"method":"bank_transfer","country":"CL"}'::jsonb);
    RAISE EXCEPTION 'FAIL c0-bypass — el INSERT directo con snapshot incompleto debía ser rechazado por el CHECK constraint';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'OK: caso 0-bypass — INSERT directo con snapshot incompleto rechazado por referral_payout_requests_snapshot_valid_check';
  END;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 1 (b1/b2): snapshot válido + 2 comisiones approved -> retiro
-- creado -> pago atómico exitoso (requestedAmount == payableAmount) ->
-- pago repetido del mismo payout -> no-op, nunca doble pago.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_attribution_id UUID;
  v_commission_id  UUID;
  v_result JSONB;
  v_payout_id UUID;
  v_commission RECORD;
  v_payout RECORD;
BEGIN
  v_attribution_id := pg_temp.setup_attribution(
    '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 'pay-code-b1');
  v_commission_id := pg_temp.get_approved_commission('00000000-0000-0000-0000-0000000000b2', 'c1');

  SELECT * INTO v_commission FROM public.referral_commissions WHERE id = v_commission_id;
  ASSERT v_commission.status = 'approved', 'FAIL c1 — setup: comisión debía quedar approved';

  RAISE NOTICE 'caso 1 — comisión approved: % monto %', v_commission_id, v_commission.reward_amount;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000b1','role','authenticated')::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  -- Snapshot inválido -> RPC rechaza SIN crear ningún retiro.
  SELECT public.wa_request_referral_payout('{"method":"bank_transfer","country":"CL"}'::jsonb) INTO v_result;
  ASSERT (v_result->>'requested')::boolean = false, 'FAIL c1 — snapshot inválido debía rechazar la solicitud';
  ASSERT v_result->>'reason' = 'invalid_payout_method_snapshot', 'FAIL c1 — reason esperado invalid_payout_method_snapshot';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.referral_payout_requests WHERE referrer_user_id = '00000000-0000-0000-0000-0000000000b1'
  ), 'FAIL c1 — snapshot inválido NO debía crear ningún retiro';

  -- Snapshot válido -> crea el retiro.
  SELECT public.wa_request_referral_payout(pg_temp.valid_snapshot()) INTO v_result;
  ASSERT (v_result->>'requested')::boolean = true, 'FAIL c1 — solicitud válida debía aceptarse';
  ASSERT jsonb_array_length(v_result->'payouts') = 1, 'FAIL c1 — debía crearse exactamente 1 payout (1 sola moneda)';
  ASSERT (v_result->'payouts'->0->>'created')::boolean = true, 'FAIL c1 — el payout debía crearse';
  ASSERT (v_result->'payouts'->0->>'amount')::numeric = 5.00, 'FAIL c1 — amount esperado 5.00';

  PERFORM set_config('test.c1_payout_id', v_result->'payouts'->0->>'payoutId', true);

  RAISE NOTICE 'OK: caso 1 — snapshot inválido rechazado sin crear nada; snapshot válido crea el retiro';
END $$;

RESET ROLE;

DO $$
DECLARE
  v_payout_id UUID := current_setting('test.c1_payout_id', true)::uuid;
  v_commission_id UUID;
BEGIN
  SELECT commission_id INTO v_commission_id FROM public.referral_payout_commissions WHERE payout_id = v_payout_id;

  -- La comisión ya no debe ser reclamable de nuevo (ver caso de stats más
  -- abajo también) -- acá solo confirmamos el vínculo activo.
  ASSERT EXISTS (
    SELECT 1 FROM public.referral_payout_commissions WHERE commission_id = v_commission_id AND released_at IS NULL
  ), 'FAIL c1 — la comisión debía quedar vinculada activamente al payout';

  -- Snapshot inmutable: cualquier UPDATE que lo toque debe ser rechazado,
  -- sin importar qué campo se intente cambiar.
  BEGIN
    UPDATE public.referral_payout_requests
    SET payout_method_snapshot = jsonb_build_object(
      'method','bank_transfer','country','AR','holder_name','Otro','bank_name','Otro Banco',
      'account_type','savings','account_number','999999'
    )
    WHERE id = v_payout_id;
    RAISE EXCEPTION 'FAIL c1-inmutable — el UPDATE del snapshot debía ser rechazado';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'PAYOUT_METHOD_SNAPSHOT_IS_IMMUTABLE' THEN
        RAISE EXCEPTION 'FAIL c1-inmutable — excepción inesperada: %', SQLERRM;
      END IF;
  END;
  RAISE NOTICE 'OK: caso 1-inmutable — UPDATE de payout_method_snapshot correctamente rechazado';
END $$;

-- No-admin invoca las RPCs admin -> forbidden, sin mutar nada. SET LOCAL
-- ROLE como sentencia de nivel superior (nunca dentro de un DO), mismo
-- patrón exacto que el resto de diagnósticos de Affiliate Core.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000b1','role','authenticated')::text, true);

DO $$
DECLARE
  v_payout_id UUID := current_setting('test.c1_payout_id', true)::uuid;
  v_result JSONB;
BEGIN
  SELECT public.wa_admin_mark_referral_payout_paid(v_payout_id, 'TXN-FAKE') INTO v_result;
  ASSERT v_result->>'error' = 'forbidden', 'FAIL c1-noadmin — mark_paid por no-admin debía ser forbidden';
  SELECT public.wa_admin_reject_referral_payout(v_payout_id, 'motivo') INTO v_result;
  ASSERT v_result->>'error' = 'forbidden', 'FAIL c1-noadmin — reject por no-admin debía ser forbidden';
END $$;

RESET ROLE;

DO $$
DECLARE
  v_payout_id UUID := current_setting('test.c1_payout_id', true)::uuid;
  v_payout RECORD;
BEGIN
  SELECT * INTO v_payout FROM public.referral_payout_requests WHERE id = v_payout_id;
  ASSERT v_payout.status = 'requested', 'FAIL c1-noadmin — el payout NO debía haber cambiado de estado';

  RAISE NOTICE 'OK: caso 1-noadmin — RPCs admin invocadas por no-admin devuelven forbidden sin mutar nada';
END $$;

-- Admin marca pagado: requestedAmount == payableAmount -> pago atómico exitoso.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ba', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000ba','role','authenticated','app_metadata', json_build_object('role','admin'))::text, true);

DO $$
DECLARE
  v_payout_id UUID := current_setting('test.c1_payout_id', true)::uuid;
  v_commission_id UUID;
  v_result JSONB;
BEGIN
  ASSERT public.wa_is_admin() = true, 'FAIL c1-admin — setup: wa_is_admin() debía ser true bajo este JWT simulado';

  SELECT commission_id INTO v_commission_id FROM public.referral_payout_commissions WHERE payout_id = v_payout_id;

  -- Sin external_reference -> rechazado, nada mutado.
  SELECT public.wa_admin_mark_referral_payout_paid(v_payout_id, NULL) INTO v_result;
  ASSERT v_result->>'error' = 'missing_external_reference', 'FAIL c1-admin — sin referencia debía rechazarse';

  -- Pago real.
  SELECT public.wa_admin_mark_referral_payout_paid(v_payout_id, 'TXN-0001') INTO v_result;
  ASSERT (v_result->>'ok')::boolean = true, 'FAIL c1-admin — el pago debía ser exitoso (requestedAmount == payableAmount)';
  ASSERT (v_result->>'commissionsPaid')::int = 1, 'FAIL c1-admin — debía pagar exactamente 1 comisión';
  ASSERT (v_result->>'paidAmount')::numeric = 5.00, 'FAIL c1-admin — paidAmount esperado 5.00';

  PERFORM set_config('test.c1_commission_id', v_commission_id::text, true);

  -- Pago repetido del mismo payout -> no-op idempotente, NUNCA doble pago.
  SELECT public.wa_admin_mark_referral_payout_paid(v_payout_id, 'TXN-0002-DEBERIA-IGNORARSE') INTO v_result;
  ASSERT (v_result->>'ok')::boolean = true, 'FAIL c1-admin-dup — segundo intento debía responder ok';
  ASSERT (v_result->>'alreadyPaid')::boolean = true, 'FAIL c1-admin-dup — debía reportarse alreadyPaid';

  RAISE NOTICE 'OK: caso 1-admin — pago atómico exitoso; segundo intento de pago es no-op (nunca doble pago, external_reference original preservada)';
END $$;

RESET ROLE;

DO $$
DECLARE
  v_payout_id UUID := current_setting('test.c1_payout_id', true)::uuid;
  v_commission_id UUID := current_setting('test.c1_commission_id', true)::uuid;
  v_payout RECORD;
  v_commission RECORD;
BEGIN
  SELECT * INTO v_payout FROM public.referral_payout_requests WHERE id = v_payout_id;
  ASSERT v_payout.status = 'paid', 'FAIL c1-final — payout debía quedar paid';
  ASSERT v_payout.external_reference = 'TXN-0001', 'FAIL c1-final — external_reference debía ser la del PRIMER pago (TXN-0001), no reescrita por el intento duplicado';
  ASSERT v_payout.paid_at IS NOT NULL, 'FAIL c1-final — paid_at debía setearse';

  SELECT * INTO v_commission FROM public.referral_commissions WHERE id = v_commission_id;
  ASSERT v_commission.status = 'paid', 'FAIL c1-final — comisión debía quedar paid';
  ASSERT v_commission.paid_at IS NOT NULL, 'FAIL c1-final — paid_at de la comisión debía setearse';

  RAISE NOTICE 'OK: caso 1-final — estado final consistente: 1 solo pago, referencia original preservada';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 2 (b3/b4,b5): 2 comisiones approved -> retiro -> chargeback SOBRE
-- UNA de ellas antes de pagar -> payout_amount_changed, CERO comisiones
-- pasan a paid -> admin rechaza -> la comisión SIGUE approved vuelve a
-- estar disponible; la revertida NUNCA vuelve a estar disponible.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_commission_id_1 UUID;
  v_commission_id_2 UUID;
BEGIN
  PERFORM pg_temp.setup_attribution('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b4', 'pay-code-b3a');
  PERFORM pg_temp.setup_attribution('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b5', 'pay-code-b3b');

  v_commission_id_1 := pg_temp.get_approved_commission('00000000-0000-0000-0000-0000000000b4', 'c2a');
  v_commission_id_2 := pg_temp.get_approved_commission('00000000-0000-0000-0000-0000000000b5', 'c2b');

  PERFORM set_config('test.c2_commission_1', v_commission_id_1::text, true);
  PERFORM set_config('test.c2_commission_2', v_commission_id_2::text, true);

  RAISE NOTICE 'caso 2 — 2 comisiones approved independientes: % y %', v_commission_id_1, v_commission_id_2;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000b3','role','authenticated')::text, true);

DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT public.wa_request_referral_payout(pg_temp.valid_snapshot()) INTO v_result;
  ASSERT (v_result->>'requested')::boolean = true, 'FAIL c2 — solicitud debía aceptarse';
  ASSERT jsonb_array_length(v_result->'payouts') = 1, 'FAIL c2 — debía crearse 1 solo payout (misma moneda)';
  ASSERT (v_result->'payouts'->0->>'amount')::numeric = 10.00, 'FAIL c2 — amount esperado 10.00 (2 x 5.00)';
  ASSERT (v_result->'payouts'->0->>'commissionCount')::int = 2, 'FAIL c2 — debía incluir las 2 comisiones';

  PERFORM set_config('test.c2_payout_id', v_result->'payouts'->0->>'payoutId', true);
  RAISE NOTICE 'OK: caso 2 — retiro creado con las 2 comisiones, amount=10.00';
END $$;

RESET ROLE;

-- Chargeback SOBRE UNA de las 2 comisiones mientras el retiro sigue
-- 'requested' -- wa_reverse_referral_paid_period() de Fase 5B, SIN TOCAR.
DO $$
DECLARE
  v_result JSONB;
  v_commission RECORD;
BEGIN
  SELECT public.wa_reverse_referral_paid_period('00000000-0000-0000-0000-0000000000b4', 'c2a-ene', 'chargeback') INTO v_result;
  -- required_paid_months=2; al invalidar ene solo queda feb -> racha=1 < 2 -> revierte.
  ASSERT (v_result->>'rewardReversed')::boolean = true, 'FAIL c2-chargeback — la comisión 1 SÍ debía revertirse (racha cae a 1)';

  SELECT * INTO v_commission FROM public.referral_commissions WHERE id = current_setting('test.c2_commission_1', true)::uuid;
  ASSERT v_commission.status = 'reversed', 'FAIL c2-chargeback — comisión 1 debía quedar reversed';

  RAISE NOTICE 'OK: caso 2-chargeback — comisión 1 revertida por 5B mientras el retiro seguía requested, sin que 5C tocara nada de 5B';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ba', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000ba','role','authenticated','app_metadata', json_build_object('role','admin'))::text, true);

DO $$
DECLARE
  v_payout_id UUID := current_setting('test.c2_payout_id', true)::uuid;
  v_commission_id_1 UUID := current_setting('test.c2_commission_1', true)::uuid;
  v_result JSONB;
  v_payout RECORD;
  v_commission_1 RECORD;
  v_commission_2 RECORD;
BEGIN
  SELECT public.wa_admin_mark_referral_payout_paid(v_payout_id, 'TXN-DEBERIA-FALLAR') INTO v_result;

  ASSERT (v_result->>'ok')::boolean = false, 'FAIL c2-pay — el pago NO debía ser exitoso (requestedAmount != payableAmount)';
  ASSERT v_result->>'error' = 'payout_amount_changed', 'FAIL c2-pay — error esperado payout_amount_changed';
  ASSERT (v_result->>'requestedAmount')::numeric = 10.00, 'FAIL c2-pay — requestedAmount esperado 10.00';
  ASSERT (v_result->>'payableAmount')::numeric = 5.00, 'FAIL c2-pay — payableAmount esperado 5.00 (solo la comisión 2 sigue approved)';
  ASSERT (v_result->'excludedCommissionIds') ? v_commission_id_1::text,
    'FAIL c2-pay — excludedCommissionIds debía incluir la comisión revertida';

  SELECT * INTO v_payout FROM public.referral_payout_requests WHERE id = v_payout_id;
  ASSERT v_payout.status = 'requested', 'FAIL c2-pay — el payout debía SEGUIR requested, sin mutar';
  ASSERT v_payout.paid_at IS NULL, 'FAIL c2-pay — paid_at debía seguir NULL';

  SELECT * INTO v_commission_1 FROM public.referral_commissions WHERE id = v_commission_id_1;
  SELECT * INTO v_commission_2 FROM public.referral_commissions WHERE id = current_setting('test.c2_commission_2', true)::uuid;
  ASSERT v_commission_1.status = 'reversed' AND v_commission_1.paid_at IS NULL, 'FAIL c2-pay — comisión 1 debía seguir reversed, nunca paid';
  ASSERT v_commission_2.status = 'approved' AND v_commission_2.paid_at IS NULL, 'FAIL c2-pay — comisión 2 debía seguir approved, NO pagada parcialmente';

  RAISE NOTICE 'OK: caso 2-pay — payout_amount_changed, CERO comisiones pasan a paid (ni la reversa ni la sana), pago parcial explícitamente bloqueado';
END $$;

DO $$
DECLARE
  v_payout_id UUID := current_setting('test.c2_payout_id', true)::uuid;
  v_result JSONB;
BEGIN
  SELECT public.wa_admin_reject_referral_payout(v_payout_id, 'monto cambió por chargeback') INTO v_result;
  ASSERT (v_result->>'ok')::boolean = true, 'FAIL c2-reject — el rechazo debía ser exitoso';
  ASSERT (v_result->>'releasedCommissionCount')::int = 2, 'FAIL c2-reject — debía liberar las 2 comisiones vinculadas';

  RAISE NOTICE 'OK: caso 2-reject — payout rechazado, ambas comisiones liberadas (released_at, nunca DELETE)';
END $$;

RESET ROLE;

-- La comisión 2 (sigue approved) debe volver a estar disponible para una
-- NUEVA solicitud. La comisión 1 (reversed) NUNCA debe volver a aparecer.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000b3','role','authenticated')::text, true);

DO $$
DECLARE
  v_result JSONB;
  v_commission_id_1 UUID := current_setting('test.c2_commission_1', true)::uuid;
  v_commission_id_2 UUID := current_setting('test.c2_commission_2', true)::uuid;
  v_new_payout_id UUID;
BEGIN
  SELECT public.wa_request_referral_payout(pg_temp.valid_snapshot()) INTO v_result;
  ASSERT (v_result->>'requested')::boolean = true, 'FAIL c2-reclaim — la nueva solicitud debía aceptarse';
  ASSERT jsonb_array_length(v_result->'payouts') = 1, 'FAIL c2-reclaim — debía crear 1 payout nuevo';
  ASSERT (v_result->'payouts'->0->>'amount')::numeric = 5.00, 'FAIL c2-reclaim — amount esperado 5.00 (solo la comisión 2 sana)';
  ASSERT (v_result->'payouts'->0->>'commissionCount')::int = 1, 'FAIL c2-reclaim — debía incluir exactamente 1 comisión';

  v_new_payout_id := (v_result->'payouts'->0->>'payoutId')::uuid;

  ASSERT EXISTS (
    SELECT 1 FROM public.referral_payout_commissions
    WHERE payout_id = v_new_payout_id AND commission_id = v_commission_id_2
  ), 'FAIL c2-reclaim — el nuevo retiro debía incluir la comisión 2 (sigue approved)';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.referral_payout_commissions
    WHERE payout_id = v_new_payout_id AND commission_id = v_commission_id_1
  ), 'FAIL c2-reclaim — el nuevo retiro NUNCA debía incluir la comisión 1 (reversed)';

  RAISE NOTICE 'OK: caso 2-reclaim — la comisión approved liberada vuelve a estar disponible; la reversed nunca vuelve a aparecer';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 3: doble reclamo de la MISMA comisión -- backstop de esquema
-- (índice único parcial), verificado por INSERT directo. La protección
-- real en producción es SELECT ... FOR UPDATE SKIP LOCKED dentro de
-- wa_request_referral_payout() (ver evidencia de concurrencia real más
-- abajo, fuera de este script); este bloque prueba la garantía DURA que
-- no depende de timing.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_commission_id UUID;
  v_payout_a UUID;
  v_payout_b UUID;
BEGIN
  PERFORM pg_temp.setup_attribution('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000b7', 'pay-code-b6');
  v_commission_id := pg_temp.get_approved_commission('00000000-0000-0000-0000-0000000000b7', 'c3');

  INSERT INTO public.referral_payout_requests (referrer_user_id, requested_amount, currency, payout_method_snapshot)
  VALUES ('00000000-0000-0000-0000-0000000000b6', 5.00, 'USD', pg_temp.valid_snapshot())
  RETURNING id INTO v_payout_a;
  INSERT INTO public.referral_payout_requests (referrer_user_id, requested_amount, currency, payout_method_snapshot)
  VALUES ('00000000-0000-0000-0000-0000000000b6', 5.00, 'USD', pg_temp.valid_snapshot())
  RETURNING id INTO v_payout_b;

  INSERT INTO public.referral_payout_commissions (payout_id, commission_id, reward_amount_snapshot)
  VALUES (v_payout_a, v_commission_id, 5.00);

  BEGIN
    INSERT INTO public.referral_payout_commissions (payout_id, commission_id, reward_amount_snapshot)
    VALUES (v_payout_b, v_commission_id, 5.00);
    RAISE EXCEPTION 'FAIL c3 — un segundo vínculo ACTIVO para la misma comisión debía ser rechazado por el índice único parcial';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'OK: caso 3 — índice único parcial (commission_id) WHERE released_at IS NULL rechaza el doble reclamo, dos solicitudes nunca pueden reservar la misma comisión';
  END;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 4 (b8/b9, usuarios frescos): min_payout_amount configurable.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_commission_id UUID;
BEGIN
  PERFORM pg_temp.setup_attribution('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000b9', 'pay-code-b8');
  v_commission_id := pg_temp.get_approved_commission('00000000-0000-0000-0000-0000000000b9', 'c4');

  UPDATE public.referral_program_terms SET min_payout_amount = 100.00;
  RAISE NOTICE 'caso 4 — comisión approved de 5.00 para b8/b9: %; min_payout_amount elevado a 100.00', v_commission_id;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b8', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000b8','role','authenticated')::text, true);

DO $$
DECLARE v_result JSONB;
BEGIN
  -- 5.00 disponible, min_payout_amount=100.00 -> no debe crear ningún payout.
  SELECT public.wa_request_referral_payout(pg_temp.valid_snapshot()) INTO v_result;
  ASSERT (v_result->>'requested')::boolean = true, 'FAIL c4 — la llamada debía responder ok igual (no es un error, es una regla de negocio)';
  ASSERT v_result->>'reason' = 'nothing_to_withdraw' OR (v_result->'payouts'->0->>'created')::boolean = false,
    'FAIL c4 — con min_payout_amount=100 no debía crearse ningún payout para un monto de 5.00';
  IF v_result->>'reason' IS DISTINCT FROM 'nothing_to_withdraw' THEN
    ASSERT v_result->'payouts'->0->>'reason' = 'below_minimum', 'FAIL c4 — reason esperado below_minimum';
  END IF;
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.referral_payout_requests WHERE referrer_user_id = '00000000-0000-0000-0000-0000000000b8'
  ), 'FAIL c4 — no debía crearse ninguna fila de payout para b8';

  RAISE NOTICE 'OK: caso 4 — min_payout_amount bloquea la creación de retiros por debajo del mínimo configurado';
END $$;

RESET ROLE;

DO $$
BEGIN
  UPDATE public.referral_program_terms SET min_payout_amount = 0;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b8', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000b8','role','authenticated')::text, true);

DO $$
DECLARE v_result JSONB;
BEGIN
  -- Con min_payout_amount de vuelta a 0, la MISMA comisión (nunca se tocó,
  -- sigue approved y libre) ahora sí debe poder retirarse.
  SELECT public.wa_request_referral_payout(pg_temp.valid_snapshot()) INTO v_result;
  ASSERT (v_result->>'requested')::boolean = true, 'FAIL c4-restored — la solicitud debía aceptarse';
  ASSERT (v_result->'payouts'->0->>'created')::boolean = true, 'FAIL c4-restored — debía crear el payout ahora que min_payout_amount=0';
  ASSERT (v_result->'payouts'->0->>'amount')::numeric = 5.00, 'FAIL c4-restored — amount esperado 5.00';

  RAISE NOTICE 'OK: caso 4-restored — min_payout_amount=0 no afecta comisiones ya existentes, la misma comisión ahora es retirable';
END $$;

RESET ROLE;

DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TODOS LOS CASOS DE FASE 5C (payouts/retiros) PASARON.';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
