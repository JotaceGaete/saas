-- ============================================================
-- Affiliate Core — Fase 5B: maduración y reversión de recompensas.
--
-- No reabre ninguna de las 3 migraciones anteriores de Affiliate Core
-- (20260808100000, 20260808120000, 20260810100000) -- todas quedan
-- intactas como historia verificable. Este archivo evoluciona por encima,
-- mismo patrón que ellas.
--
-- Alcance:
--   1. referral_paid_periods: agrega invalidated_at/invalidated_reason
--      (ADITIVO -- nunca se hace DELETE ni se sobrescribe period_ref/
--      period_month/created_at, preservando el invariante explícito de
--      20260810100000: "Ninguna fila se borra ni se sobrescribe jamás").
--   2. wa_referral_current_streak_months(): único cambio de comportamiento
--      de esta migración -- excluye períodos invalidados del cálculo de
--      racha. Sigue siendo la ÚNICA definición de "meses pagados",
--      reutilizada sin duplicar lógica por escritura (wa_register_
--      referral_paid_period), lectura (wa_get_my_referral_stats,
--      wa_list_my_referrals) y la nueva reversión (wa_reverse_referral_
--      paid_period). Ninguna de esas 4 funciones se reabre en este
--      archivo salvo la propia wa_referral_current_streak_months --
--      las otras 3 heredan el comportamiento nuevo automáticamente por
--      construcción, sin tocarlas.
--   3. wa_mature_referral_commissions(): pending -> approved cuando
--      hold_until venció. UPDATE atómico, idempotente por construcción.
--   4. wa_reverse_referral_paid_period(): invalida un período pagado
--      real (nunca lo borra) y SOLO revierte la recompensa si, tras
--      recalcular la racha vigente excluyendo inválidos, esa racha ya no
--      alcanza el required_paid_months que la propia comisión guarda
--      como snapshot inmutable. Si la racha remanente todavía alcanza,
--      la recompensa se conserva intacta. Si la comisión ya está 'paid',
--      no se muta automáticamente -- se devuelve
--      'reward_already_paid_manual_review_required'.
--   5. pg_cron: corre wa_mature_referral_commissions() cada hora, mismo
--      patrón exacto que enforce-expired-plans-hourly (20260530000000):
--      SQL directo vía cron.schedule, sin edge function, sin vault.
--   6. mp-webhook (fuera de este archivo, en supabase/functions/mp-webhook/):
--      ahora maneja explícitamente los status 'refunded'/'charged_back' de
--      Mercado Pago y llama a wa_reverse_referral_paid_period(). No se
--      toca acá -- ver lib.ts/index.ts de esa función.
--
-- FUERA DE ALCANCE, a propósito (sin tocar en este archivo):
--   - PayPal: no llama wa_register_referral_paid_period() hoy (gap de
--     Fase 5A, no de esta), por lo tanto tampoco se conecta su reversión.
--   - Módulo de payout/retiro al afiliado (approved -> paid): sigue sin
--     RPC, como ya estaba. 'paid' es explícitamente terminal para
--     reversión automática en esta fase.
--   - /afiliados (frontend): wa_get_my_referral_stats() y
--     wa_list_my_referrals() NO se redefinen en este archivo -- ya
--     reflejan correctamente el estado post-invalidación porque ambas
--     reutilizan wa_referral_current_streak_months() (paidMonths/
--     qualifiedCount) y referral_commissions.status (pendingAmount/
--     availableAmount/totalEarnedAmount), que sí cambia. Ver diagnóstico
--     para la verificación explícita de este punto.
--   - Firma de wa_register_referral_paid_period(): sin cambios. Ya está
--     en producción (mp-webhook la invoca en el commit actual) -- esta
--     fase no la toca.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. referral_paid_periods: invalidación aditiva.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.referral_paid_periods
  ADD COLUMN IF NOT EXISTS invalidated_at     TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS invalidated_reason TEXT        NULL;

ALTER TABLE public.referral_paid_periods
  DROP CONSTRAINT IF EXISTS referral_paid_periods_invalidated_reason_check;
