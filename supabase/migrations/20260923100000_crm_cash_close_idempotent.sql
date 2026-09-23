-- CAJA-CIERRE-IDEMPOTENTE-1 — cierre de caja idempotente + bloqueo de
-- reapertura de cajas con arqueo conciliado.
--
-- Incidente (smoke test de producción, 2026-09-22): "Cerrar caja" respondió
-- HTTP 409 con
--   duplicate key value violates unique constraint
--   "crm_cash_session_reconciliations_session_method_uq".
--
-- Auditoría previa confirmó:
--   * crm_close_cash_session (20260915180000) es atómica (una sola función
--     plpgsql, sin EXCEPTION/COMMIT internos): nunca deja un cierre parcial.
--   * Un segundo cierre de una caja YA cerrada nunca llega al INSERT (FOR
--     UPDATE + guard status='open') -- pero tampoco es idempotente: responde
--     error aunque el cierre original sí ocurrió.
--   * reopenCashSession() (crmService.js) hace un UPDATE directo
--     status='open', closed_at=NULL y NO toca crm_cash_session_reconciliations.
--     Una caja cerrada con el asistente y luego reabierta pasa el guard de
--     status y choca con la UNIQUE (session_id, payment_method) en el INSERT
--     -> 23505 -> HTTP 409, y ya no puede volver a cerrarse nunca. Producción
--     contiene al menos una sesión en ese estado (status='open' con filas de
--     conciliación de un cierre anterior).
--
-- Esta migración:
--   1. Redefine crm_close_cash_session con la MISMA firma (uuid, jsonb, text)
--      y el mismo retorno JSONB (más la clave nueva already_closed):
--        a. Sesión cerrada + snapshot existente + payload EQUIVALENTE
--           (mismos medios, mismos montos, mismas notas por medio y misma
--           observación) -> devuelve el snapshot guardado tal cual, con
--           already_closed=true. No escribe nada, no recalcula nada.
--        b. Sesión cerrada + payload DISTINTO -> error de dominio
--           (P0001, HINT CASH_SESSION_ALREADY_CLOSED_DIFFERENT). No escribe
--           nada: un reintento accidental jamás puede reescribir un cierre
--           histórico.
--        c. Sesión cerrada SIN snapshot (cierre legacy) -> error de dominio
--           (P0001, HINT CASH_SESSION_ALREADY_CLOSED).
--        d. Sesión abierta que ya tiene snapshot (reabierta antes de esta
--           migración) -> error de dominio (P0001, HINT
--           CASH_SESSION_REOPENED_WITH_RECONCILIATION) ANTES del INSERT --
--           nunca vuelve a llegar al 23505.
--      El resto (cálculo server-side de lo esperado, validaciones, INSERT,
--      UPDATE) se mantiene idéntico. Sigue sin haber UPSERT: la UNIQUE
--      (session_id, payment_method) se mantiene como última barrera.
--   2. Trigger BEFORE UPDATE OF status en crm_cash_sessions que impide la
--      transición closed -> open cuando la sesión ya tiene conciliaciones.
--      Cubre tanto reopenCashSession() como cualquier UPDATE directo vía
--      RLS.
--
-- Datos históricos: esta migración NO hace UPDATE/DELETE de ningún dato.
-- CREATE TRIGGER no valida filas existentes, así que se aplica aunque ya
-- existan sesiones status='open' con conciliaciones (el trigger solo mira
-- transiciones closed -> open futuras; esas sesiones ya están 'open'). Su
-- resolución queda como decisión manual/explícita fuera de esta migración.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. RPC: crm_close_cash_session (misma firma, idempotente)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.crm_close_cash_session(
  p_session_id UUID,
  p_reconciliations JSONB,      -- [{ "payment_method": "cash", "reconciled_amount": 45000, "notes": null }, ...]
  p_closing_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session        public.crm_cash_sessions;
  v_business_id    UUID;
  v_expected       JSONB := '{}'::jsonb;
  v_sent           JSONB := '{}'::jsonb;
  v_line           JSONB;
  v_method         TEXT;
  v_reconciled     NUMERIC;
  v_expected_amt   NUMERIC;
  v_has_diff       BOOLEAN := false;
  v_cash_expected  NUMERIC;
  v_cash_counted   NUMERIC;
  v_existing_count INT;
  v_same           BOOLEAN;
BEGIN
  -- FOR UPDATE bloquea la fila de la sesión durante todo el cierre: un
  -- segundo intento concurrente de cerrar la MISMA sesión espera a que
  -- esta transacción termine y luego ve status='closed' (READ COMMITTED
  -- relee la versión actualizada) -- cae en la rama idempotente de abajo.
  SELECT s.* INTO v_session
  FROM public.crm_cash_sessions s
  JOIN public.wa_businesses b ON b.id = s.business_id
  WHERE s.id = p_session_id AND b.user_id = auth.uid()
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja no encontrada o sin acceso' USING ERRCODE = '42501';
  END IF;
  v_business_id := v_session.business_id;

  -- Validación de forma del payload (vocabulario y montos). Se hace antes
  -- de mirar el estado para que la comparación idempotente de abajo opere
  -- sobre un payload ya normalizado (un objeto por medio, v_sent).
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_reconciliations, '[]'::jsonb))
  LOOP
    v_method := v_line->>'payment_method';
    IF v_method NOT IN ('cash','card','debit_card','credit_card','bank_transfer','mercado_pago','check','other') THEN
      RAISE EXCEPTION 'Medio de pago inválido: %', v_method USING ERRCODE = '22023';
    END IF;
    v_reconciled := (v_line->>'reconciled_amount')::NUMERIC;
    IF v_reconciled IS NULL OR v_reconciled < 0 THEN
      RAISE EXCEPTION 'Monto conciliado inválido para %', v_method USING ERRCODE = '23514';
    END IF;
    v_sent := jsonb_set(v_sent, ARRAY[v_method], v_line);
  END LOOP;

  SELECT count(*) INTO v_existing_count
  FROM public.crm_cash_session_reconciliations
  WHERE session_id = p_session_id;

  IF v_session.status <> 'open' THEN
    IF v_existing_count = 0 THEN
      -- Cerrada por un camino sin snapshot (cierre legacy): no hay nada
      -- contra qué comparar, y nunca se crea un snapshot a posteriori.
      RAISE EXCEPTION 'La caja ya está cerrada'
        USING ERRCODE = 'P0001',
              HINT = 'CASH_SESSION_ALREADY_CLOSED';
    END IF;

    -- Equivalente = mismo conjunto de medios (ambos lados son únicos por
    -- medio, así que igual cantidad + todo medio guardado presente en el
    -- payload implica conjuntos iguales), mismo monto por medio (comparado
    -- como NUMERIC(12,2), el mismo tipo con el que se guardó), mismas notas
    -- por medio (misma normalización NULLIF(...,'') que el INSERT) y misma
    -- observación general (vacía == NULL).
    v_same :=
      v_existing_count = (SELECT count(*) FROM jsonb_object_keys(v_sent))
      AND NOT EXISTS (
        SELECT 1
        FROM public.crm_cash_session_reconciliations r
        WHERE r.session_id = p_session_id
          AND (
            NOT (v_sent ? r.payment_method)
            OR r.reconciled_amount IS DISTINCT FROM ((v_sent->r.payment_method)->>'reconciled_amount')::NUMERIC(12,2)
            OR r.notes IS DISTINCT FROM NULLIF((v_sent->r.payment_method)->>'notes', '')
          )
      )
      AND NULLIF(btrim(COALESCE(v_session.closing_notes, '')), '')
          IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(p_closing_notes, '')), '');

    IF NOT v_same THEN
      RAISE EXCEPTION 'Esta caja ya fue cerrada con otros montos u observaciones. El cierre registrado no se modificó.'
        USING ERRCODE = 'P0001',
              HINT = 'CASH_SESSION_ALREADY_CLOSED_DIFFERENT';
    END IF;

    -- Repetición del MISMO cierre (doble submit, reintento tras perder la
    -- respuesta): devuelve el snapshot original, sin escribir nada.
    RETURN jsonb_build_object(
      'session', to_jsonb(v_session),
      'reconciliations', (
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.payment_method) FROM public.crm_cash_session_reconciliations r
        WHERE r.session_id = p_session_id
      ),
      'already_closed', true
    );
  END IF;

  -- Abierta pero con snapshot de un cierre anterior (reabierta antes de
  -- que existiera el trigger de abajo). Nunca se deja llegar al INSERT
  -- (23505) ni se sobreescribe/borra el snapshot histórico.
  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'Esta caja fue reabierta después de un cierre conciliado y conserva ese arqueo. No se puede volver a cerrar sin revisar el arqueo anterior; contacta a soporte.'
      USING ERRCODE = 'P0001',
            HINT = 'CASH_SESSION_REOPENED_WITH_RECONCILIATION';
  END IF;

  -- Efectivo esperado SIEMPRE presente (aunque sea 0): fondo inicial +
  -- cobros cash + entradas manuales CASH - salidas manuales CASH. Los
  -- demás medios: solo la suma de crm_payments de ese medio (credit =
  -- cuenta corriente, excluido -- no es dinero recibido en la sesión).
  SELECT jsonb_object_agg(method, amount) INTO v_expected
  FROM (
    SELECT 'cash' AS method,
           COALESCE(v_session.initial_amount, 0)
           + COALESCE((SELECT SUM(amount) FROM public.crm_payments
                       WHERE cash_session_id = p_session_id AND voided_at IS NULL
                         AND payment_method = 'cash'), 0)
           + COALESCE((SELECT SUM(amount) FROM public.crm_cash_movements
                       WHERE session_id = p_session_id AND voided_at IS NULL
                         AND direction = 'in' AND payment_method = 'cash'), 0)
           - COALESCE((SELECT SUM(amount) FROM public.crm_cash_movements
                       WHERE session_id = p_session_id AND voided_at IS NULL
                         AND direction = 'out' AND payment_method = 'cash'), 0)
           AS amount
    UNION ALL
    SELECT payment_method, SUM(amount)
    FROM public.crm_payments
    WHERE cash_session_id = p_session_id AND voided_at IS NULL
      AND payment_method NOT IN ('cash', 'credit')
    GROUP BY payment_method
  ) x;

  -- Ningún medio con actividad real puede omitirse -- calculado 100%
  -- server-side, nunca confía en lo que mande el cliente.
  FOR v_method IN SELECT jsonb_object_keys(v_expected)
  LOOP
    IF NOT (v_sent ? v_method) THEN
      RAISE EXCEPTION 'Falta conciliar %: tuvo actividad de % en este turno', v_method, (v_expected->>v_method)
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  FOR v_method IN SELECT jsonb_object_keys(v_sent)
  LOOP
    v_expected_amt := COALESCE((v_expected->>v_method)::NUMERIC, 0);
    v_reconciled := ((v_sent->v_method)->>'reconciled_amount')::NUMERIC;
    IF v_reconciled <> v_expected_amt THEN v_has_diff := true; END IF;
  END LOOP;
  IF v_has_diff AND (p_closing_notes IS NULL OR btrim(p_closing_notes) = '') THEN
    RAISE EXCEPTION 'Debes indicar una observación: hay diferencias en la conciliación'
      USING ERRCODE = '23514';
  END IF;

  FOR v_method IN SELECT jsonb_object_keys(v_sent)
  LOOP
    INSERT INTO public.crm_cash_session_reconciliations
      (business_id, session_id, payment_method, expected_amount, reconciled_amount, notes, reconciled_by)
    VALUES (
      v_business_id, p_session_id, v_method,
      COALESCE((v_expected->>v_method)::NUMERIC, 0),
      ((v_sent->v_method)->>'reconciled_amount')::NUMERIC,
      NULLIF((v_sent->v_method)->>'notes', ''),
      auth.uid()
    );
  END LOOP;

  v_cash_expected := COALESCE((v_expected->>'cash')::NUMERIC, 0);
  v_cash_counted  := ((v_sent->'cash')->>'reconciled_amount')::NUMERIC;

  UPDATE public.crm_cash_sessions
  SET expected_cash   = v_cash_expected,
      counted_cash    = v_cash_counted,
      cash_difference = v_cash_counted - v_cash_expected,
      closing_notes   = p_closing_notes,
      closed_by       = auth.uid(),
      closed_at       = now(),
      status          = 'closed'
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'session', to_jsonb(v_session),
    'reconciliations', (
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.payment_method) FROM public.crm_cash_session_reconciliations r
      WHERE r.session_id = p_session_id
    ),
    'already_closed', false
  );
