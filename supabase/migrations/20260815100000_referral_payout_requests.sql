-- ============================================================
-- Affiliate Core — Fase 5C: payouts/retiros del afiliado.
--
-- No reabre ninguna migración anterior de Affiliate Core (20260808100000,
-- 20260808120000, 20260809100000, 20260810100000, 20260814100000) --
-- todas quedan intactas como historia verificable. Este archivo evoluciona
-- por encima, mismo patrón que todas ellas.
--
-- Alcance:
--   1. referral_payout_requests + referral_payout_commissions: modelo de
--      retiro y su relación con las comisiones que incluye. Historial
--      append-only -- ninguna fila se borra jamás.
--   2. Índice único parcial (commission_id) WHERE released_at IS NULL:
--      única fuente de verdad de "una comisión approved pertenece a lo
--      sumo a UN retiro activo a la vez". Mismo idioma exacto que
--      referral_paid_periods.invalidated_at de Fase 5B (20260814100000):
--      marcar aditivamente, nunca DELETE.
--   3. wa_request_referral_payout(): autoservicio del afiliado. Reclama
--      atómicamente (SELECT ... FOR UPDATE SKIP LOCKED) todas sus
--      comisiones approved libres, agrupadas por moneda -- nunca mezcla
--      monedas en un mismo retiro.
--   4. wa_admin_mark_referral_payout_paid() / wa_admin_reject_referral_payout():
--      únicas 2 vías administrativas (wa_is_admin(), mismo patrón que
--      20260310400000_admin_payments_and_notifications.sql) para mover un
--      retiro. mark_paid recalcula el monto pagable INMEDIATAMENTE antes
--      de pagar y exige coincidencia EXACTA con requested_amount -- ante
--      cualquier desvío (p.ej. un chargeback llegó mientras el retiro
--      esperaba), NO paga nada parcialmente: devuelve
--      payout_amount_changed y dejar el retiro en 'requested' para que un
--      admin lo rechace/libere y el afiliado pueda pedir un retiro nuevo
--      con las comisiones que sigan siendo válidas.
--   5. wa_get_my_referral_stats(): único ajuste a una RPC existente --
--      availableAmount excluye comisiones ya reservadas en un retiro
--      activo. totalEarnedAmount conserva su semántica exacta (approved +
--      paid, sin cambios).
--
-- FUERA DE ALCANCE, a propósito (sin tocar en este archivo):
--   - wa_reverse_referral_paid_period() / wa_mature_referral_commissions()
--     de Fase 5B: intactas. El caso 'paid'+refund->manual_review_required
--     sigue funcionando exactamente igual (una comisión que llega a 'paid'
--     vía este archivo cae en esa misma rama ya existente si se revierte
--     después -- no requiere ningún cambio).
--   - PayPal como fuente de períodos: sigue sin integrarse.
--   - Transferencias bancarias automáticas: este archivo NO mueve dinero
--     real -- external_reference es un comprobante que el admin ingresa
--     manualmente tras pagar por fuera del sistema.
--   - Perfil bancario permanente: payout_method_snapshot es un snapshot
--     JSONB propio de CADA retiro, inmutable una vez creado -- nunca se
--     reutilizan wa_businesses.bank_* (están muertas, sin uso en toda la
--     app, ancladas a wa_businesses en vez de a auth.users -- rompen el
--     modelo user-centric de Affiliate Core) ni se crea ninguna tabla de
--     perfil bancario reutilizable entre retiros.
--   - /afiliados: sigue detrás de RequireAdmin (Routes.jsx), sin cambios
--     de frontend en este archivo.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. wa_validate_referral_payout_method_snapshot(jsonb) — validación
--    estructural del snapshot de método de cobro. Helper interno (mismo
--    trato que wa_referral_current_streak_months de 5A.1: sin GRANT a
--    ningún rol cliente, solo lo usan el CHECK de la tabla y la RPC de
--    solicitud, ambos ejecutando como el owner de la función).
--
--    Único método soportado en esta fase: 'bank_transfer'. Campos
--    obligatorios no vacíos: method, country, holder_name, bank_name,
--    account_type, account_number (holder_tax_id y email quedan
--    opcionales a propósito, tal como se pidió). COALESCE(..., false) al
--    final es crítico -- sin él, un snapshot con una clave ausente (no
--    NULL, sino inexistente) puede evaluar la expresión completa a SQL
--    NULL, y un CHECK constraint que evalúa a NULL se considera
--    SATISFECHO por Postgres (no violado) -- dejaría pasar snapshots
--    inválidos silenciosamente. Envolver todo en COALESCE(..., false)
--    garantiza que la función NUNCA devuelve NULL.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_validate_referral_payout_method_snapshot(p_snapshot JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    p_snapshot IS NOT NULL
    AND jsonb_typeof(p_snapshot) = 'object'
    AND p_snapshot->>'method' = 'bank_transfer'
    AND COALESCE(btrim(p_snapshot->>'country'),        '') <> ''
    AND COALESCE(btrim(p_snapshot->>'holder_name'),     '') <> ''
    AND COALESCE(btrim(p_snapshot->>'bank_name'),       '') <> ''
    AND COALESCE(btrim(p_snapshot->>'account_type'),    '') <> ''
    AND COALESCE(btrim(p_snapshot->>'account_number'),  '') <> '',
    false
  );
