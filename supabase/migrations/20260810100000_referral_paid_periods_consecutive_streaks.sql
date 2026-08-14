-- ============================================================
-- Affiliate Core — Fase 5A.1: semántica temporal y rachas consecutivas.
--
-- Contexto: Fase 5A (aún sin desplegar) conecta wa_register_referral_paid_period()
-- a un pago real aprobado de Mercado Pago, usando period_ref = mp:<mp_payment_id>
-- como identidad idempotente del PAGO. Auditoría posterior encontró que
-- period_ref por sí solo no distingue "dos pagos reales distintos en el mismo
-- mes calendario" de "dos pagos reales en meses distintos" -- dos pagos
-- legítimos y no fraudulentos podían hacer que paidMonths llegara a 2 sin que
-- hubiera pasado un segundo mes real. Esta migración cierra esa brecha.
--
-- No reabre ni edita 20260808100000_referral_core_part1.sql,
-- 20260808120000_referral_core_user_centric.sql ni
-- 20260809100000_affiliate_panel_read_rpcs.sql -- las tres quedan intactas
-- como historia verificable. Esta migración evoluciona por encima, igual que
-- 20260808120000 evolucionó sobre 20260808100000.
--
-- Evidencia de que referral_paid_periods está vacía en producción hoy
-- (repositorio, no acceso remoto): wa_register_referral_paid_period() es la
-- ÚNICA función que inserta en esta tabla (comentario original de la tabla:
-- "Se crea exclusivamente vía wa_register_referral_paid_period()"), está
-- restringida a service_role, y una búsqueda exhaustiva de su nombre en todo
-- el código de aplicación (backend/, supabase/functions/, api/) fuera de
-- migraciones/diagnostics no encuentra ningún llamador -- Fase 5A (el primer
-- código que la invoca) todavía no está commiteada ni desplegada. No hay
-- ninguna otra vía, humana o automática, para que exista una fila hoy.
-- Aun así, por seguridad, el ADD COLUMN de más abajo es defensivo (nullable
-- -> backfill -> validar -> NOT NULL), no una suposición de tabla vacía: si
-- alguna fila inesperada existiera, el backfill la cubre en vez de fallar.
--
-- Definición funcional de paidMonths (única, para escritura Y lectura):
-- "Racha Consecutiva Vigente" = longitud de la racha de period_month
-- consecutivos que CONTIENE el period_month más reciente registrado para esa
-- atribución. Ejemplos (ver wa_referral_current_streak_months más abajo):
--   ene                     -> 1
--   ene, feb                -> 2
--   ene, ene (rechazado)    -> 1
--   ene, mar                -> 1  (mar es su propia racha de 1; ene queda aislado)
--   ene, mar, abr            -> 2  (mar+abr forman racha de 2; ene queda aislado)
--   ene, feb, abr            -> 1  (abr es su propia racha de 1)
--   ene, feb, abr, may        -> 2  (abr+may forman racha de 2)
-- El historial completo se conserva siempre -- nunca se borra ni se
-- sobrescribe una fila anterior para "reiniciar" una racha.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. referral_paid_periods: agregar period_month (defensivo, no asume tabla
--    vacía aunque la evidencia del repositorio indique que lo está).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.referral_paid_periods
  ADD COLUMN IF NOT EXISTS period_month DATE NULL;

-- Backfill defensivo: si existiera alguna fila (no debería, ver evidencia
-- arriba), se aproxima su mes real con created_at -- la única fecha
-- disponible en filas creadas antes de que existiera p_period_start.
UPDATE public.referral_paid_periods
SET period_month = date_trunc('month', created_at)::date
WHERE period_month IS NULL;

DO $$
DECLARE
  v_unresolved_count INTEGER;
BEGIN
  SELECT count(*) INTO v_unresolved_count
  FROM public.referral_paid_periods
  WHERE period_month IS NULL;

  IF v_unresolved_count > 0 THEN
    RAISE EXCEPTION
      'referral_paid_periods: % fila(s) no se pudieron backfillear a period_month. Migración detenida -- requiere resolución manual, no se adivina.',
      v_unresolved_count;
  END IF;
END $$;

ALTER TABLE public.referral_paid_periods
  ALTER COLUMN period_month SET NOT NULL;

-- Un negocio referido puede tener como mucho UN período registrado por mes
-- calendario, sin importar cuántos pagos reales distintos (period_ref
-- distintos) hayan ocurrido ese mes -- ver "duplicate_billing_month" en
-- wa_register_referral_paid_period(). Esto es lo que resuelve la brecha de
-- la auditoría: dos pagos reales del mismo mes ya no pueden sumar dos meses.
CREATE UNIQUE INDEX IF NOT EXISTS referral_paid_periods_attribution_month_uq
  ON public.referral_paid_periods(referral_attribution_id, period_month);