END;
$$;

COMMENT ON FUNCTION public.crm_close_cash_session(UUID, JSONB, TEXT) IS
  'CAJA-CIERRE-CONCILIACION-1 + CAJA-CIERRE-IDEMPOTENTE-1: cierra una caja abierta con arqueo por medio de pago (lo esperado se calcula server-side, snapshot inmutable en crm_cash_session_reconciliations). Idempotente: repetir el mismo cierre sobre una caja ya cerrada devuelve el snapshot existente con already_closed=true; un payload distinto o una caja reabierta con snapshot previo fallan con error de dominio (P0001 + HINT) sin escribir nada. Nunca sobreescribe un cierre.';

REVOKE ALL ON FUNCTION public.crm_close_cash_session(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_close_cash_session(uuid, jsonb, text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Trigger: bloquear closed -> open en sesiones con arqueo conciliado
-- ══════════════════════════════════════════════════════════════════════════

-- SECURITY DEFINER para que el EXISTS no dependa de la RLS del rol que
-- hace el UPDATE (un rol sin SELECT sobre las conciliaciones no debe poder
-- saltarse el bloqueo por no "ver" las filas).
CREATE OR REPLACE FUNCTION public.crm_cash_sessions_block_reopen_reconciled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'closed' AND NEW.status = 'open' AND EXISTS (
    SELECT 1 FROM public.crm_cash_session_reconciliations r WHERE r.session_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'No se puede reabrir esta caja: ya tiene un arqueo conciliado registrado y ese cierre es histórico.'
      USING ERRCODE = 'P0001',
            HINT = 'CASH_SESSION_RECONCILED_REOPEN_BLOCKED';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.crm_cash_sessions_block_reopen_reconciled() IS
  'CAJA-CIERRE-IDEMPOTENTE-1: impide la transición closed -> open de una sesión de caja que ya tiene filas en crm_cash_session_reconciliations. Solo mira transiciones futuras; no valida ni modifica sesiones existentes.';

REVOKE ALL ON FUNCTION public.crm_cash_sessions_block_reopen_reconciled() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_crm_cash_sessions_block_reopen_reconciled ON public.crm_cash_sessions;
CREATE TRIGGER trg_crm_cash_sessions_block_reopen_reconciled
  BEFORE UPDATE OF status ON public.crm_cash_sessions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.crm_cash_sessions_block_reopen_reconciled();

NOTIFY pgrst, 'reload schema';