$$;

REVOKE ALL ON FUNCTION public.wa_validate_referral_payout_method_snapshot(JSONB) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_validate_referral_payout_method_snapshot(JSONB) IS
  'Valida la estructura mínima de payout_method_snapshot. Único method soportado hoy: bank_transfer. Campos obligatorios no vacíos: method/country/holder_name/bank_name/account_type/account_number (holder_tax_id y email son opcionales). Nunca devuelve NULL (COALESCE final) -- un CHECK constraint trata NULL como satisfecho, no como violado. Helper interno, sin GRANT a ningún rol cliente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. referral_payout_requests — una fila por solicitud de retiro.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.referral_payout_requests (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id        UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                  TEXT          NOT NULL DEFAULT 'requested',
  requested_amount        NUMERIC(12,2) NOT NULL,
  currency                TEXT          NOT NULL,

  -- Snapshot AUTOCONTENIDO del método de cobro, propio de este retiro.
  -- Nunca referencia un perfil bancario mutable -- ver trigger de
  -- inmutabilidad más abajo.
  payout_method_snapshot  JSONB         NOT NULL,

  external_reference      TEXT          NULL,
  rejected_reason         TEXT          NULL,

  requested_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  paid_at                 TIMESTAMPTZ   NULL,
  rejected_at             TIMESTAMPTZ   NULL,
  admin_user_id           UUID          NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT referral_payout_requests_status_check
    CHECK (status IN ('requested', 'paid', 'rejected')),
  CONSTRAINT referral_payout_requests_amount_check
    CHECK (requested_amount > 0),
  CONSTRAINT referral_payout_requests_snapshot_valid_check
    CHECK (public.wa_validate_referral_payout_method_snapshot(payout_method_snapshot)),
  -- external_reference (comprobante) es obligatoria para llegar a 'paid' --
  -- reforzado también en la RPC (mensaje de error más claro), pero el
  -- constraint es la garantía dura que no depende de que nadie recuerde
  -- validar en el código de aplicación.
  CONSTRAINT referral_payout_requests_paid_requires_reference
    CHECK (status <> 'paid' OR (external_reference IS NOT NULL AND btrim(external_reference) <> '')),
  CONSTRAINT referral_payout_requests_rejected_requires_reason
    CHECK (status <> 'rejected' OR (rejected_reason IS NOT NULL AND btrim(rejected_reason) <> ''))
);

CREATE INDEX referral_payout_requests_referrer_status_idx
  ON public.referral_payout_requests(referrer_user_id, status);
CREATE INDEX referral_payout_requests_requested_idx
  ON public.referral_payout_requests(status) WHERE status = 'requested';

COMMENT ON TABLE public.referral_payout_requests IS
  'Solicitud de retiro de un afiliado. Historial append-only: ninguna fila se borra ni se reutiliza -- un rechazo libera las comisiones (ver referral_payout_commissions.released_at), no elimina el registro de que se intentó. Se crea vía wa_request_referral_payout() (authenticated, autoservicio); solo pasa a paid/rejected vía las 2 RPCs admin (wa_admin_mark_referral_payout_paid/wa_admin_reject_referral_payout), gateadas por wa_is_admin(). Ninguna RPC de cliente puede marcarla paid.';
COMMENT ON COLUMN public.referral_payout_requests.payout_method_snapshot IS
  'Snapshot JSONB autocontenido del método de cobro AL MOMENTO de la solicitud -- inmutable después (ver trigger referral_payout_requests_immutable_snapshot). Nunca referencia un perfil bancario reutilizable ni wa_businesses.bank_* (muertas, sin uso, ancladas a negocio en vez de a usuario).';
