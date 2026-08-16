-- Verificación MANUAL de 20260818120000_wa_request_referral_payout_use_saved_method.sql
-- (Fase C3) -- NO es una migración, no vive en supabase/migrations/ a
-- propósito, para que el CLI de Supabase nunca la levante como parte de
-- `supabase db push`.
-- NO ejecutar contra el proyecto de producción.
-- Solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluida
--                                   esta Fase C3)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_referral_payout_method_cutover.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- Mismo patrón que verify_referral_payout_methods.sql: crea un secreto de
-- Vault de PRUEBA, exclusivo de esta transacción, revertido con el
-- ROLLBACK final. Nunca el valor real de producción.

BEGIN;

SELECT vault.create_secret('diagnostic-only-test-key-never-used-in-production', 'referral_payout_method_encryption_key');

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: 3 afiliados (e1=CL, e2=AR, e3=sin método) + referidos + comisiones
-- approved ya reclamables. Helper de fixture, mismo patrón que
-- verify_referral_payout_requests.sql.
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'cutover-cl@example.test',       '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'cutover-ar@example.test',       '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e3', 'cutover-none@example.test',     '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e4', 'cutover-referred-1@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e5', 'cutover-referred-2@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e6', 'cutover-referred-3@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e7', 'cutover-referred-4@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e8', 'cutover-referred-5@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e9', 'cutover-referred-6@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated');

CREATE OR REPLACE FUNCTION pg_temp.setup_approved_commission(
  p_referrer UUID, p_referred UUID, p_code TEXT, p_amount NUMERIC DEFAULT 5.00, p_currency TEXT DEFAULT 'USD'
)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_code_id UUID;
  v_code    TEXT;
  v_attribution_id UUID;
  v_commission_id UUID;
BEGIN
  INSERT INTO public.referral_codes (user_id, code, display_name)
  VALUES (p_referrer, p_code, 'Diag Cutover')
  ON CONFLICT (user_id) DO UPDATE SET code = public.referral_codes.code
  RETURNING id, code INTO v_code_id, v_code;

  INSERT INTO public.referral_attributions (referred_user_id, referrer_user_id, referral_code_id, code_snapshot, status)
  VALUES (p_referred, p_referrer, v_code_id, v_code, 'qualified')
  RETURNING id INTO v_attribution_id;

  INSERT INTO public.referral_commissions (referral_attribution_id, referrer_user_id, reward_amount, reward_currency, required_paid_months, terms_version, status)
  VALUES (v_attribution_id, p_referrer, p_amount, p_currency, 2, 1, 'approved')
  RETURNING id INTO v_commission_id;

  RETURN v_commission_id;
END;
$$;

DO $$ BEGIN
  PERFORM pg_temp.setup_approved_commission('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e4', 'cutover-cl');
  PERFORM pg_temp.setup_approved_commission('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e5', 'cutover-ar');
  PERFORM pg_temp.setup_approved_commission('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e6', 'cutover-none');
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos 1/2 — e3 sin método guardado -> payout_method_not_configured,
-- CERO comisiones reclamadas (siguen approved y libres).
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e3', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e3','role','authenticated')::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.wa_request_referral_payout();
  IF (v_result->>'requested')::boolean IS DISTINCT FROM false OR (v_result->>'reason') IS DISTINCT FROM 'payout_method_not_configured' THEN
    RAISE EXCEPTION 'FAIL caso 1 — sin método debía dar payout_method_not_configured, recibió: %', v_result;
  END IF;
  RAISE NOTICE 'OK: caso 1 — sin método guardado -> payout_method_not_configured';
END $$;