COMMENT ON TABLE public.referral_paid_periods IS
  'Ledger canónico de progreso hacia la recompensa: un período pagado real, confirmado por Billing, es una fila. period_ref identifica el PAGO real (idempotencia por pago); period_month identifica el MES calendario real de ese pago (idempotencia por mes, evita que dos pagos del mismo mes cuenten como dos meses). paidMonths se DERIVA vía wa_referral_current_streak_months() -- la Racha Consecutiva Vigente, no un COUNT(*) simple -- y es la MISMA función que usan wa_register_referral_paid_period(), wa_get_my_referral_stats() y wa_list_my_referrals(), para que escritura y lectura nunca puedan divergir. Se crea exclusivamente vía wa_register_referral_paid_period() (service_role). Ninguna fila se borra ni se sobrescribe jamás -- el historial completo se conserva, incluidas las filas que quedaron fuera de la racha vigente.';
COMMENT ON COLUMN public.referral_paid_periods.period_ref IS
  'Clave idempotente OPACA del PAGO real que Billing entrega (p.ej. "mp:<mp_payment_id>"). Affiliate Core no la interpreta -- solo garantiza que el mismo (referral_attribution_id, period_ref) nunca se cuenta dos veces (reason: duplicate_period).';
COMMENT ON COLUMN public.referral_paid_periods.period_month IS
  'Mes calendario real del período pagado, derivado internamente por wa_register_referral_paid_period() a partir de p_period_start (TRUNC a primer día del mes) -- Billing entrega la fecha real, Affiliate Core decide el mes. UNIQUE por (referral_attribution_id, period_month): un segundo pago real en el mismo mes se rechaza (reason: duplicate_billing_month), nunca suma un segundo mes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wa_referral_current_streak_months(p_attribution_id) — única definición de