COMMENT ON COLUMN public.referral_payout_requests.external_reference IS
  'Comprobante/referencia externa del pago real, ingresado por el admin al marcar paid. Obligatorio para llegar a status=paid (constraint + validación en la RPC).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. referral_payout_commissions — qué comisiones concretas integran cada
--    retiro. El índice único parcial de más abajo es LA garantía de
--    esquema de "una comisión approved pertenece a lo sumo a un retiro
--    activo a la vez".
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.referral_payout_commissions (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id               UUID          NOT NULL REFERENCES public.referral_payout_requests(id) ON DELETE CASCADE,
  -- ON DELETE RESTRICT: referral_commissions nunca se borra en ningún
  -- flujo existente, pero si alguna vez se intentara, esta fila (evidencia
  -- de auditoría de un retiro) no debe poder desaparecer en cascada.
  commission_id           UUID          NOT NULL REFERENCES public.referral_commissions(id) ON DELETE RESTRICT,
  -- Belt-and-suspenders: reward_amount de referral_commissions YA es
  -- inmutable por diseño desde Parte 1 -- este snapshot no depende de esa
  -- garantía para que el registro de auditoría de ESTE retiro sea
  -- autocontenido igual.
  reward_amount_snapshot  NUMERIC(12,2) NOT NULL,

  -- Liberación ADITIVA -- mismo patrón exacto que
  -- referral_paid_periods.invalidated_at de Fase 5B. NUNCA DELETE: un
  -- retiro rechazado libera sus comisiones marcando released_at, no
  -- borrando la fila que prueba que se intentaron incluir.
  released_at             TIMESTAMPTZ   NULL,
  released_reason         TEXT          NULL,

  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT referral_payout_commissions_released_reason_check
    CHECK (released_reason IS NULL OR released_reason IN ('rejected', 'manual')),
  CONSTRAINT referral_payout_commissions_released_consistency_check
    CHECK ((released_at IS NULL) = (released_reason IS NULL))
);

-- LA restricción central de esta fase: como mucho un vínculo ACTIVO
-- (released_at IS NULL) por comisión, sin importar cuántas veces se haya
-- intentado incluir en el pasado.
CREATE UNIQUE INDEX referral_payout_commissions_commission_active_uq
  ON public.referral_payout_commissions(commission_id) WHERE released_at IS NULL;

CREATE INDEX referral_payout_commissions_payout_idx
  ON public.referral_payout_commissions(payout_id);

COMMENT ON TABLE public.referral_payout_commissions IS
  'Relación retiro<->comisión. UNIQUE(commission_id) WHERE released_at IS NULL es la garantía de esquema de que una comisión approved pertenece a lo sumo a UN retiro activo a la vez. Ninguna fila se borra jamás -- un rechazo de retiro marca released_at/released_reason=''rejected'' (aditivo), liberando la comisión (sigue approved) para una futura solicitud. Se escribe exclusivamente vía wa_request_referral_payout() y wa_admin_reject_referral_payout().';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS + grants de tabla. Cero políticas de escritura para cualquier rol
--    cliente en ninguna de las 2 tablas -- toda escritura pasa por las 3
--    RPCs SECURITY DEFINER de más abajo.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.referral_payout_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_payout_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_payout_requests_owner_select" ON public.referral_payout_requests
  FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid());

CREATE POLICY "referral_payout_requests_admin_select" ON public.referral_payout_requests
  FOR SELECT TO authenticated
  USING (public.wa_is_admin());

CREATE POLICY "referral_payout_commissions_owner_select" ON public.referral_payout_commissions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.referral_payout_requests pr
    WHERE pr.id = referral_payout_commissions.payout_id AND pr.referrer_user_id = auth.uid()
  ));

CREATE POLICY "referral_payout_commissions_admin_select" ON public.referral_payout_commissions
  FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- RLS nunca es lo primero que evalúa Postgres: sin GRANT de tabla,
-- cualquier SELECT falla antes de que ninguna policy se mire (mismo
-- comentario ya documentado en 20260808120000, sección 6b).
GRANT SELECT ON TABLE public.referral_payout_requests    TO authenticated;
GRANT SELECT ON TABLE public.referral_payout_commissions TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Triggers: updated_at (patrón estándar del repo) + inmutabilidad dura
--    del snapshot de método de cobro.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER referral_payout_requests_updated_at
  BEFORE UPDATE ON public.referral_payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