RESET ROLE;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.referral_commissions rc
  WHERE rc.referrer_user_id = '00000000-0000-0000-0000-0000000000e3'
    AND rc.status = 'approved'
    AND NOT EXISTS (SELECT 1 FROM public.referral_payout_commissions rpc WHERE rpc.commission_id = rc.id AND rpc.released_at IS NULL);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL caso 2 — la comisión de e3 debía seguir approved y libre, cuenta=%', v_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.referral_payout_requests WHERE referrer_user_id = '00000000-0000-0000-0000-0000000000e3') THEN
    RAISE EXCEPTION 'FAIL caso 2 — no debía crearse ningún referral_payout_requests para e3';
  END IF;
  RAISE NOTICE 'OK: caso 2 — sin método -> cero comisiones reclamadas, cero payout creado';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos 3/4 — e1 (CL) guarda método, solicita retiro, snapshot coincide.
-- Caso 7/8 incluidos acá: el snapshot MALICIOSO que e1 envía como
-- parámetro se ignora por completo.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_result JSONB;
  v_payout_id UUID;
BEGIN
  PERFORM public.wa_set_my_referral_payout_method('CL', 'Juan Perez', '11.111.111-1', 'Banco Estado', 'checking', '000123456789', NULL);

  -- Snapshot MALICIOSO, con datos completamente distintos a los guardados.
  v_result := public.wa_request_referral_payout(jsonb_build_object(
    'method', 'bank_transfer', 'country', 'CL', 'holder_name', 'ATACANTE',
    'bank_name', 'Banco Malicioso', 'account_type', 'checking', 'account_number', '999999999999'
  ));

  IF (v_result->>'requested')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL caso 3 — CL con método guardado debía crear payout, recibió: %', v_result;
  END IF;
  v_payout_id := (v_result->'payouts'->0->>'payoutId')::uuid;
  PERFORM set_config('test.cl_payout_id', v_payout_id::text, true);
  RAISE NOTICE 'OK: caso 3 — payout CL creado con método guardado';
END $$;

RESET ROLE;

-- referral_payout_requests no tiene SELECT directo para authenticated
-- (hardening de 20260818100000) -- esta verificación corre como
-- postgres/superuser, después de RESET ROLE, exactamente igual que el
-- resto de los diagnósticos de este repo que inspeccionan filas crudas.
DO $$
DECLARE
  v_snapshot JSONB;
BEGIN
  SELECT payout_method_snapshot INTO v_snapshot FROM public.referral_payout_requests WHERE id = current_setting('test.cl_payout_id')::uuid;
  IF v_snapshot->>'bank_name' IS DISTINCT FROM 'Banco Estado'
     OR v_snapshot->>'holder_name' IS DISTINCT FROM 'Juan Perez'
     OR v_snapshot->>'holder_tax_id' IS DISTINCT FROM '11111111-1'
     OR v_snapshot->>'account_number' IS DISTINCT FROM '000123456789'
     OR v_snapshot->>'account_type' IS DISTINCT FROM 'checking'
     OR v_snapshot->>'country' IS DISTINCT FROM 'CL' THEN
    RAISE EXCEPTION 'FAIL caso 4 — el snapshot no coincide con el método guardado: %', v_snapshot;
  END IF;
  RAISE NOTICE 'OK: caso 4 — snapshot coincide EXACTO con el método CL guardado (holder_tax_id normalizado)';

  IF v_snapshot->>'bank_name' = 'Banco Malicioso' OR v_snapshot->>'holder_name' = 'ATACANTE' OR v_snapshot->>'account_number' = '999999999999' THEN
    RAISE EXCEPTION 'FAIL caso 7/8 — el snapshot malicioso enviado por el cliente NO debía usarse';
  END IF;
  RAISE NOTICE 'OK: caso 7/8 — snapshot del cliente (malicioso, con "banco distinto") ignorado por completo; se usó exclusivamente el método guardado';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos 5/6 — e2 (AR) guarda método, solicita retiro, snapshot coincide.