--    "Racha Consecutiva Vigente", reutilizada por escritura y lectura. Helper
--    interno, no expuesto como parte de la API pública (sin GRANT a
--    anon/authenticated): solo lo llaman las tres funciones DEFINER de abajo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_referral_current_streak_months(p_attribution_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Truco estándar de "islas y espacios": restar (ROW_NUMBER() * 1 mes) a
  -- cada period_month ordenado produce un valor CONSTANTE por cada racha de
  -- meses consecutivos maximal. Agrupar por ese valor y quedarse con el
  -- grupo que contiene el period_month más reciente da la racha vigente.
  WITH ordered AS (
    SELECT
      period_month,
      period_month - (ROW_NUMBER() OVER (ORDER BY period_month))::int * INTERVAL '1 month' AS streak_key
    FROM public.referral_paid_periods
    WHERE referral_attribution_id = p_attribution_id
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
  'Única definición de "Racha Consecutiva Vigente" (longitud de la racha de period_month consecutivos que contiene el más reciente) para una atribución. Reutilizada sin duplicar lógica por wa_register_referral_paid_period() (escritura), wa_get_my_referral_stats() y wa_list_my_referrals() (lectura) -- las tres SIEMPRE calculan paidMonths igual. Helper interno: sin GRANT a anon/authenticated, no es API pública.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. wa_register_referral_paid_period(p_referred_user_id, p_period_ref,
--    p_period_start) — nueva firma. Retira la anterior de 2 argumentos para
--    que PostgREST no exponga dos overloads.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.wa_register_referral_paid_period(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.wa_register_referral_paid_period(
  p_referred_user_id UUID,
  p_period_ref TEXT,
  p_period_start TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_ref    TEXT := btrim(COALESCE(p_period_ref, ''));
  v_period_month  DATE;
  v_attribution   public.referral_attributions%ROWTYPE;
  v_paid_months   INTEGER;
  v_terms         public.referral_program_terms%ROWTYPE;
  v_commission_id UUID;
  v_constraint    TEXT;
BEGIN
  IF p_referred_user_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_REFERRED_USER_ID' USING ERRCODE = 'P0001';
  END IF;
  IF v_period_ref = '' THEN
    RAISE EXCEPTION 'MISSING_PERIOD_REF' USING ERRCODE = 'P0001';
  END IF;
  IF p_period_start IS NULL THEN
    RAISE EXCEPTION 'MISSING_PERIOD_START' USING ERRCODE = 'P0001';
  END IF;

  -- Billing entrega la fecha real del período (p.ej. plan_activated_at de
  -- Mercado Pago); Affiliate Core decide el mes -- Billing no necesita saber
  -- nada sobre "truncar a mes", solo entregar cuándo empezó el período real.
  v_period_month := date_trunc('month', p_period_start)::date;

  SELECT * INTO v_attribution
  FROM public.referral_attributions
  WHERE referred_user_id = p_referred_user_id
    AND status = 'qualified';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('registered', false, 'reason', 'no_qualified_attribution');
  END IF;

  -- Idempotencia dura, distinguida por CONSTRAINT_NAME (no por texto de
  -- error): el mismo pago real (period_ref) nunca se cuenta dos veces
  -- (duplicate_period); un pago real DISTINTO en el mismo mes calendario
  -- tampoco (duplicate_billing_month) -- eso es lo que cierra la brecha que
  -- encontró la auditoría (dos pagos reales del mismo mes ya no pueden sumar
  -- dos meses). Ninguno de los dos crea una fila ni una recompensa.
  BEGIN
    INSERT INTO public.referral_paid_periods (referral_attribution_id, referred_user_id, period_ref, period_month)
    VALUES (v_attribution.id, p_referred_user_id, v_period_ref, v_period_month);
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'referral_paid_periods_attribution_month_uq' THEN
        RETURN jsonb_build_object('registered', false, 'reason', 'duplicate_billing_month');
      END IF;
      -- Cualquier otro unique_violation en este INSERT (hoy, solo puede ser
      -- referral_paid_periods_attribution_period_uq) es el mismo pago real.
      RETURN jsonb_build_object('registered', false, 'reason', 'duplicate_period');
  END;

  -- paid_months = Racha Consecutiva Vigente (única definición, compartida
  -- con wa_get_my_referral_stats() y wa_list_my_referrals() vía el mismo
  -- helper) -- ya NO es un COUNT(*) simple sobre todo el historial.
  v_paid_months := public.wa_referral_current_streak_months(v_attribution.id);

  SELECT * INTO v_terms FROM public.referral_program_terms LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFERRAL_PROGRAM_TERMS_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  IF v_paid_months < v_terms.required_paid_months THEN
    RETURN jsonb_build_object('registered', true, 'paidMonths', v_paid_months, 'rewardCreated', false);
  END IF;

  -- Ya se otorgó la recompensa antes (llamadas posteriores tras alcanzar el
  -- umbral, incluso en una racha vigente distinta más adelante, no deben
  -- crear una segunda) -- chequeo explícito, además del UNIQUE parcial de
  -- referral_commissions como backstop de carrera (capturado más abajo).
  IF EXISTS (
    SELECT 1 FROM public.referral_commissions
    WHERE referral_attribution_id = v_attribution.id AND kind = 'qualification_reward'
  ) THEN
    RETURN jsonb_build_object('registered', true, 'paidMonths', v_paid_months, 'rewardCreated', false, 'reason', 'already_rewarded');
  END IF;

  INSERT INTO public.referral_commissions (
    referral_attribution_id, referrer_user_id, kind,
    reward_amount, reward_currency, required_paid_months, terms_version,
    status, hold_until
  ) VALUES (
    v_attribution.id, v_attribution.referrer_user_id, 'qualification_reward',
    v_terms.reward_amount, v_terms.reward_currency, v_terms.required_paid_months, v_terms.version,
    'pending', now() + make_interval(days => v_terms.hold_days)
  )
  RETURNING id INTO v_commission_id;

  RETURN jsonb_build_object('registered', true, 'paidMonths', v_paid_months, 'rewardCreated', true, 'commissionId', v_commission_id);
EXCEPTION
  WHEN unique_violation THEN
    -- Carrera entre dos llamadas concurrentes que ambas vieron paid_months
    -- >= required_paid_months al mismo tiempo: no-op idempotente, no error.
    RETURN jsonb_build_object('registered', true, 'rewardCreated', false, 'reason', 'already_rewarded');
END;
$$;

REVOKE ALL ON FUNCTION public.wa_register_referral_paid_period(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_register_referral_paid_period(UUID, TEXT, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.wa_register_referral_paid_period(UUID, TEXT, TIMESTAMPTZ) IS
  'Única interfaz entre Billing y Affiliate Core. Billing confirma un pago real y entrega (referred_user_id, period_ref idempotente por pago, period_start = fecha real del período); Affiliate Core deriva period_month internamente y calcula paidMonths como la Racha Consecutiva Vigente (wa_referral_current_streak_months) -- no un conteo histórico simple. Idempotente en dos niveles: mismo period_ref -> duplicate_period; period_ref distinto pero mismo period_month -> duplicate_billing_month. Ninguno de los dos inserta una fila ni una recompensa. Registra el progreso en referral_paid_periods (nunca borra filas previas) y crea qualification_reward al llegar la racha vigente a referral_program_terms.required_paid_months. Restringida a service_role.';

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. wa_get_my_referral_stats() y wa_list_my_referrals() — mismo contrato
--    externo (mismo shape de JSON), solo cambia el cálculo interno de
--    paidMonths para usar wa_referral_current_streak_months() en vez de
--    COUNT(rpp.id). Sin esto, lectura y escritura podrían divergir.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_get_my_referral_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id             UUID := auth.uid();
  v_code                TEXT;
  v_terms                public.referral_program_terms%ROWTYPE;
  v_invited_count        INTEGER;
  v_one_month_count      INTEGER;
  v_qualified_count      INTEGER;
  v_pending_amount        NUMERIC(12,2);
  v_available_amount      NUMERIC(12,2);
  v_total_earned_amount   NUMERIC(12,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT public.wa_get_or_create_my_referral_code() INTO v_code;

  SELECT * INTO v_terms FROM public.referral_program_terms LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFERRAL_PROGRAM_TERMS_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_invited_count
  FROM public.referral_attributions
  WHERE referrer_user_id = v_user_id AND status <> 'disqualified';

  -- oneMonthCount / qualifiedCount: por Racha Consecutiva Vigente (misma
  -- definición exacta que usa wa_register_referral_paid_period() para
  -- decidir la recompensa -- nunca un COUNT(*) simple de referral_paid_periods).
  SELECT
    count(*) FILTER (WHERE progress.paid_months = 1),
    count(*) FILTER (WHERE progress.paid_months >= v_terms.required_paid_months)
  INTO v_one_month_count, v_qualified_count
  FROM (
    SELECT ra.id, public.wa_referral_current_streak_months(ra.id) AS paid_months
    FROM public.referral_attributions ra
    WHERE ra.referrer_user_id = v_user_id AND ra.status <> 'disqualified'
  ) progress;

  SELECT
    COALESCE(SUM(reward_amount) FILTER (WHERE status = 'pending'), 0),
    COALESCE(SUM(reward_amount) FILTER (WHERE status = 'approved'), 0),
    COALESCE(SUM(reward_amount) FILTER (WHERE status IN ('approved', 'paid')), 0)
  INTO v_pending_amount, v_available_amount, v_total_earned_amount
  FROM public.referral_commissions
  WHERE referrer_user_id = v_user_id;

  RETURN jsonb_build_object(
    'code',               v_code,
    'rewardAmount',       v_terms.reward_amount,
    'rewardCurrency',     v_terms.reward_currency,
    'requiredPaidMonths', v_terms.required_paid_months,
    'invitedCount',       v_invited_count,
    'oneMonthCount',      v_one_month_count,
    'qualifiedCount',     v_qualified_count,
    'pendingAmount',      v_pending_amount,
    'availableAmount',    v_available_amount,
    'totalEarnedAmount',  v_total_earned_amount
  );
END;
$$;

COMMENT ON FUNCTION public.wa_get_my_referral_stats() IS
  'Resumen agregado del programa de afiliados para el caller (auth.uid()) como referidor: código propio (lo crea si no existe, vía wa_get_or_create_my_referral_code()), términos vigentes, conteos de progreso (invitedCount/oneMonthCount/qualifiedCount, estos dos últimos basados en la Racha Consecutiva Vigente de wa_referral_current_streak_months(), misma definición que usa la escritura) y montos por estado de recompensa (pendingAmount/availableAmount/totalEarnedAmount). Nunca expone datos de otros usuarios.';

CREATE OR REPLACE FUNCTION public.wa_list_my_referrals(
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_limit   INTEGER;
  v_offset  INTEGER;
  v_terms   public.referral_program_terms%ROWTYPE;
  v_result  JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT * INTO v_terms FROM public.referral_program_terms LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFERRAL_PROGRAM_TERMS_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'publicLabel', 'Usuario #' || upper(right(ra.id::text, 4)),
        'createdAt',   ra.created_at,
        'paidMonths',  streak.paid_months,
        'qualified',   streak.paid_months >= v_terms.required_paid_months
      ) AS row_data
    FROM public.referral_attributions ra
    CROSS JOIN LATERAL (SELECT public.wa_referral_current_streak_months(ra.id) AS paid_months) streak
    WHERE ra.referrer_user_id = v_user_id AND ra.status <> 'disqualified'
    ORDER BY ra.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) sub;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.wa_list_my_referrals(INTEGER, INTEGER) IS
  'Lista paginada (p_limit default 20, máximo 100; p_offset >= 0, clamp server-side) de los referidos del caller (auth.uid()) como referidor, más reciente primero. paidMonths/qualified se calculan vía wa_referral_current_streak_months() -- Racha Consecutiva Vigente, misma definición exacta que usa la escritura (wa_register_referral_paid_period) y wa_get_my_referral_stats(). Cada fila expone únicamente publicLabel (anónimo, derivado del id de atribución), createdAt, paidMonths y qualified -- nunca email, nombre real, user_id ni business_id.';

NOTIFY pgrst, 'reload schema';