CREATE OR REPLACE FUNCTION public.wa_referral_payout_requests_prevent_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payout_method_snapshot IS DISTINCT FROM OLD.payout_method_snapshot THEN
    RAISE EXCEPTION 'PAYOUT_METHOD_SNAPSHOT_IS_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER referral_payout_requests_immutable_snapshot
  BEFORE UPDATE ON public.referral_payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.wa_referral_payout_requests_prevent_snapshot_mutation();

COMMENT ON FUNCTION public.wa_referral_payout_requests_prevent_snapshot_mutation() IS
  'Garantía dura de esquema: payout_method_snapshot pertenece al retiro y nunca se modifica después de creada la solicitud, sin importar quién intente el UPDATE (ni las propias RPCs admin lo tocan -- este trigger lo hace imposible incluso ante un bug futuro).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. referral_program_terms: agregar min_payout_amount (configurable,
--    arranca en 0 -- sin mínimo hoy, la plumbing queda lista).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.referral_program_terms
  ADD COLUMN IF NOT EXISTS min_payout_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.referral_program_terms
  DROP CONSTRAINT IF EXISTS referral_program_terms_positive_check;
ALTER TABLE public.referral_program_terms
  ADD CONSTRAINT referral_program_terms_positive_check
  CHECK (reward_amount >= 0 AND required_paid_months >= 1 AND hold_days >= 0 AND min_payout_amount >= 0);

COMMENT ON COLUMN public.referral_program_terms.min_payout_amount IS
  'Monto mínimo (en la moneda de cada grupo) para que wa_request_referral_payout() cree un retiro. Default 0 = sin mínimo. Cambiar acá NUNCA afecta retiros ya creados (mismo invariante que el resto de esta tabla: cada referral_payout_requests.requested_amount es un valor ya calculado, no una referencia viva a este valor).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. wa_request_referral_payout(p_payout_method_snapshot) — autoservicio.
