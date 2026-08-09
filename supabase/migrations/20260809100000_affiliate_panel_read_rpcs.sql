-- ============================================================
-- Panel de Afiliados — RPCs de lectura únicamente.
--
-- Alcance de esta migración: exclusivamente 2 funciones nuevas,
-- SECURITY DEFINER, de solo lectura, para alimentar /afiliados.
-- NO ALTERA ninguna tabla, NO toca RLS, NO toca las 4 RPCs de
-- 20260808100000_referral_core_part1.sql ni de
-- 20260808120000_referral_core_user_centric.sql (ninguna de las dos se
-- edita ni se reabre -- quedan intactas, integradas y validadas).
--
-- wa_get_my_referral_stats() reutiliza wa_get_or_create_my_referral_code()
-- para resolver/crear el código propio en vez de duplicar su lógica de
-- generación de slug -- exactamente lo pedido.
--
-- Ninguna de las dos funciones expone email, nombre real, user_id ni
-- business_id del referido. wa_list_my_referrals() deriva un
-- "publicLabel" determinístico y anónimo directamente del
-- referral_attribution_id (nunca del user_id del referido).
--
-- FUERA DE ALCANCE, a propósito: frontend (migración separada), panel
-- admin, retiros/payout, signup/onboarding, billing/webhooks, Product
-- Editor, CRM, R1/R2 -- ninguno se toca.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- wa_get_my_referral_stats() — resumen agregado del caller como referidor.
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

  -- Reutiliza la RPC existente en vez de duplicar la generación de slug:
  -- si el caller nunca generó código, esto lo crea de una vez (mismo
  -- comportamiento que si hubiera llamado wa_get_or_create_my_referral_code()
  -- directamente).
  SELECT public.wa_get_or_create_my_referral_code() INTO v_code;

  SELECT * INTO v_terms FROM public.referral_program_terms LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFERRAL_PROGRAM_TERMS_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  -- invitedCount: atribuciones válidas del caller como referidor,
  -- excluyendo disqualified (en la práctica 'pending' nunca persiste --
  -- wa_attribute_referral() resuelve a qualified/disqualified de
  -- inmediato -- pero se excluye por status, no se asume el valor exacto).
  SELECT count(*) INTO v_invited_count
  FROM public.referral_attributions
  WHERE referrer_user_id = v_user_id AND status <> 'disqualified';

  -- oneMonthCount / qualifiedCount: por progreso real en
  -- referral_paid_periods (ledger canónico, no wa_payments).
  SELECT
    count(*) FILTER (WHERE progress.paid_months = 1),
    count(*) FILTER (WHERE progress.paid_months >= v_terms.required_paid_months)
  INTO v_one_month_count, v_qualified_count
  FROM (
    SELECT ra.id, count(rpp.id) AS paid_months
    FROM public.referral_attributions ra
    LEFT JOIN public.referral_paid_periods rpp ON rpp.referral_attribution_id = ra.id
    WHERE ra.referrer_user_id = v_user_id AND ra.status <> 'disqualified'
    GROUP BY ra.id
  ) progress;

  -- Montos por estado de referral_commissions (Parte 1, sin cambios):
  -- pending/approved/reversed/paid. reversed NUNCA cuenta como ganado.
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

REVOKE ALL ON FUNCTION public.wa_get_my_referral_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_get_my_referral_stats() TO authenticated;

COMMENT ON FUNCTION public.wa_get_my_referral_stats() IS
  'Resumen agregado del programa de afiliados para el caller (auth.uid()) como referidor: código propio (lo crea si no existe, vía wa_get_or_create_my_referral_code()), términos vigentes, conteos de progreso (invitedCount/oneMonthCount/qualifiedCount) y montos por estado de recompensa (pendingAmount/availableAmount/totalEarnedAmount). Nunca expone datos de otros usuarios.';

-- ─────────────────────────────────────────────────────────────────────────────
-- wa_list_my_referrals(p_limit, p_offset) — lista paginada, sin PII.
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- Límites razonables, server-side -- el cliente no puede pedir más de 100
  -- ni un offset negativo, sin importar lo que envíe.
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
        -- Determinístico y anónimo: derivado únicamente del id de la
        -- atribución, nunca del user_id/email/nombre del referido.
        'publicLabel', 'Usuario #' || upper(right(ra.id::text, 4)),
        'createdAt',   ra.created_at,
        'paidMonths',  COALESCE(pp.paid_months, 0),
        'qualified',   COALESCE(pp.paid_months, 0) >= v_terms.required_paid_months
      ) AS row_data
    FROM public.referral_attributions ra
    LEFT JOIN (
      SELECT referral_attribution_id, count(*) AS paid_months
      FROM public.referral_paid_periods
      GROUP BY referral_attribution_id
    ) pp ON pp.referral_attribution_id = ra.id
    WHERE ra.referrer_user_id = v_user_id AND ra.status <> 'disqualified'
    ORDER BY ra.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) sub;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_list_my_referrals(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_list_my_referrals(INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.wa_list_my_referrals(INTEGER, INTEGER) IS
  'Lista paginada (p_limit default 20, máximo 100; p_offset >= 0, clamp server-side) de los referidos del caller (auth.uid()) como referidor, más reciente primero. Cada fila expone únicamente publicLabel (anónimo, derivado del id de atribución), createdAt, paidMonths y qualified -- nunca email, nombre real, user_id ni business_id.';

NOTIFY pgrst, 'reload schema';