-- Sin account_type -- CBU/CVU no tiene ese concepto, y desde 20260818115000
-- el validador ya no lo exige para países distintos de CL. El snapshot AR
-- NUNCA contiene un valor artificial (ver Punto 1 del pedido: cero
-- account_type='cbu' inventado).
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e2','role','authenticated')::text, true);

DO $$
DECLARE
  v_result JSONB;
  v_payout_id UUID;
BEGIN
  PERFORM public.wa_set_my_referral_payout_method('AR', 'Maria Lopez', '20-12345678-3', 'Banco Galicia', NULL, '0110599940000012345678', 'maria.mp');

  v_result := public.wa_request_referral_payout();
  IF (v_result->>'requested')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL caso 5 — AR con método guardado debía crear payout, recibió: %', v_result;
  END IF;
  v_payout_id := (v_result->'payouts'->0->>'payoutId')::uuid;
  PERFORM set_config('test.ar_payout_id', v_payout_id::text, true);
  RAISE NOTICE 'OK: caso 5 — payout AR creado con método guardado';
END $$;

RESET ROLE;

DO $$
DECLARE
  v_snapshot JSONB;
BEGIN
  SELECT payout_method_snapshot INTO v_snapshot FROM public.referral_payout_requests WHERE id = current_setting('test.ar_payout_id')::uuid;
  IF v_snapshot->>'bank_name' IS DISTINCT FROM 'Banco Galicia'
     OR v_snapshot->>'holder_tax_id' IS DISTINCT FROM '20123456783'
     OR v_snapshot->>'account_number' IS DISTINCT FROM '0110599940000012345678'
     OR v_snapshot->>'alias' IS DISTINCT FROM 'maria.mp'
     OR v_snapshot->>'country' IS DISTINCT FROM 'AR' THEN
    RAISE EXCEPTION 'FAIL caso 6 — el snapshot AR no coincide con el método guardado: %', v_snapshot;
  END IF;
  IF v_snapshot ? 'account_type' THEN
    RAISE EXCEPTION 'FAIL caso 6 — el snapshot AR NO debía contener account_type (ni real ni artificial), lo tiene: %', v_snapshot->>'account_type';
  END IF;
  RAISE NOTICE 'OK: caso 6 — snapshot AR coincide (incluye alias), sin account_type -- ni real ni artificial ("cbu")';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos 9/10 — e1 cambia de método DESPUÉS de tener un payout: el payout
-- viejo no cambia; un payout NUEVO usa el método nuevo.
-- ══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  PERFORM pg_temp.setup_approved_commission('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e7', 'cutover-cl');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_result JSONB;
  v_new_payout_id UUID;
BEGIN
  -- cl_payout_id ya se verificó en el caso 4: bank_name='Banco Estado'.
  PERFORM public.wa_set_my_referral_payout_method('CL', 'Juan Perez', '11.111.111-1', 'Banco Santander', 'savings', '555444333222', NULL);

  v_result := public.wa_request_referral_payout();
  v_new_payout_id := (v_result->'payouts'->0->>'payoutId')::uuid;
  PERFORM set_config('test.cl_payout_id_2', v_new_payout_id::text, true);
END $$;

RESET ROLE;

DO $$
DECLARE
  v_old_snapshot JSONB;
  v_new_snapshot JSONB;
BEGIN
  SELECT payout_method_snapshot INTO v_old_snapshot FROM public.referral_payout_requests WHERE id = current_setting('test.cl_payout_id')::uuid;
  IF v_old_snapshot->>'bank_name' IS DISTINCT FROM 'Banco Estado' THEN
    RAISE EXCEPTION 'FAIL caso 9 — cambiar el método NO debía alterar el payout_method_snapshot del payout viejo, obtuvo: %', v_old_snapshot;
  END IF;
  RAISE NOTICE 'OK: caso 9 — cambiar método después no altera el payout viejo (snapshot inmutable intacto)';

  SELECT payout_method_snapshot INTO v_new_snapshot FROM public.referral_payout_requests WHERE id = current_setting('test.cl_payout_id_2')::uuid;
  IF v_new_snapshot->>'bank_name' IS DISTINCT FROM 'Banco Santander' THEN
    RAISE EXCEPTION 'FAIL caso 10 — el payout siguiente debía usar el método nuevo (Banco Santander), obtuvo: %', v_new_snapshot;
  END IF;
  RAISE NOTICE 'OK: caso 10 — el payout siguiente usa el método nuevo';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos 11/12 — clave de Vault ausente (dentro de un SAVEPOINT, se
-- restaura después) -> fail closed, cero mutación parcial.
-- ══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  PERFORM pg_temp.setup_approved_commission('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e8', 'cutover-cl');
END $$;