--    Reclama TODAS las comisiones approved libres del caller en una sola
--    pasada de locking (FOR UPDATE SKIP LOCKED), las agrupa por moneda y
--    crea un retiro por grupo. SKIP LOCKED es lo que hace que una
--    solicitud concurrente del mismo usuario (doble clic, dos pestañas)
--    simplemente no vea las filas que esta transacción ya está
--    reclamando -- nunca duplica el reclamo, nunca lanza un error de
--    concurrencia al usuario. El índice único parcial de la sección 3 es
--    el backstop si esa protección se bypaseara alguna vez.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_request_referral_payout(
  p_payout_method_snapshot JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_terms     public.referral_program_terms%ROWTYPE;
  v_results   JSONB := '[]'::jsonb;
  v_group     RECORD;
  v_payout_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.wa_validate_referral_payout_method_snapshot(p_payout_method_snapshot) THEN
    RETURN jsonb_build_object('requested', false, 'reason', 'invalid_payout_method_snapshot');
  END IF;

  SELECT * INTO v_terms FROM public.referral_program_terms LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFERRAL_PROGRAM_TERMS_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  -- Staging temporal: FOR UPDATE no puede combinarse con agregados/GROUP
  -- BY en la misma consulta, así que el reclamo (lock) y la agrupación por
  -- moneda son 2 pasos separados sobre el MISMO conjunto ya lockeado.
  -- DROP TABLE IF EXISTS primero: ON COMMIT DROP solo limpia al COMMIT de
  -- la transacción -- si esta RPC se llama 2 veces dentro de la MISMA
  -- transacción (p.ej. un futuro batch admin, o un test que envuelve
  -- varias llamadas en una transacción sin commit intermedio, como hacen
  -- los diagnósticos de este repo), la segunda CREATE TEMP TABLE chocaría
  -- contra la tabla que la primera llamada todavía no liberó. En el uso
  -- normal vía PostgREST (una transacción por request) esto nunca pasaría,
  -- pero la función no debe depender de esa suposición para ser correcta.
  DROP TABLE IF EXISTS pg_temp._wa_payout_claim;
  CREATE TEMP TABLE _wa_payout_claim (
    commission_id   UUID,
    reward_amount   NUMERIC(12,2),
    reward_currency TEXT
  ) ON COMMIT DROP;

  INSERT INTO _wa_payout_claim (commission_id, reward_amount, reward_currency)
  SELECT rc.id, rc.reward_amount, rc.reward_currency
  FROM public.referral_commissions rc
  WHERE rc.referrer_user_id = v_user_id
    AND rc.status = 'approved'
    AND NOT EXISTS (
      SELECT 1 FROM public.referral_payout_commissions rpc
      WHERE rpc.commission_id = rc.id AND rpc.released_at IS NULL
    )
  ORDER BY rc.id
  FOR UPDATE OF rc SKIP LOCKED;

  -- Un retiro por moneda presente entre lo reclamado -- nunca se mezclan
  -- monedas en una misma fila (referral_program_terms.reward_currency
  -- puede, en teoría, cambiar de política entre 2 comisiones distintas de
  -- un mismo afiliado).
  FOR v_group IN
    SELECT reward_currency, array_agg(commission_id) AS commission_ids, sum(reward_amount) AS total
    FROM _wa_payout_claim
    GROUP BY reward_currency
  LOOP
    IF v_group.total < v_terms.min_payout_amount THEN
      v_results := v_results || jsonb_build_object(
        'currency', v_group.reward_currency,
        'created', false,
        'reason', 'below_minimum',
        'amount', v_group.total
      );
      CONTINUE;
    END IF;

    INSERT INTO public.referral_payout_requests (
      referrer_user_id, requested_amount, currency, payout_method_snapshot
    ) VALUES (
      v_user_id, v_group.total, v_group.reward_currency, p_payout_method_snapshot
    )
    RETURNING id INTO v_payout_id;

    INSERT INTO public.referral_payout_commissions (payout_id, commission_id, reward_amount_snapshot)
    SELECT v_payout_id, c.commission_id, c.reward_amount
    FROM _wa_payout_claim c
    WHERE c.reward_currency = v_group.reward_currency;

    v_results := v_results || jsonb_build_object(
      'currency', v_group.reward_currency,
      'created', true,
      'payoutId', v_payout_id,
      'amount', v_group.total,
      'commissionCount', array_length(v_group.commission_ids, 1)
    );
  END LOOP;

  IF jsonb_array_length(v_results) = 0 THEN
    RETURN jsonb_build_object('requested', true, 'payouts', '[]'::jsonb, 'reason', 'nothing_to_withdraw');
  END IF;

  RETURN jsonb_build_object('requested', true, 'payouts', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.wa_request_referral_payout(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_request_referral_payout(JSONB) TO authenticated;

COMMENT ON FUNCTION public.wa_request_referral_payout(JSONB) IS
  'Autoservicio: reclama atómicamente (FOR UPDATE SKIP LOCKED) todas las comisiones approved libres del caller, agrupadas por moneda, y crea un referral_payout_requests por grupo (respetando min_payout_amount). payout_method_snapshot debe cumplir wa_validate_referral_payout_method_snapshot() o se rechaza sin crear nada. Restringida a authenticated -- re-valida auth.uid() server-side.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. wa_admin_mark_referral_payout_paid(payout_id, external_reference) —
--    única vía en TODO el repo que puede producir referral_commissions.status
--    = 'paid'. Recalcula el monto pagable INMEDIATAMENTE antes de pagar
--    (nunca confía en requested_amount) y exige coincidencia EXACTA:
--    TODAS las comisiones activas originales deben seguir 'approved' Y la
--    suma debe igualar requested_amount. Ante cualquier desvío (p.ej. un
--    chargeback revirtió una de las comisiones mientras el retiro
--    esperaba), NO paga nada -- ni parcial ni total -- y devuelve
--    payout_amount_changed con el detalle.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_admin_mark_referral_payout_paid(
  p_payout_id UUID,
  p_external_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout                   public.referral_payout_requests%ROWTYPE;
  v_active_count              INTEGER;
  v_approved_count            INTEGER;
  v_payable_amount            NUMERIC(12,2);
  v_excluded                  JSONB;
  v_updated_commission_count  INTEGER;
BEGIN
  IF NOT public.wa_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_external_reference IS NULL OR btrim(p_external_reference) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_external_reference');
  END IF;

  -- Lock de la fila del retiro: serializa cualquier otra llamada
  -- concurrente sobre ESTE MISMO payout (pago repetido / doble clic admin
  -- / reject simultáneo) -- la segunda espera a que esta transacción
  -- termine y ve el estado ya resuelto.
  SELECT * INTO v_payout
  FROM public.referral_payout_requests
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_not_found');
  END IF;

  -- Idempotencia dura: pagar 2 veces el mismo retiro es no-op, nunca un
  -- segundo pago ni un segundo intento de mutar las comisiones.
  IF v_payout.status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyPaid', true, 'payoutId', v_payout.id);
  END IF;

  IF v_payout.status <> 'requested' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_payout.status);
  END IF;

  -- Paso 1: lockear las comisiones vinculadas activamente a este retiro,
  -- SIN agregación (FOR UPDATE no admite combinarse con agregados/GROUP
  -- BY). Mientras esta transacción no termine, nada puede revertirlas.
  PERFORM 1
  FROM public.referral_payout_commissions rpc
  JOIN public.referral_commissions rc ON rc.id = rpc.commission_id
  WHERE rpc.payout_id = v_payout.id AND rpc.released_at IS NULL
  FOR UPDATE OF rc;

  -- Paso 2: ahora sí, recalcular sobre el conjunto ya lockeado (estable
  -- por el resto de esta transacción).
  SELECT
    count(*) FILTER (WHERE rc.status = 'approved'),
    count(*),
    COALESCE(SUM(rc.reward_amount) FILTER (WHERE rc.status = 'approved'), 0)
  INTO v_approved_count, v_active_count, v_payable_amount
  FROM public.referral_payout_commissions rpc
  JOIN public.referral_commissions rc ON rc.id = rpc.commission_id
  WHERE rpc.payout_id = v_payout.id AND rpc.released_at IS NULL;

  IF v_active_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_active_commissions');
  END IF;

  -- Atomicidad estricta pedida: TODAS las comisiones activas originales
  -- deben seguir approved Y la suma debe coincidir EXACTO con
  -- requested_amount. Un solo desvío alcanza para bloquear el pago
  -- COMPLETO -- nunca un pago parcial.
  IF v_approved_count <> v_active_count OR v_payable_amount <> v_payout.requested_amount THEN
    SELECT COALESCE(jsonb_agg(rc.id), '[]'::jsonb)
    INTO v_excluded
    FROM public.referral_payout_commissions rpc
    JOIN public.referral_commissions rc ON rc.id = rpc.commission_id
    WHERE rpc.payout_id = v_payout.id
      AND rpc.released_at IS NULL
      AND rc.status <> 'approved';

    RETURN jsonb_build_object(
      'ok', false,
      'error', 'payout_amount_changed',
      'requestedAmount', v_payout.requested_amount,
      'payableAmount', v_payable_amount,
      'excludedCommissionIds', v_excluded
    );
  END IF;

  -- Todo coincide exacto: transición atómica requested -> paid.
  UPDATE public.referral_payout_requests
  SET status = 'paid', paid_at = now(), external_reference = p_external_reference,
      admin_user_id = auth.uid()
  WHERE id = v_payout.id AND status = 'requested';

  -- ÚNICO UPDATE en todo el repo que puede escribir status='paid' en
  -- referral_commissions. Guardado por status='approved' -- defensa
  -- adicional, no debería poder fallar tras los chequeos de arriba.
  UPDATE public.referral_commissions rc
  SET status = 'paid', paid_at = now()
  FROM public.referral_payout_commissions rpc
  WHERE rpc.payout_id = v_payout.id
    AND rpc.released_at IS NULL
    AND rc.id = rpc.commission_id
    AND rc.status = 'approved';
  GET DIAGNOSTICS v_updated_commission_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'payoutId', v_payout.id,
    'paidAmount', v_payable_amount,
    'commissionsPaid', v_updated_commission_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wa_admin_mark_referral_payout_paid(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_admin_mark_referral_payout_paid(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.wa_admin_mark_referral_payout_paid(UUID, TEXT) IS
  'Única vía en todo el repo que puede producir referral_commissions.status=''paid''. Restringida por wa_is_admin() (mismo patrón que 20260310400000_admin_payments_and_notifications.sql: GRANT a authenticated, guarda interna). Recalcula el monto pagable AL MOMENTO del pago (nunca confía en requested_amount) y exige que TODAS las comisiones activas originales sigan approved Y que la suma coincida EXACTO -- ante cualquier desvío (chargeback llegado mientras el retiro esperaba) no muta nada y devuelve payout_amount_changed con requestedAmount/payableAmount/excludedCommissionIds. external_reference obligatoria. Idempotente: pagar un retiro ya paid es no-op (alreadyPaid), nunca doble pago.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. wa_admin_reject_referral_payout(payout_id, reason) — libera las
--    comisiones (aditivo, released_at/released_reason='rejected') sin
--    tocar su status -- siguen 'approved', elegibles para una futura
--    solicitud. Nunca toca referral_commissions.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_admin_reject_referral_payout(
  p_payout_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout         public.referral_payout_requests%ROWTYPE;
  v_released_count INTEGER;
BEGIN
  IF NOT public.wa_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_reason');
  END IF;

  SELECT * INTO v_payout
  FROM public.referral_payout_requests
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_not_found');
  END IF;

  IF v_payout.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyRejected', true, 'payoutId', v_payout.id);
  END IF;

  IF v_payout.status <> 'requested' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_payout.status);
  END IF;

  UPDATE public.referral_payout_requests
  SET status = 'rejected', rejected_at = now(), rejected_reason = p_reason, admin_user_id = auth.uid()
  WHERE id = v_payout.id AND status = 'requested';

  -- Liberación ADITIVA -- nunca DELETE. Las comisiones (que nunca dejaron
  -- de estar 'approved') vuelven a ser candidatas de
  -- wa_request_referral_payout(). Una comisión que ya fue 'reversed' por
  -- un chargeback mientras tanto sigue sin poder volver a reclamarse
  -- jamás -- esa RPC solo selecciona status='approved', sin importar el
  -- estado de released_at.
  UPDATE public.referral_payout_commissions
  SET released_at = now(), released_reason = 'rejected'
  WHERE payout_id = v_payout.id AND released_at IS NULL;
  GET DIAGNOSTICS v_released_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'payoutId', v_payout.id, 'releasedCommissionCount', v_released_count);
END;
$$;

REVOKE ALL ON FUNCTION public.wa_admin_reject_referral_payout(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_admin_reject_referral_payout(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.wa_admin_reject_referral_payout(UUID, TEXT) IS
  'Rechaza un retiro requested: libera sus comisiones de forma ADITIVA (released_at/released_reason=''rejected'', nunca DELETE) sin tocar su status -- siguen approved, disponibles para una futura solicitud. Restringida por wa_is_admin(). Idempotente: rechazar un retiro ya rejected es no-op.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. wa_get_my_referral_stats() — único ajuste: availableAmount excluye
--     comisiones ya reservadas en un retiro activo. totalEarnedAmount
--     conserva su semántica exacta (approved + paid, sin cambios). Mismo
--     contrato externo (shape de JSON), mismo cuerpo que 20260810100000
--     salvo esta única línea.
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

  SELECT
    count(*) FILTER (WHERE progress.paid_months = 1),
    count(*) FILTER (WHERE progress.paid_months >= v_terms.required_paid_months)
  INTO v_one_month_count, v_qualified_count
  FROM (
    SELECT ra.id, public.wa_referral_current_streak_months(ra.id) AS paid_months
    FROM public.referral_attributions ra
    WHERE ra.referrer_user_id = v_user_id AND ra.status <> 'disqualified'
  ) progress;

  -- availableAmount (Fase 5C): excluye comisiones approved ya reservadas
  -- en un retiro activo (referral_payout_commissions sin released_at) --
  -- sin esto, el afiliado vería como "disponible para retirar" dinero que
  -- ya pidió retirar. totalEarnedAmount SIN CAMBIOS: approved+paid siguen
  -- contando igual sin importar si están en medio de un retiro.
  SELECT
    COALESCE(SUM(reward_amount) FILTER (WHERE status = 'pending'), 0),
    COALESCE(SUM(reward_amount) FILTER (
      WHERE status = 'approved'
        AND NOT EXISTS (
          SELECT 1 FROM public.referral_payout_commissions rpc
          WHERE rpc.commission_id = referral_commissions.id AND rpc.released_at IS NULL
        )
    ), 0),
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
  'Resumen agregado del programa de afiliados para el caller (auth.uid()) como referidor. availableAmount (Fase 5C) excluye comisiones approved ya reservadas en un retiro activo (referral_payout_commissions.released_at IS NULL) -- dinero ya solicitado no cuenta como "disponible" de nuevo. totalEarnedAmount conserva su semántica exacta (approved+paid). Mismo contrato externo desde Fase 5A.1.';

NOTIFY pgrst, 'reload schema';