ALTER TABLE public.referral_paid_periods
  ADD CONSTRAINT referral_paid_periods_invalidated_reason_check
  CHECK (invalidated_reason IS NULL OR invalidated_reason IN ('refund', 'chargeback', 'fraud', 'manual'));

-- Consistencia: invalidated_at e invalidated_reason se setean juntos, o
-- ninguno de los dos -- nunca un período "a medio invalidar".
ALTER TABLE public.referral_paid_periods
  DROP CONSTRAINT IF EXISTS referral_paid_periods_invalidated_consistency_check;
ALTER TABLE public.referral_paid_periods
  ADD CONSTRAINT referral_paid_periods_invalidated_consistency_check
  CHECK ((invalidated_at IS NULL) = (invalidated_reason IS NULL));

CREATE INDEX IF NOT EXISTS referral_paid_periods_invalidated_idx
  ON public.referral_paid_periods(referral_attribution_id)
  WHERE invalidated_at IS NOT NULL;

COMMENT ON COLUMN public.referral_paid_periods.invalidated_at IS
  'NULL = período válido, cuenta para la racha. NO NULL = el pago real detrás de este período fue refund/chargeback/fraude/manual -- wa_referral_current_streak_months() lo excluye del cálculo. La fila NUNCA se borra ni se sobrescribe (period_ref/period_month/created_at quedan intactos como evidencia histórica de que el pago ocurrió) -- esto es solo una marca aditiva. Se escribe exclusivamente vía wa_reverse_referral_paid_period() (service_role).';
COMMENT ON COLUMN public.referral_paid_periods.invalidated_reason IS
  'refund | chargeback | fraud | manual. NULL si invalidated_at es NULL (consistencia forzada por constraint).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wa_referral_current_streak_months(): excluir períodos invalidados.