SAVEPOINT before_key_removal;

DELETE FROM vault.secrets WHERE name = 'referral_payout_method_encryption_key';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM public.wa_request_referral_payout();
    RAISE EXCEPTION 'FAIL caso 11 — sin clave configurada debía lanzar excepción';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'REFERRAL_PAYOUT_METHOD_ENCRYPTION_KEY_NOT_CONFIGURED%' THEN
        RAISE EXCEPTION 'FAIL caso 11 — excepción inesperada: %', SQLERRM;
      END IF;
      RAISE NOTICE 'OK: caso 11 — clave ausente -> fail closed';
  END;
END $$;

RESET ROLE;

ROLLBACK TO SAVEPOINT before_key_removal;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Tras el ROLLBACK TO SAVEPOINT, la comisión de e8 nunca se reclamó --
  -- confirma que el intento fallido (caso 11) no dejó nada mutado.
  SELECT count(*) INTO v_count
  FROM public.referral_commissions rc
  WHERE rc.referrer_user_id = '00000000-0000-0000-0000-0000000000e1'
    AND rc.status = 'approved'
    AND NOT EXISTS (SELECT 1 FROM public.referral_payout_commissions rpc WHERE rpc.commission_id = rc.id AND rpc.released_at IS NULL);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL caso 12 — la comisión de e8 debía seguir libre tras el fallo de clave, cuenta=%', v_count;
  END IF;
  RAISE NOTICE 'OK: caso 12 — ninguna mutación parcial quedó tras el fallo de decrypt (clave restaurada por el SAVEPOINT)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 18 — idempotencia de reclamo: reclamar de nuevo con la comisión de
-- e8 ya libre otra vez (por el ROLLBACK TO SAVEPOINT) debe funcionar una
-- vez, y una SEGUNDA llamada inmediata no debe reclamar nada más.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_result1 JSONB;
  v_result2 JSONB;
BEGIN
  v_result1 := public.wa_request_referral_payout();
  IF (v_result1->>'requested')::boolean IS DISTINCT FROM true OR jsonb_array_length(v_result1->'payouts') = 0 THEN
    RAISE EXCEPTION 'FAIL caso 18 — primera llamada debía reclamar la comisión de e8: %', v_result1;
  END IF;

  v_result2 := public.wa_request_referral_payout();
  IF (v_result2->>'reason') IS DISTINCT FROM 'nothing_to_withdraw' THEN
    RAISE EXCEPTION 'FAIL caso 18 — segunda llamada inmediata NO debía reclamar nada más, recibió: %', v_result2;
  END IF;
  RAISE NOTICE 'OK: caso 18 — locks/idempotencia sin cambios: la segunda llamada no reclama dos veces';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 17 — minimum payout sin cambios: subir min_payout_amount bloquea
-- un retiro por debajo del mínimo, exactamente igual que antes de C3.
-- ══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  PERFORM pg_temp.setup_approved_commission('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e9', 'cutover-cl', 1.00, 'USD');
  UPDATE public.referral_program_terms SET min_payout_amount = 100.00;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.wa_request_referral_payout();
  IF (v_result->'payouts'->0->>'reason') IS DISTINCT FROM 'below_minimum' THEN
    RAISE EXCEPTION 'FAIL caso 17 — min_payout_amount debía bloquear el retiro, recibió: %', v_result;
  END IF;
  RAISE NOTICE 'OK: caso 17 — min_payout_amount sigue funcionando sin cambios';
