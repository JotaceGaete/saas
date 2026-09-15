-- CAJA-CIERRE-CONCILIACION-1 — "Cerrar caja" se convierte en un asistente
-- de conciliación por medio de pago, en vez de un cierre ciego de un solo
-- click (closeCashSession() hoy solo hace UPDATE status='closed').
--
-- Auditoría previa confirmó:
--   * crm_cash_sessions ya tiene las columnas de arqueo (expected_cash,
--     counted_cash, cash_difference, closing_notes, closed_by) desde
--     20260809110000_crm_cash_documents_reconciliation.sql, pero ningún
--     código de app las escribe hoy -- esta migración las empieza a usar,
--     no las crea ni las deprecia.
--   * crm_cash_movements.payment_method (TEXT NOT NULL DEFAULT 'cash', sin
--     CHECK) es 100% confiable para filtrar movimientos en efectivo: la
--     tabla nació scoped a "gastos pagados CON EFECTIVO DE CAJA"
--     (CashMovementModal no tiene ningún campo de medio de pago en su UI,
--     createCashMovement() en crmService.js sí acepta paymentMethod pero
--     jamás se sobreescribe desde ningún caller real) -- hoy es un no-op
--     (coincide el 100% de las filas), pero es la query correcta y
--     forward-compatible, se aplica igual como red de seguridad.
--   * crm_payments.payment_method es TEXT libre, sin CHECK en la BD (la
--     validación de vocabulario vive en el cliente, normalizePaymentMethod
--     en crmService.js). 'credit' = cuenta corriente, deliberadamente
--     excluido de todo total de caja -- no es dinero recibido en la
--     sesión.
--
-- Esta migración:
--   1. Crea crm_cash_session_reconciliations -- snapshot INMUTABLE, un
--      registro por (sesión, medio de pago) conciliado al cerrar. RLS
--      SOLO permite SELECT: la única forma de escribir es la RPC de abajo
--      (SECURITY DEFINER), nunca un INSERT directo del cliente.
--   2. Crea la RPC crm_close_cash_session, que reemplaza a
--      closeCashSession() (UPDATE directo) para el flujo del asistente.
--      Calcula "lo esperado" 100% server-side -- nunca confía en lo que
--      mande el cliente -- y rechaza un cierre que omita cualquier medio
--      con actividad real detectada en el turno.
--
-- No modifica crm_cash_sessions.status ni ninguna política RLS existente
-- de crm_cash_sessions/crm_cash_movements/crm_payments. closeCashSession()
-- (el UPDATE directo legacy) se deja intacta -- sigue existiendo para
-- quien la use fuera del asistente nuevo.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. crm_cash_session_reconciliations
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.crm_cash_session_reconciliations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  session_id         UUID NOT NULL REFERENCES public.crm_cash_sessions(id) ON DELETE CASCADE,
  payment_method     TEXT NOT NULL CHECK (payment_method IN (
                        'cash', 'card', 'debit_card', 'credit_card',
                        'bank_transfer', 'mercado_pago', 'check', 'other'
                      )),
  expected_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  reconciled_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  difference         NUMERIC(12,2) GENERATED ALWAYS AS (reconciled_amount - expected_amount) STORED,
  notes              TEXT,
  reconciled_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reconciled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_cash_session_reconciliations_session_method_uq UNIQUE (session_id, payment_method)
);

CREATE INDEX idx_crm_cash_session_reconciliations_business ON public.crm_cash_session_reconciliations (business_id);
CREATE INDEX idx_crm_cash_session_reconciliations_session ON public.crm_cash_session_reconciliations (session_id);

COMMENT ON TABLE public.crm_cash_session_reconciliations IS
  'CAJA-CIERRE-CONCILIACION-1: snapshot inmutable del arqueo por medio de pago al cerrar una caja. Una fila por (session_id, payment_method). Escrita únicamente por crm_close_cash_session (SECURITY DEFINER) -- no hay policy de INSERT/UPDATE/DELETE para clientes.';
COMMENT ON COLUMN public.crm_cash_session_reconciliations.expected_amount IS
  'Calculado server-side por crm_close_cash_session en el momento del cierre -- nunca confía en el valor que mande el cliente.';
COMMENT ON COLUMN public.crm_cash_session_reconciliations.reconciled_amount IS
  'Monto contado/confirmado por el cajero para este medio de pago (efectivo contado, total del terminal, etc.).';

ALTER TABLE public.crm_cash_session_reconciliations ENABLE ROW LEVEL SECURITY;

-- Read-only para el dueño del negocio. Las escrituras ocurren
-- exclusivamente dentro de crm_close_cash_session (SECURITY DEFINER más
-- abajo) -- no se otorga ninguna policy de INSERT/UPDATE/DELETE, así que
-- un INSERT directo del cliente es imposible: solo la RPC atómica puede
-- crear filas acá.
CREATE POLICY "crm_cash_session_reconciliations_select"
  ON public.crm_cash_session_reconciliations FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

GRANT SELECT ON TABLE public.crm_cash_session_reconciliations TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. RPC: crm_close_cash_session
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
  v_session       public.crm_cash_sessions;
  v_business_id   UUID;
  v_expected      JSONB := '{}'::jsonb;
  v_sent          JSONB := '{}'::jsonb;
  v_line          JSONB;
  v_method        TEXT;
  v_reconciled    NUMERIC;
  v_expected_amt  NUMERIC;
  v_has_diff      BOOLEAN := false;
  v_cash_expected NUMERIC;
  v_cash_counted  NUMERIC;
BEGIN
  -- FOR UPDATE bloquea la fila de la sesión durante todo el cierre: un
  -- segundo intento concurrente de cerrar la MISMA sesión espera a que
  -- esta transacción termine y luego falla con "La caja ya está cerrada"
  -- (status ya no es 'open') -- nunca puede producir dos juegos de filas
  -- de conciliación para la misma sesión.
  SELECT s.* INTO v_session
  FROM public.crm_cash_sessions s
  JOIN public.wa_businesses b ON b.id = s.business_id
  WHERE s.id = p_session_id AND b.user_id = auth.uid()
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja no encontrada o sin acceso' USING ERRCODE = '42501';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'La caja ya está cerrada' USING ERRCODE = '23514';
  END IF;
  v_business_id := v_session.business_id;

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
    )
  );
END;
$$;

COMMENT ON FUNCTION public.crm_close_cash_session(UUID, JSONB, TEXT) IS
  'CAJA-CIERRE-CONCILIACION-1: cierra una caja abierta con arqueo por medio de pago. Calcula lo esperado server-side (nunca confía en el cliente), exige conciliar todo medio con actividad real, requiere observación si hay diferencia, y persiste un snapshot inmutable en crm_cash_session_reconciliations. FOR UPDATE sobre la sesión evita cierres concurrentes duplicados.';

REVOKE ALL ON FUNCTION public.crm_close_cash_session(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_close_cash_session(UUID, JSONB, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