--    Único cambio de comportamiento de esta migración -- todo lo demás que
--    depende de esta función (escritura, lecturas, nueva reversión) hereda
--    el comportamiento correcto automáticamente, sin tocarse.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_referral_current_streak_months(p_attribution_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Mismo truco de "islas y espacios" que 20260810100000, con un único
  -- agregado: WHERE invalidated_at IS NULL. Un período invalidado (refund/
  -- chargeback/fraude/manual) no cuenta como mes pagado real y no participa
  -- de ninguna racha -- ni como parte de una racha existente, ni partiendo
  -- una en dos. Ejemplo (ver tests): ene+feb+mar consecutivos, se invalida
  -- ene -> feb+mar siguen siendo una racha de 2 (no se rompen entre sí por
  -- la ausencia de ene). Si se invalida feb en cambio -> ene y mar quedan
  -- cada uno aislado (racha de 1), porque el hueco entre ellos ya no lo
  -- llena ningún period_month válido.
  WITH ordered AS (
    SELECT
      period_month,
      period_month - (ROW_NUMBER() OVER (ORDER BY period_month))::int * INTERVAL '1 month' AS streak_key
    FROM public.referral_paid_periods
    WHERE referral_attribution_id = p_attribution_id
      AND invalidated_at IS NULL
  )
  SELECT COALESCE(
    (
      SELECT count(*)::INTEGER
      FROM ordered
      WHERE streak_key = (SELECT streak_key FROM ordered ORDER BY period_month DESC LIMIT 1)
    ),
    0
  );
$$;

REVOKE ALL ON FUNCTION public.wa_referral_current_streak_months(UUID) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_referral_current_streak_months(UUID) IS
  'Única definición de "Racha Consecutiva Vigente" para una atribución -- longitud de la racha de period_month consecutivos, EXCLUYENDO invalidados (invalidated_at IS NOT NULL), que contiene el más reciente period_month válido. Reutilizada sin duplicar lógica por wa_register_referral_paid_period() (escritura), wa_get_my_referral_stats()/wa_list_my_referrals() (lectura) y wa_reverse_referral_paid_period() (reversión) -- las cuatro SIEMPRE calculan paidMonths igual. Helper interno: sin GRANT a anon/authenticated, no es API pública.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. wa_mature_referral_commissions() — pending -> approved cuando venció
--    hold_until. UPDATE de conjunto único: atómico e idempotente por
--    construcción (una segunda ejecución, cron duplicado o reintento, no
--    encuentra filas que matcheen el WHERE y no hace nada).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_mature_referral_commissions()
RETURNS TABLE (commission_id UUID, referrer_user_id UUID, approved_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.referral_commissions
  SET status = 'approved', approved_at = now()
  WHERE status = 'pending'
    AND hold_until IS NOT NULL
    AND hold_until <= now()
  RETURNING id, referrer_user_id, approved_at;
$$;

REVOKE ALL ON FUNCTION public.wa_mature_referral_commissions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_mature_referral_commissions() TO service_role;

COMMENT ON FUNCTION public.wa_mature_referral_commissions() IS
  'Madura recompensas: pending -> approved cuando hold_until ya venció. UPDATE de conjunto único (sin SELECT previo desde afuera) -- seguro para correr por cron cada hora, y seguro ante ejecuciones duplicadas o solapadas: una fila ya aprobada no vuelve a matchear status=''pending''. No toca reversed ni paid. Restringida a service_role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. wa_reverse_referral_paid_period(p_referred_user_id, p_period_ref,
--    p_reason) — invalida un período pagado real y SOLO revierte la
--    recompensa si, tras excluirlo, la racha vigente ya no alcanza el
--    required_paid_months que la propia comisión guarda como snapshot.
--
--    Contrato explícito (no asumir "invalidar implica revertir"):
--      a) localizar el referral_paid_period por (attribution, period_ref);
--      b) marcarlo aditivamente (invalidated_at/invalidated_reason) --
--         nunca DELETE, nunca se sobrescribe period_ref/period_month;
--      c) recalcular la racha válida vía wa_referral_current_streak_months()
--         (única fuente de verdad, ya excluye inválidos);
--      d) comparar contra referral_commissions.required_paid_months de la
--         PROPIA comisión (snapshot inmutable al momento de otorgarla) --
--         NUNCA contra referral_program_terms vigente, que pudo cambiar;
--      e) solo pasar pending/approved -> reversed si el resultado de (d)
--         es insuficiente;
--      f) si la racha remanente todavía alcanza, la recompensa se
--         conserva intacta, sin tocarla;
--      g) si la comisión ya está 'paid', no se muta -- se devuelve
--         'reward_already_paid_manual_review_required'.
--
--    Idempotencia: un período ya invalidado (invalidated_at IS NOT NULL)
--    es no-op inmediato -- un refund/chargeback duplicado (reintento de
--    webhook) no vuelve a evaluar ni a mutar nada. La transición de la
--    comisión está guardada por su status ACTUAL en el UPDATE mismo
--    (WHERE status IN ('pending','approved')), no por una lectura previa
--    -- esto es lo que hace segura la carrera contra
--    wa_mature_referral_commissions(): si la maduración ganó primero
--    (pending->approved), esta función igual alcanza la fila porque
--    'approved' está en el WHERE; si la reversión ganó primero, la
--    maduración ya no encuentra status='pending' después.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_reverse_referral_paid_period(
  p_referred_user_id UUID,
  p_period_ref TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_ref                  TEXT := btrim(COALESCE(p_period_ref, ''));
  v_attribution                 public.referral_attributions%ROWTYPE;
  v_period                      public.referral_paid_periods%ROWTYPE;
  v_commission                  public.referral_commissions%ROWTYPE;
  v_recalc_months               INTEGER;
  v_reward_reversed             BOOLEAN;
  v_manual_review_newly_marked  BOOLEAN;
BEGIN
  IF p_referred_user_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_REFERRED_USER_ID' USING ERRCODE = 'P0001';
  END IF;
  IF v_period_ref = '' THEN
    RAISE EXCEPTION 'MISSING_PERIOD_REF' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('refund', 'chargeback', 'fraud', 'manual') THEN
    RAISE EXCEPTION 'INVALID_REASON' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_attribution
  FROM public.referral_attributions
  WHERE referred_user_id = p_referred_user_id
    AND status = 'qualified';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('reversed', false, 'reason', 'no_qualified_attribution');
  END IF;

  SELECT * INTO v_period
  FROM public.referral_paid_periods
  WHERE referral_attribution_id = v_attribution.id
    AND period_ref = v_period_ref;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('reversed', false, 'reason', 'period_not_found');
  END IF;

  -- Idempotencia dura: refund/chargeback duplicado del mismo pago (reintento
  -- de webhook) -- no-op inmediato, sin reevaluar nada. Lo que se haya
  -- decidido la primera vez ya quedó resuelto.
  IF v_period.invalidated_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'reversed', true,
      'alreadyInvalidated', true,
      'rewardReversed', false,
      'reason', 'already_invalidated'
    );
  END IF;

  -- (a)+(b): localizar (ya hecho arriba) y marcar ADITIVAMENTE -- NUNCA
  -- DELETE, NUNCA se sobreescriben period_ref/period_month/created_at.
  UPDATE public.referral_paid_periods
  SET invalidated_at = now(), invalidated_reason = p_reason
  WHERE id = v_period.id;

  -- (c): recalcular la racha vigente EXCLUYENDO inválidos --
  -- wa_referral_current_streak_months() sigue siendo la única fuente de
  -- verdad (ya filtra invalidated_at IS NULL); no se duplica el algoritmo.
  v_recalc_months := public.wa_referral_current_streak_months(v_attribution.id);

  SELECT * INTO v_commission
  FROM public.referral_commissions
  WHERE referral_attribution_id = v_attribution.id
    AND kind = 'qualification_reward';

  IF NOT FOUND THEN
    -- Nunca se alcanzó el umbral -- no hay recompensa que evaluar, solo se
    -- invalidó el período (afecta el progreso mostrado, nada más).
    RETURN jsonb_build_object(
      'reversed', true,
      'rewardReversed', false,
      'recalculatedPaidMonths', v_recalc_months,
      'reason', 'no_reward_exists'
    );
  END IF;

  -- (g): 'paid' es terminal para reversión automática -- status y paid_at
  -- NUNCA se mutan acá. Pero el caso no puede vivir solo como respuesta de
  -- RPC/log del webhook: se deja evidencia durable en metadata_json para
  -- que una revisión manual/financiera futura (fuera de alcance de 5B) lo
  -- pueda encontrar. "Primera reversión marca, escrituras posteriores no
  -- reescriben": el UPDATE está guardado por
  -- COALESCE((metadata_json->>'manual_review_required')::boolean, false) = false,
  -- así que ni un refund duplicado del MISMO period_ref (que además ya
  -- corta antes por el chequeo de v_period.invalidated_at más arriba) ni un
  -- refund genuinamente distinto sobre OTRO period_ref de la misma
  -- atribución, llegado mientras ya está marcada, pisan manual_review_at ni
  -- manual_review_reason -- el primer evento es el que queda registrado.
  IF v_commission.status = 'paid' THEN
    UPDATE public.referral_commissions
    SET metadata_json = metadata_json || jsonb_build_object(
          'manual_review_required',   true,
          'manual_review_reason',     p_reason,
          'manual_review_at',         now(),
          'manual_review_period_ref', v_period_ref
        )
    WHERE id = v_commission.id
      AND COALESCE((metadata_json->>'manual_review_required')::boolean, false) = false
    RETURNING true INTO v_manual_review_newly_marked;

    RETURN jsonb_build_object(
      'reversed', true,
      'rewardReversed', false,
      'recalculatedPaidMonths', v_recalc_months,
      'reason', 'reward_already_paid_manual_review_required',
      'manualReviewNewlyMarked', COALESCE(v_manual_review_newly_marked, false),
      'commissionId', v_commission.id
    );
  END IF;

  IF v_commission.status = 'reversed' THEN
    RETURN jsonb_build_object(
      'reversed', true,
      'rewardReversed', false,
      'recalculatedPaidMonths', v_recalc_months,
      'reason', 'already_reversed',
      'commissionId', v_commission.id
    );
  END IF;

  -- (d)+(f): comparar contra el SNAPSHOT de la propia comisión
  -- (required_paid_months tal como estaba cuando se otorgó), NUNCA contra
  -- referral_program_terms vigente. Si la racha remanente todavía alcanza
  -- (p.ej. ene+feb+mar, se invalida ene -> feb+mar siguen siendo 2
  -- consecutivos), la recompensa se conserva intacta, sin tocarla.
  IF v_recalc_months >= v_commission.required_paid_months THEN
    RETURN jsonb_build_object(
      'reversed', true,
      'rewardReversed', false,
      'recalculatedPaidMonths', v_recalc_months,
      'reason', 'still_qualifies',
      'commissionId', v_commission.id
    );
  END IF;

  -- (e): la racha remanente ya NO alcanza -- revertir. Guardado por status
  -- ACTUAL en el propio UPDATE (no por la lectura de v_commission de más
  -- arriba, que puede haber quedado desactualizada por una carrera): esto
  -- es lo que hace seguro el cruce con wa_mature_referral_commissions() y
  -- con una segunda reversión concurrente del mismo period_ref.
  UPDATE public.referral_commissions
  SET status = 'reversed', reversed_reason = p_reason, reversed_at = now()
  WHERE id = v_commission.id
    AND status IN ('pending', 'approved')
  RETURNING true INTO v_reward_reversed;

  RETURN jsonb_build_object(
    'reversed', true,
    'rewardReversed', COALESCE(v_reward_reversed, false),
    'recalculatedPaidMonths', v_recalc_months,
    'reason', CASE WHEN v_reward_reversed THEN 'below_required_months' ELSE 'race_lost_commission_not_pending_or_approved' END,
    'commissionId', v_commission.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wa_reverse_referral_paid_period(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_reverse_referral_paid_period(UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.wa_reverse_referral_paid_period(UUID, TEXT, TEXT) IS
  'Billing (mp-webhook hoy; PayPal cuando registre períodos) confirma un refund/chargeback real y entrega (referred_user_id, period_ref idempotente del pago, reason). Invalida el referral_paid_period correspondiente de forma ADITIVA (nunca DELETE) y recalcula la racha vigente vía wa_referral_current_streak_months() (única fuente de verdad, excluye inválidos). Invalidar un período NO implica automáticamente revertir la recompensa: solo la revierte (pending/approved -> reversed) si, comparado contra el required_paid_months que la propia comisión guarda como snapshot inmutable, la racha remanente ya no alcanza. Si la racha remanente sigue alcanzando, conserva la recompensa intacta. Si la comisión ya está ''paid'', NUNCA muta status ni paid_at -- pero deja evidencia durable en metadata_json (manual_review_required/manual_review_reason/manual_review_at/manual_review_period_ref) para que una revisión manual/financiera futura (fuera de alcance de 5B) pueda encontrar el caso; solo la PRIMERA reversión sobre un reward paid escribe esos campos -- eventos posteriores (mismo period_ref duplicado, u otro period_ref distinto llegado mientras ya está marcada) no los reescriben. Devuelve reward_already_paid_manual_review_required en todos los casos de comisión paid. Idempotente: un period_ref ya invalidado es no-op. Restringida a service_role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. pg_cron: correr wa_mature_referral_commissions() cada hora -- mismo
--    patrón exacto que enforce-expired-plans-hourly (20260530000000).
-- ─────────────────────────────────────────────────────────────────────────────

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mature-referral-commissions-hourly') THEN
      PERFORM cron.unschedule('mature-referral-commissions-hourly');
    END IF;

    PERFORM cron.schedule(
      'mature-referral-commissions-hourly',
      '0 * * * *',
      'SELECT public.wa_mature_referral_commissions()'
    );

    RAISE NOTICE 'pg_cron job mature-referral-commissions-hourly configurado.';
  ELSE
    RAISE NOTICE 'pg_cron no está disponible. Llamar wa_mature_referral_commissions() manualmente o via edge function.';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