END $$;

RESET ROLE;

DO $$ BEGIN
  UPDATE public.referral_program_terms SET min_payout_amount = 0;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 16 — grouping por moneda sin cambios: comisión en una moneda
-- distinta (CLP) genera un payout SEPARADO, nunca mezclado con USD.
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role) VALUES
  ('00000000-0000-0000-0000-0000000000ea', 'cutover-referred-clp@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated');

DO $$ BEGIN
  PERFORM pg_temp.setup_approved_commission('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000ea', 'cutover-cl', 4500.00, 'CLP');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_result JSONB;
  v_clp_amount NUMERIC;
  v_currencies TEXT[];
BEGIN
  v_result := public.wa_request_referral_payout();
  -- Nota: el caso 17 dejó una comisión USD de 1.00 sin reclamar (quedó
  -- bajo el mínimo temporal de 100, nunca se insertó en referral_payout_
  -- commissions) -- al resetear min_payout_amount a 0 antes de este caso,
  -- esa comisión vuelve a ser elegible y se reclama JUNTO con la nueva de
  -- CLP en esta misma llamada. Comportamiento correcto y esperado del
  -- agrupado por moneda (sin cambios de C3): lo que importa acá es que
  -- CLP y USD nunca se sumen en un mismo payout -- nunca que solo exista
  -- una moneda reclamable en este punto del script.
  SELECT array_agg(p->>'currency') INTO v_currencies FROM jsonb_array_elements(v_result->'payouts') p WHERE (p->>'created')::boolean = true;
  SELECT (p->>'amount')::numeric INTO v_clp_amount FROM jsonb_array_elements(v_result->'payouts') p WHERE p->>'currency' = 'CLP';

  IF NOT ('CLP' = ANY(v_currencies)) THEN
    RAISE EXCEPTION 'FAIL caso 16 — se esperaba un payout creado en CLP: %', v_result;
  END IF;
  IF v_clp_amount IS DISTINCT FROM 4500.00 THEN
    RAISE EXCEPTION 'FAIL caso 16 — el monto en CLP no debía mezclarse con el monto en USD, obtuvo: %', v_clp_amount;
  END IF;
  RAISE NOTICE 'OK: caso 16 — grouping por moneda sin cambios (CLP nunca se mezcla con USD, cada moneda es un payout separado con su propio monto)';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos 13/14/15 — historial self-service, detalle admin y masking siguen
-- funcionando exactamente igual sobre los payouts nuevos.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_history JSONB;
  v_first   JSONB;
BEGIN
  v_history := public.wa_list_my_referral_payouts(20, 0);
  IF jsonb_array_length(v_history) < 1 THEN
    RAISE EXCEPTION 'FAIL caso 13 — el historial debía incluir los payouts nuevos';
  END IF;
  v_first := v_history->0;
  IF v_first ? 'accountNumber' OR (v_first->>'maskedAccountNumber') !~ '•' THEN
    RAISE EXCEPTION 'FAIL caso 15 — el masking del historial self-service cambió: %', v_first;
  END IF;
  RAISE NOTICE 'OK: caso 13/15 — historial self-service y masking sin cambios';
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000e1','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_detail JSONB;
BEGIN
  v_detail := public.wa_admin_get_referral_payout_detail(current_setting('test.cl_payout_id')::uuid);
  IF (v_detail->'payout'->'payoutMethodSnapshot'->>'bank_name') IS DISTINCT FROM 'Banco Estado' THEN
    RAISE EXCEPTION 'FAIL caso 14 — wa_admin_get_referral_payout_detail no devolvió el snapshot completo esperado: %', v_detail;
  END IF;
  RAISE NOTICE 'OK: caso 14 — admin sigue viendo el snapshot completo del payout';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos AR-13/AR-14/AR-15 (Punto 4 del pedido) — historial self-service,
