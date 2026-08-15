-- Verificación MANUAL de 20260814100000_referral_commission_maturation_and_reversal.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción.
-- Solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluida
--                                   Fase 5B)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_referral_commission_maturation_and_reversal.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- Cada escenario usa su PROPIO referidor y su PROPIO referido (sin
-- reutilizar entre casos) para que la aritmética de wa_get_my_referral_stats()
-- de cada caso sea exacta y no dependa del orden de ejecución de los demás.
-- required_paid_months=2 y reward_amount=5.00 vienen del seed real de
-- referral_program_terms (20260808120000_referral_core_user_centric.sql).
--
-- Simula usuarios autenticados vía request.jwt.claim(s) + SET LOCAL ROLE
-- (auth.uid() lee esos GUCs) -- SIEMPRE como sentencia de nivel superior,
-- nunca dentro de un bloque DO/plpgsql (mismo patrón exacto que
-- verify_affiliate_panel_read_rpcs.sql). Todo el script corre en una sola
-- transacción con ROLLBACK final.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: 14 usuarios (7 pares referidor/referido, uno por escenario).
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'mat-r1@example.test', '{"full_name":"R1"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'mat-e1@example.test', '{"full_name":"E1"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f3', 'mat-r2@example.test', '{"full_name":"R2"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f4', 'mat-e2@example.test', '{"full_name":"E2"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f5', 'mat-r3@example.test', '{"full_name":"R3"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f6', 'mat-e3@example.test', '{"full_name":"E3"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f7', 'mat-r6@example.test', '{"full_name":"R6"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f8', 'mat-e6@example.test', '{"full_name":"E6"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f9', 'mat-r7@example.test', '{"full_name":"R7"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000fa', 'mat-e7@example.test', '{"full_name":"E7"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000fb', 'mat-r8@example.test', '{"full_name":"R8"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000fc', 'mat-e8@example.test', '{"full_name":"E8"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000fd', 'mat-r9@example.test', '{"full_name":"R9"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000fe', 'mat-e9@example.test', '{"full_name":"E9"}'::jsonb, now(), 'authenticated', 'authenticated');

-- Helper: crea el código del referidor y la atribución 'qualified' directa
-- (bypass de wa_get_or_create_my_referral_code()/wa_attribute_referral(),
-- vía INSERT directo -- mismo patrón de "bypass de setup" que ya usan
-- verify_referral_core_user_centric.sql y verify_affiliate_panel_read_rpcs.sql
-- para las atribuciones; esa cobertura de las RPCs de escritura ya existe
-- ahí, este archivo se enfoca solo en maduración/reversión).
CREATE OR REPLACE FUNCTION pg_temp.setup_attribution(p_referrer UUID, p_referred UUID, p_code TEXT)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_code_id UUID;
  v_attribution_id UUID;
BEGIN
  INSERT INTO public.referral_codes (user_id, code, display_name)
  VALUES (p_referrer, p_code, 'Referidor de Test')
  RETURNING id INTO v_code_id;

  INSERT INTO public.referral_attributions (referred_user_id, referrer_user_id, referral_code_id, code_snapshot, status)
  VALUES (p_referred, p_referrer, v_code_id, p_code, 'qualified')
  RETURNING id INTO v_attribution_id;

  RETURN v_attribution_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 1 (r1/e1): ene+feb califican -> pending. Refund de ENE (comisión
-- todavía 'pending', hold_until todavía futuro por defecto -- cubre a la
-- vez "refund antes del hold_until" y "pierde calificación").
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_attribution_id UUID;
  v_result JSONB;
  v_commission RECORD;
BEGIN
  v_attribution_id := pg_temp.setup_attribution(
    '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', 'mat-code-r1');

  PERFORM public.wa_register_referral_paid_period(
    '00000000-0000-0000-0000-0000000000f2', 'c1-ene', '2026-01-15T00:00:00Z');
  SELECT public.wa_register_referral_paid_period(
    '00000000-0000-0000-0000-0000000000f2', 'c1-feb', '2026-02-15T00:00:00Z') INTO v_result;

  ASSERT (v_result->>'paidMonths')::int = 2, 'FAIL c1 — paidMonths esperado 2 tras ene+feb';
  ASSERT (v_result->>'rewardCreated')::boolean = true, 'FAIL c1 — reward debía crearse';

  SELECT * INTO v_commission FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission.status = 'pending', 'FAIL c1 — comisión debía estar pending';
  ASSERT v_commission.hold_until > now(), 'FAIL c1 — hold_until debía seguir en el futuro (refund antes del hold_until)';

  -- Refund de ENE.
  SELECT public.wa_reverse_referral_paid_period(
    '00000000-0000-0000-0000-0000000000f2', 'c1-ene', 'refund') INTO v_result;

  ASSERT (v_result->>'reversed')::boolean = true, 'FAIL c1 — invalidación del período debía marcarse';
  ASSERT (v_result->>'recalculatedPaidMonths')::int = 1, 'FAIL c1 — racha recalculada esperada 1 (solo feb)';
  ASSERT (v_result->>'rewardReversed')::boolean = true, 'FAIL c1 — la comisión SÍ debía revertirse (1 < 2)';
  ASSERT v_result->>'reason' = 'below_required_months', 'FAIL c1 — reason esperado below_required_months';

  SELECT * INTO v_commission FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission.status = 'reversed', 'FAIL c1 — status final esperado reversed';
  ASSERT v_commission.reversed_reason = 'refund', 'FAIL c1 — reversed_reason esperado refund';
  ASSERT v_commission.reversed_at IS NOT NULL, 'FAIL c1 — reversed_at debía setearse';

  ASSERT EXISTS (
    SELECT 1 FROM public.referral_paid_periods
    WHERE referral_attribution_id = v_attribution_id AND period_ref = 'c1-ene'
      AND invalidated_at IS NOT NULL AND invalidated_reason = 'refund'
  ), 'FAIL c1 — el período de enero debía quedar invalidado (nunca borrado)';
  ASSERT (SELECT count(*) FROM public.referral_paid_periods WHERE referral_attribution_id = v_attribution_id) = 2,
    'FAIL c1 — las 2 filas de período deben seguir existiendo (nunca DELETE)';

  RAISE NOTICE 'OK: caso 1 (r1/e1) — ene+feb califica, refund ene (pending, antes de hold_until) -> pierde calificación, comisión reversed';
END $$;

-- Refund duplicado del mismo period_ref (reintento de webhook) -> no-op.
DO $$
DECLARE
  v_result JSONB;
  v_reversed_at_before TIMESTAMPTZ;
  v_reversed_at_after TIMESTAMPTZ;
BEGIN
  SELECT rc.reversed_at INTO v_reversed_at_before
  FROM public.referral_commissions rc
  JOIN public.referral_attributions ra ON ra.id = rc.referral_attribution_id
  WHERE ra.referred_user_id = '00000000-0000-0000-0000-0000000000f2';

  SELECT public.wa_reverse_referral_paid_period(
    '00000000-0000-0000-0000-0000000000f2', 'c1-ene', 'refund') INTO v_result;

  ASSERT (v_result->>'alreadyInvalidated')::boolean = true, 'FAIL c1-dup — debía detectarse como ya invalidado';
  ASSERT (v_result->>'rewardReversed')::boolean = false, 'FAIL c1-dup — no debía reportar una nueva reversión';
  ASSERT v_result->>'reason' = 'already_invalidated', 'FAIL c1-dup — reason esperado already_invalidated';

  SELECT rc.reversed_at INTO v_reversed_at_after
  FROM public.referral_commissions rc
  JOIN public.referral_attributions ra ON ra.id = rc.referral_attribution_id
  WHERE ra.referred_user_id = '00000000-0000-0000-0000-0000000000f2';

  ASSERT v_reversed_at_after = v_reversed_at_before, 'FAIL c1-dup — reversed_at no debía cambiar (no-op real)';

  RAISE NOTICE 'OK: caso 1-dup — refund duplicado del mismo period_ref es no-op idempotente';
END $$;

-- wa_get_my_referral_stats()/wa_list_my_referrals() de r1 tras el refund.
-- SET LOCAL ROLE como sentencia de nivel superior (nunca dentro de un DO) --
-- mismo patrón exacto que verify_affiliate_panel_read_rpcs.sql.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true);

DO $$
DECLARE
  v_stats JSONB;
  v_list JSONB;
BEGIN
  SELECT public.wa_get_my_referral_stats() INTO v_stats;
  SELECT public.wa_list_my_referrals(20, 0) INTO v_list;

  ASSERT (v_stats->>'qualifiedCount')::int = 0, 'FAIL c1-stats — qualifiedCount esperado 0 tras refund';
  ASSERT (v_stats->>'oneMonthCount')::int = 1, 'FAIL c1-stats — oneMonthCount esperado 1 (solo feb)';
  ASSERT (v_stats->>'pendingAmount')::numeric = 0, 'FAIL c1-stats — pendingAmount esperado 0 (comisión reversed)';
  ASSERT (v_stats->>'availableAmount')::numeric = 0, 'FAIL c1-stats — availableAmount esperado 0';
  ASSERT (v_stats->>'totalEarnedAmount')::numeric = 0, 'FAIL c1-stats — totalEarnedAmount esperado 0';

  ASSERT jsonb_array_length(v_list) = 1, 'FAIL c1-list — debía haber 1 referido';
  ASSERT (v_list->0->>'paidMonths')::int = 1, 'FAIL c1-list — paidMonths esperado 1';
  ASSERT (v_list->0->>'qualified')::boolean = false, 'FAIL c1-list — qualified esperado false';

  RAISE NOTICE 'OK: caso 1-stats — wa_get_my_referral_stats()/wa_list_my_referrals() reflejan el estado recalculado sin haber sido tocadas por esta migración';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 2 (r2/e2): ene+feb+mar. Refund de ENE -> feb+mar siguen siendo 2
-- consecutivos -> NO debe revertirse la recompensa.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_attribution_id UUID;
  v_result JSONB;
  v_commission RECORD;
BEGIN
  v_attribution_id := pg_temp.setup_attribution(
    '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4', 'mat-code-r2');

  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000f4', 'c2-ene', '2026-01-15T00:00:00Z');
  SELECT public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000f4', 'c2-feb', '2026-02-15T00:00:00Z') INTO v_result;
  ASSERT (v_result->>'rewardCreated')::boolean = true, 'FAIL c2 — reward debía crearse en feb (streak=2)';

  -- mar se registra igual (mes real pagado adicional) pero NO crea una
  -- segunda recompensa -- ya existe una para esta atribución (UNIQUE).
  SELECT public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000f4', 'c2-mar', '2026-03-15T00:00:00Z') INTO v_result;
  ASSERT (v_result->>'rewardCreated')::boolean = false, 'FAIL c2 — no debía crear una segunda recompensa';
  ASSERT v_result->>'reason' = 'already_rewarded', 'FAIL c2 — reason esperado already_rewarded';

  SELECT public.wa_reverse_referral_paid_period('00000000-0000-0000-0000-0000000000f4', 'c2-ene', 'refund') INTO v_result;

  ASSERT (v_result->>'recalculatedPaidMonths')::int = 2, 'FAIL c2 — racha recalculada esperada 2 (feb+mar siguen consecutivos)';
  ASSERT (v_result->>'rewardReversed')::boolean = false, 'FAIL c2 — la comisión NO debía revertirse (feb+mar = 2, todavía alcanza)';
  ASSERT v_result->>'reason' = 'still_qualifies', 'FAIL c2 — reason esperado still_qualifies';

  SELECT * INTO v_commission FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission.status = 'pending', 'FAIL c2 — la comisión debía CONSERVARSE pending, intacta';

  ASSERT EXISTS (
    SELECT 1 FROM public.referral_paid_periods
    WHERE referral_attribution_id = v_attribution_id AND period_ref = 'c2-ene' AND invalidated_at IS NOT NULL
  ), 'FAIL c2 — el período de enero sí debía quedar invalidado (solo la comisión se conserva)';

  RAISE NOTICE 'OK: caso 2 (r2/e2) — ene+feb+mar, refund ene -> feb+mar siguen siendo 2 consecutivos, recompensa CONSERVADA';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f3', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true);

DO $$
DECLARE v_stats JSONB;
BEGIN
  SELECT public.wa_get_my_referral_stats() INTO v_stats;

  ASSERT (v_stats->>'qualifiedCount')::int = 1, 'FAIL c2-stats — qualifiedCount esperado 1 (recompensa conservada)';
  ASSERT (v_stats->>'pendingAmount')::numeric = 5.00, 'FAIL c2-stats — pendingAmount esperado 5.00, sin cambios';

  RAISE NOTICE 'OK: caso 2-stats — wa_get_my_referral_stats() confirma la recompensa conservada';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 3 (r3/e3): ene+feb+mar. Refund de FEB -> ene y mar quedan
-- separados (racha vigente = 1) -> SÍ debe revertirse.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_attribution_id UUID;
  v_result JSONB;
  v_commission RECORD;
BEGIN
  v_attribution_id := pg_temp.setup_attribution(
    '00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f6', 'mat-code-r3');

  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000f6', 'c3-ene', '2026-01-15T00:00:00Z');
  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000f6', 'c3-feb', '2026-02-15T00:00:00Z');
  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000f6', 'c3-mar', '2026-03-15T00:00:00Z');

  SELECT public.wa_reverse_referral_paid_period('00000000-0000-0000-0000-0000000000f6', 'c3-feb', 'chargeback') INTO v_result;

  ASSERT (v_result->>'recalculatedPaidMonths')::int = 1, 'FAIL c3 — racha recalculada esperada 1 (ene y mar aislados)';
  ASSERT (v_result->>'rewardReversed')::boolean = true, 'FAIL c3 — la comisión SÍ debía revertirse (1 < 2)';
  ASSERT v_result->>'reason' = 'below_required_months', 'FAIL c3 — reason esperado below_required_months';

  SELECT * INTO v_commission FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission.status = 'reversed', 'FAIL c3 — status final esperado reversed';
  ASSERT v_commission.reversed_reason = 'chargeback', 'FAIL c3 — reversed_reason esperado chargeback';

  RAISE NOTICE 'OK: caso 3 (r3/e3) — ene+feb+mar, refund feb -> ene y mar aislados (racha=1), comisión reversed';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 6 (r6/e6): refund DESPUÉS de aprobada (approved -> reversed).
-- Fuerza hold_until al pasado para probar wa_mature_referral_commissions()
-- de forma aislada, sin depender de tiempo real transcurrido.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_attribution_id UUID;
  v_result JSONB;
  v_commission RECORD;
  v_matured_count INTEGER;
  v_second_mature_count INTEGER;
BEGIN
  v_attribution_id := pg_temp.setup_attribution(
    '00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f8', 'mat-code-r6');

  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000f8', 'c6-ene', '2026-01-15T00:00:00Z');
  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000f8', 'c6-feb', '2026-02-15T00:00:00Z');

  UPDATE public.referral_commissions
  SET hold_until = now() - INTERVAL '1 day'
  WHERE referral_attribution_id = v_attribution_id;

  SELECT count(*) INTO v_matured_count
  FROM public.wa_mature_referral_commissions() m
  WHERE m.commission_id = (SELECT id FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id);
  ASSERT v_matured_count = 1, 'FAIL c6 — wa_mature_referral_commissions() debía madurar esta comisión';

  SELECT * INTO v_commission FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission.status = 'approved', 'FAIL c6 — status debía ser approved tras madurar';
  ASSERT v_commission.approved_at IS NOT NULL, 'FAIL c6 — approved_at debía setearse';

  -- Segunda ejecución inmediata: idempotente, 0 filas (ya no matchea status='pending').
  SELECT count(*) INTO v_second_mature_count FROM public.wa_mature_referral_commissions();
  ASSERT v_second_mature_count = 0, 'FAIL c6 — segunda maduración inmediata no debía encontrar filas para madurar';

  -- Refund de ENE con la comisión YA approved.
  SELECT public.wa_reverse_referral_paid_period('00000000-0000-0000-0000-0000000000f8', 'c6-ene', 'refund') INTO v_result;

  ASSERT (v_result->>'recalculatedPaidMonths')::int = 1, 'FAIL c6 — racha recalculada esperada 1';
  ASSERT (v_result->>'rewardReversed')::boolean = true, 'FAIL c6 — la comisión approved SÍ debía revertirse';

  SELECT * INTO v_commission FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission.status = 'reversed', 'FAIL c6 — status final esperado reversed (approved -> reversed)';

  RAISE NOTICE 'OK: caso 6 (r6/e6) — maduración pending->approved, luego refund -> approved->reversed correctamente';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 7 (r7/e7): refund DESPUÉS de 'paid' -> manual review, SIN mutación
-- automática de la comisión. 'paid' simula el módulo de payout (fuera de
-- alcance de 5B) vía UPDATE directo, igual que hacen los diagnósticos
-- anteriores de Affiliate Core para simular estados terminales.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_attribution_id UUID;
  v_result JSONB;
  v_commission_before RECORD;
  v_commission_after RECORD;
  v_commission_dup RECORD;
  v_commission_second RECORD;
  v_manual_review_at_1 TIMESTAMPTZ;
BEGIN
  v_attribution_id := pg_temp.setup_attribution(
    '00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000fa', 'mat-code-r7');

  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000fa', 'c7-ene', '2026-01-15T00:00:00Z');
  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000fa', 'c7-feb', '2026-02-15T00:00:00Z');

  UPDATE public.referral_commissions SET status = 'paid', approved_at = now(), paid_at = now()
  WHERE referral_attribution_id = v_attribution_id;

  SELECT * INTO v_commission_before FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission_before.status = 'paid', 'FAIL c7 — setup: la comisión debía quedar paid';
  ASSERT v_commission_before.paid_at IS NOT NULL, 'FAIL c7 — setup: paid_at debía setearse';
  ASSERT v_commission_before.metadata_json = '{}'::jsonb, 'FAIL c7 — setup: metadata_json debía arrancar vacío';

  -- Primera reversión sobre la comisión paid (refund de ENE).
  SELECT public.wa_reverse_referral_paid_period('00000000-0000-0000-0000-0000000000fa', 'c7-ene', 'refund') INTO v_result;

  ASSERT (v_result->>'reversed')::boolean = true, 'FAIL c7 — el período SÍ debía invalidarse (hecho aparte de la comisión)';
  ASSERT (v_result->>'rewardReversed')::boolean = false, 'FAIL c7 — la comisión paid NO debía mutarse (status/paid_at)';
  ASSERT v_result->>'reason' = 'reward_already_paid_manual_review_required', 'FAIL c7 — reason esperado reward_already_paid_manual_review_required';
  ASSERT (v_result->>'manualReviewNewlyMarked')::boolean = true, 'FAIL c7 — la primera reversión SÍ debía marcar manual review';

  -- 1) status='paid' se conserva. 2) paid_at intacto. 3) manual_review_required
  -- durable en metadata_json. 4) razón correcta.
  SELECT * INTO v_commission_after FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission_after.status = 'paid', 'FAIL c7 — status debía seguir siendo paid, sin mutación automática';
  ASSERT v_commission_after.paid_at = v_commission_before.paid_at, 'FAIL c7 — paid_at debía permanecer intacto (byte a byte)';
  ASSERT v_commission_after.reversed_reason IS NULL, 'FAIL c7 — reversed_reason debía seguir NULL (paid nunca pasa por el camino de reversed)';
  ASSERT v_commission_after.reversed_at IS NULL, 'FAIL c7 — reversed_at debía seguir NULL (paid nunca pasa por el camino de reversed)';
  ASSERT (v_commission_after.metadata_json->>'manual_review_required')::boolean = true,
    'FAIL c7 — metadata_json.manual_review_required debía quedar true de forma durable';
  ASSERT v_commission_after.metadata_json->>'manual_review_reason' = 'refund',
    'FAIL c7 — metadata_json.manual_review_reason esperado refund';
  ASSERT v_commission_after.metadata_json->>'manual_review_period_ref' = 'c7-ene',
    'FAIL c7 — metadata_json.manual_review_period_ref esperado c7-ene (referencia no sensible al período)';
  ASSERT v_commission_after.metadata_json->>'manual_review_at' IS NOT NULL,
    'FAIL c7 — metadata_json.manual_review_at debía setearse';

  v_manual_review_at_1 := (v_commission_after.metadata_json->>'manual_review_at')::timestamptz;

  ASSERT EXISTS (
    SELECT 1 FROM public.referral_paid_periods
    WHERE referral_attribution_id = v_attribution_id AND period_ref = 'c7-ene' AND invalidated_at IS NOT NULL
  ), 'FAIL c7 — el período de enero SÍ debía quedar invalidado como evidencia histórica';

  -- 5a) Refund DUPLICADO del mismo period_ref (reintento de webhook) -> no-op
  -- ya desde el chequeo de invalidated_at -- ni siquiera llega a re-evaluar
  -- la comisión paid. manual_review_at NO debe cambiar.
  SELECT public.wa_reverse_referral_paid_period('00000000-0000-0000-0000-0000000000fa', 'c7-ene', 'refund') INTO v_result;
  ASSERT (v_result->>'alreadyInvalidated')::boolean = true, 'FAIL c7-dup — debía detectarse como ya invalidado';

  SELECT * INTO v_commission_dup FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission_dup.metadata_json = v_commission_after.metadata_json,
    'FAIL c7-dup — metadata_json no debía cambiar en absoluto ante un refund duplicado';
  ASSERT (v_commission_dup.metadata_json->>'manual_review_at')::timestamptz = v_manual_review_at_1,
    'FAIL c7-dup — manual_review_at no debía reescribirse';
  ASSERT v_commission_dup.paid_at = v_commission_before.paid_at, 'FAIL c7-dup — paid_at seguía intacto';

  -- 5b) Refund GENUINAMENTE NUEVO (period_ref distinto, c7-feb) llegado
  -- MIENTRAS la comisión ya está marcada -- sigue siendo idempotente a
  -- nivel de metadata: no reescribe manual_review_at ni manual_review_reason
  -- (aunque esta vez el motivo sea distinto, 'chargeback'), pero el período
  -- de febrero SÍ se invalida igual (hecho aparte, siempre ocurre).
  SELECT public.wa_reverse_referral_paid_period('00000000-0000-0000-0000-0000000000fa', 'c7-feb', 'chargeback') INTO v_result;
  ASSERT (v_result->>'rewardReversed')::boolean = false, 'FAIL c7-second — la comisión paid SIGUE sin mutarse';
  ASSERT v_result->>'reason' = 'reward_already_paid_manual_review_required', 'FAIL c7-second — reason esperado reward_already_paid_manual_review_required';
  ASSERT (v_result->>'manualReviewNewlyMarked')::boolean = false, 'FAIL c7-second — ya estaba marcada, no debía reportarse como nueva';

  SELECT * INTO v_commission_second FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission_second.status = 'paid', 'FAIL c7-second — status debía seguir paid';
  ASSERT v_commission_second.paid_at = v_commission_before.paid_at, 'FAIL c7-second — paid_at seguía intacto';
  ASSERT v_commission_second.metadata_json->>'manual_review_reason' = 'refund',
    'FAIL c7-second — manual_review_reason NO debía reescribirse a chargeback (primera reversión gana)';
  ASSERT (v_commission_second.metadata_json->>'manual_review_at')::timestamptz = v_manual_review_at_1,
    'FAIL c7-second — manual_review_at NO debía reescribirse por un period_ref distinto';
  ASSERT v_commission_second.metadata_json->>'manual_review_period_ref' = 'c7-ene',
    'FAIL c7-second — manual_review_period_ref debía seguir apuntando al primer período (c7-ene)';

  ASSERT EXISTS (
    SELECT 1 FROM public.referral_paid_periods
    WHERE referral_attribution_id = v_attribution_id AND period_ref = 'c7-feb' AND invalidated_at IS NOT NULL
  ), 'FAIL c7-second — el período de febrero SÍ debía invalidarse igual (independiente de la metadata)';

  RAISE NOTICE 'OK: caso 7 (r7/e7) — refund sobre comisión paid -> período invalidado, comisión intacta, manual review durable e idempotente';
END $$;

-- 6) Stats monetarios: totalEarnedAmount sigue tratando esta recompensa como
-- paid (no reversed) hasta que exista una resolución financiera manual
-- futura -- ni el primer refund ni el segundo (period_ref distinto) la
-- mueven de esa categoría.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f9', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f9','role','authenticated')::text, true);

DO $$
DECLARE v_stats JSONB;
BEGIN
  SELECT public.wa_get_my_referral_stats() INTO v_stats;

  -- totalEarnedAmount sigue contando el paid (no se tocó); pero
  -- qualifiedCount refleja la racha YA recalculada (0, ene y feb ambos
  -- invalidados) -- ambos son correctos y consistentes con el diseño: el
  -- dinero pagado requiere revisión manual, el indicador de progreso no
  -- miente sobre la racha real.
  ASSERT (v_stats->>'totalEarnedAmount')::numeric = 5.00, 'FAIL c7-stats — totalEarnedAmount esperado 5.00 (paid sin mutar, tratada como paid hasta resolución manual)';
  ASSERT (v_stats->>'availableAmount')::numeric = 0, 'FAIL c7-stats — availableAmount esperado 0 (nunca estuvo en approved)';
  ASSERT (v_stats->>'pendingAmount')::numeric = 0, 'FAIL c7-stats — pendingAmount esperado 0';
  ASSERT (v_stats->>'qualifiedCount')::int = 0, 'FAIL c7-stats — qualifiedCount esperado 0 (racha recalculada ya no alcanza, ambos períodos invalidados)';

  RAISE NOTICE 'OK: caso 7-stats — totalEarnedAmount sigue tratando la recompensa paid como ganada hasta resolución manual; qualifiedCount refleja la racha recalculada';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 8 (r8/e8): carrera — REVERSIÓN gana primero, la maduración global
-- corrida después no debe tocar la fila (ya no está en 'pending').
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_attribution_id UUID;
  v_result JSONB;
  v_commission RECORD;
BEGIN
  v_attribution_id := pg_temp.setup_attribution(
    '00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000fc', 'mat-code-r8');

  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000fc', 'c8-ene', '2026-01-15T00:00:00Z');
  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000fc', 'c8-feb', '2026-02-15T00:00:00Z');

  -- hold_until ya vencido -- la maduración "estaría lista" para correr,
  -- pero la reversión llega primero.
  UPDATE public.referral_commissions SET hold_until = now() - INTERVAL '1 day'
  WHERE referral_attribution_id = v_attribution_id;

  SELECT public.wa_reverse_referral_paid_period('00000000-0000-0000-0000-0000000000fc', 'c8-ene', 'fraud') INTO v_result;
  ASSERT (v_result->>'rewardReversed')::boolean = true, 'FAIL c8 — la reversión debía ganar la carrera y revertir pending->reversed';

  SELECT * INTO v_commission FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission.status = 'reversed', 'FAIL c8 — status debía ser reversed antes de correr la maduración';

  -- Maduración global corrida DESPUÉS: no debe tocar esta fila (ya no
  -- matchea status='pending').
  PERFORM public.wa_mature_referral_commissions();

  SELECT * INTO v_commission FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission.status = 'reversed', 'FAIL c8 — la maduración NO debía sobrescribir una fila ya reversed';
  ASSERT v_commission.approved_at IS NULL, 'FAIL c8 — approved_at debía seguir NULL (maduración nunca la tocó)';

  RAISE NOTICE 'OK: caso 8 (r8/e8) — carrera: reversión gana primero, maduración posterior no la afecta';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 9 (r9/e9): carrera — MADURACIÓN gana primero (pending->approved), la
-- reversión corrida después igual debe alcanzarla (approved->reversed).
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_attribution_id UUID;
  v_result JSONB;
  v_commission RECORD;
BEGIN
  v_attribution_id := pg_temp.setup_attribution(
    '00000000-0000-0000-0000-0000000000fd', '00000000-0000-0000-0000-0000000000fe', 'mat-code-r9');

  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000fe', 'c9-ene', '2026-01-15T00:00:00Z');
  PERFORM public.wa_register_referral_paid_period('00000000-0000-0000-0000-0000000000fe', 'c9-feb', '2026-02-15T00:00:00Z');

  UPDATE public.referral_commissions SET hold_until = now() - INTERVAL '1 day'
  WHERE referral_attribution_id = v_attribution_id;

  -- Maduración gana la carrera.
  PERFORM public.wa_mature_referral_commissions();

  SELECT * INTO v_commission FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission.status = 'approved', 'FAIL c9 — status debía ser approved tras la maduración';

  -- Reversión corrida DESPUÉS: debe alcanzarla igual (guardada por status
  -- IN ('pending','approved'), no solo 'pending').
  SELECT public.wa_reverse_referral_paid_period('00000000-0000-0000-0000-0000000000fe', 'c9-ene', 'refund') INTO v_result;
  ASSERT (v_result->>'rewardReversed')::boolean = true, 'FAIL c9 — la reversión debía alcanzar la fila ya approved';

  SELECT * INTO v_commission FROM public.referral_commissions WHERE referral_attribution_id = v_attribution_id;
  ASSERT v_commission.status = 'reversed', 'FAIL c9 — status final esperado reversed (approved -> reversed)';

  RAISE NOTICE 'OK: caso 9 (r9/e9) — carrera: maduración gana primero, reversión posterior igual la alcanza';
END $$;

DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TODOS LOS CASOS DE FASE 5B (maduración + reversión) PASARON.';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