-- detalle admin y masking funcionan igual para un payout AR (e2), cuyo
-- snapshot NO tiene account_type -- confirma que la ausencia del campo no
-- rompe ninguna de las 3 lecturas.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e2','role','authenticated')::text, true);

DO $$
DECLARE
  v_history JSONB;
  v_first   JSONB;
BEGIN
  v_history := public.wa_list_my_referral_payouts(20, 0);
  IF jsonb_array_length(v_history) < 1 THEN
    RAISE EXCEPTION 'FAIL caso AR-13 — el historial de e2 (AR) debía incluir su payout';
  END IF;
  v_first := v_history->0;
  IF v_first ? 'accountNumber' OR (v_first->>'maskedAccountNumber') !~ '•' THEN
    RAISE EXCEPTION 'FAIL caso AR-15 — el masking del historial self-service AR falló: %', v_first;
  END IF;
  RAISE NOTICE 'OK: caso AR-13/AR-15 — historial self-service y masking funcionan igual para un payout AR sin account_type';
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000e1','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_detail JSONB;
BEGIN
  v_detail := public.wa_admin_get_referral_payout_detail(current_setting('test.ar_payout_id')::uuid);
  IF (v_detail->'payout'->'payoutMethodSnapshot'->>'bank_name') IS DISTINCT FROM 'Banco Galicia' THEN
    RAISE EXCEPTION 'FAIL caso AR-14 — wa_admin_get_referral_payout_detail no devolvió el snapshot AR completo esperado: %', v_detail;
  END IF;
  IF (v_detail->'payout'->'payoutMethodSnapshot') ? 'account_type' THEN
    RAISE EXCEPTION 'FAIL caso AR-14 — el detalle admin no debía mostrar un account_type inexistente para AR';
  END IF;
  RAISE NOTICE 'OK: caso AR-14 — admin ve el detalle completo de un payout AR, sin account_type artificial';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso AR-legado — un snapshot AR "histórico" que SÍ trae account_type
-- (forma que pudo haber existido antes de esta fase, p.ej. si alguna vez
-- se guardó manualmente) sigue siendo válido y legible por el admin: el
-- validador extendido (20260818115000) nunca prohíbe el campo, solo deja
-- de exigirlo para países distintos de CL.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_legacy_ar_id UUID;
BEGIN
  INSERT INTO public.referral_payout_requests (referrer_user_id, requested_amount, currency, payout_method_snapshot, requested_at)
  VALUES (
    '00000000-0000-0000-0000-0000000000e2', 3.00, 'USD',
    jsonb_build_object('method','bank_transfer','country','AR','holder_name','Legado AR','bank_name','Banco Legado AR','account_type','cbu','account_number','0110599940000099999999'),
    now() - interval '10 days'
  )
  RETURNING id INTO v_legacy_ar_id;
  PERFORM set_config('test.legacy_ar_payout_id', v_legacy_ar_id::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000e1','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_detail JSONB;
BEGIN
  v_detail := public.wa_admin_get_referral_payout_detail(current_setting('test.legacy_ar_payout_id')::uuid);
  IF (v_detail->'payout'->'payoutMethodSnapshot'->>'bank_name') IS DISTINCT FROM 'Banco Legado AR' THEN
    RAISE EXCEPTION 'FAIL caso AR-legado — un snapshot AR histórico con account_type debía seguir siendo legible por el admin: %', v_detail;
  END IF;
  IF (v_detail->'payout'->'payoutMethodSnapshot'->>'account_type') IS DISTINCT FROM 'cbu' THEN
    RAISE EXCEPTION 'FAIL caso AR-legado — el account_type histórico no debía perderse ni reescribirse: %', v_detail;
  END IF;
  RAISE NOTICE 'OK: caso AR-legado — snapshot AR histórico CON account_type sigue siendo válido y legible sin alteración';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 24 — payout "legado" (insertado directamente, simulando un payout
-- creado por la versión anterior de la función, con snapshot con forma
-- vieja) sigue siendo legible por historial y admin sin ningún error.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_legacy_id UUID;
BEGIN
  INSERT INTO public.referral_payout_requests (referrer_user_id, requested_amount, currency, payout_method_snapshot, requested_at)
  VALUES (
    '00000000-0000-0000-0000-0000000000e1', 3.00, 'USD',
    jsonb_build_object('method','bank_transfer','country','CL','holder_name','Legado Viejo','bank_name','Banco Legado','account_type','vista','account_number','777888999'),
    now() - interval '10 days'
  )
  RETURNING id INTO v_legacy_id;
  PERFORM set_config('test.legacy_payout_id', v_legacy_id::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000e1','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_detail JSONB;
BEGIN
  v_detail := public.wa_admin_get_referral_payout_detail(current_setting('test.legacy_payout_id')::uuid);
  IF (v_detail->'payout'->'payoutMethodSnapshot'->>'bank_name') IS DISTINCT FROM 'Banco Legado' THEN
    RAISE EXCEPTION 'FAIL caso 24 — un payout legado (forma anterior a C3) debía seguir siendo legible por el admin: %', v_detail;
  END IF;
  RAISE NOTICE 'OK: caso 24 — payouts históricos/legados (forma anterior a C3) siguen funcionando sin cambios';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos 19/20/21/22/23 — regresión de superficie: tabla referral_payout_
-- methods sigue RPC-only (ya probado en C2, reconfirmado acá), firma/
-- grants/search_path/SECURITY DEFINER de wa_request_referral_payout.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e2','role','authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.referral_payout_methods LIMIT 1;
    RAISE EXCEPTION 'FAIL caso 19 — authenticated NO debía poder leer referral_payout_methods directamente';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: caso 19 — authenticated SELECT directo sigue bloqueado (sin regresión de C2)';
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.referral_payout_methods LIMIT 1;
    RAISE EXCEPTION 'FAIL caso 20 — anon NO debía poder leer referral_payout_methods directamente';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: caso 20 — anon SELECT directo sigue bloqueado (sin regresión de C2)';
  END;
END $$;

RESET ROLE;

DO $$
DECLARE
  v_proc RECORD;
BEGIN
  SELECT p.prosecdef, p.proconfig INTO v_proc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'wa_request_referral_payout';

  IF NOT v_proc.prosecdef THEN
    RAISE EXCEPTION 'FAIL caso 23 — wa_request_referral_payout debe ser SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'OK: caso 23 — SECURITY DEFINER confirmado';

  IF v_proc.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_proc.proconfig) c WHERE c LIKE 'search_path=%extensions%') THEN
    RAISE EXCEPTION 'FAIL caso 22 — search_path debe incluir extensions (necesario para pgp_sym_decrypt)';
  END IF;
  RAISE NOTICE 'OK: caso 22 — search_path correcto (public, extensions)';

  IF NOT has_function_privilege('authenticated', 'public.wa_request_referral_payout(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL caso 21 — authenticated debe conservar EXECUTE';
  END IF;
  IF has_function_privilege('anon', 'public.wa_request_referral_payout(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL caso 21 — anon NUNCA debe tener EXECUTE';
  END IF;
  RAISE NOTICE 'OK: caso 21 — grants/firma de wa_request_referral_payout correctos (misma firma JSONB, DEFAULT agregado)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TODOS LOS CASOS DE FASE C3 (payout method cutover) PASARON.';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;

-- Caso 25: rollback limpio -- si todo lo anterior corrió sin abortar la
-- transacción, este ROLLBACK final se ejecuta sin error y no deja rastro.
ROLLBACK;
