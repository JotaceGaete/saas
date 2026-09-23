-- CAJA-CIERRE-IDEMPOTENTE-1 — corrige el bug real de cierre/reapertura de
-- caja encontrado en la primera prueba con datos reales.
--
-- Hallazgo (auditoría + producción):
--   * crm_close_cash_session (20260915180000) hace FOR UPDATE + valida
--     status='open', pero un reintento sobre una caja YA cerrada por esta
--     misma RPC (doble submit, reintento tras timeout/error de red, dos
--     pestañas) siempre choca con "La caja ya está cerrada" -- correcto
--     para un payload distinto, pero no hay forma de confirmar un cierre
--     que en realidad ya se aplicó exactamente igual.
--   * Existe en producción una sesión real
--     (576511e7-5a6b-4571-bdd9-d4702b4e2cbd) con status='open',
--     closed_at=NULL y 3 filas ya persistidas en
--     crm_cash_session_reconciliations (cash, mercado_pago, debit_card) --
--     un estado histórico/inconsistente. Si alguien vuelve a cerrar esa
--     sesión, el flujo original intenta un INSERT por cada medio y choca
--     contra el UNIQUE(session_id, payment_method) con un 23505 crudo.
--   * reopenCashSession() (crmService.js) hace un UPDATE directo de
--     crm_cash_sessions (status='open', closed_at=null) sin pasar por
--     ninguna RPC -- nada impide reabrir una caja que ya tiene
--     conciliación persistida, ni siquiera a nivel de base de datos (un
--     UPDATE directo del cliente, saltándose por completo el frontend,
--     tenía el mismo efecto).
--
-- Esta migración:
--   1. Reemplaza el CUERPO de crm_close_cash_session (misma firma exacta
--      uuid, jsonb, text -- ningún caller cambia) para que sea idempotente:
--        A) open sin conciliaciones -> flujo normal sin cambios.
--        B) closed con snapshot y el mismo payload exacto (comparación
--           numérica/semántica, sin importar orden de JSON) -> no escribe
--           nada, devuelve el snapshot existente con already_closed=true.
--        C) closed con snapshot y payload distinto -> no escribe nada,
--           error de dominio claro. Nunca un 23505 por la UNIQUE.
--        D) open pero YA con conciliaciones persistidas (estado histórico
--           inconsistente, como la sesión de producción de arriba) ->
--           nunca intenta el INSERT, error de dominio claro, no toca las
--           filas existentes.
--   2. Agrega un guard a nivel de base de datos (trigger BEFORE UPDATE en
--      crm_cash_sessions) que bloquea la transición a status='open' cuando
--      la sesión ya tiene conciliación registrada -- no se puede saltar
--      haciendo un UPDATE directo desde el cliente, solo protege la
--      TRANSICIÓN hacia 'open' (OLD.status distinto de 'open'), así que no
--      toca ni falla por la sesión histórica de arriba (ya está open hoy,
--      no está transicionando).
--
-- No modifica la migración histórica 20260915180000 ni ninguna policy/RLS
-- existente. No hace ningún DML sobre datos existentes -- por eso no puede
-- fallar por la sesión inconsistente ya presente en producción. No corrige
-- esa sesión: sigue open+con conciliación después de aplicar esto, tal
-- como se pidió.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. crm_close_cash_session — idempotente
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
  v_stored_count  INTEGER;
  v_sent_count    INTEGER;
  v_all_match     BOOLEAN;
  v_notes_equal   BOOLEAN;
BEGIN
  -- FOR UPDATE bloquea la fila de la sesión durante todo el cierre: un
  -- segundo intento concurrente (dos pestañas, doble submit, reintento de
  -- red) espera a que esta transacción termine y luego se resuelve contra
  -- el estado YA COMMITEADO -- si el primero cerró con éxito, el segundo
  -- cae en la rama B (idempotente) o C (payload distinto) de abajo, nunca
  -- en una carrera hacia el mismo INSERT.
  SELECT s.* INTO v_session
  FROM public.crm_cash_sessions s
  JOIN public.wa_businesses b ON b.id = s.business_id
  WHERE s.id = p_session_id AND b.user_id = auth.uid()
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja no encontrada o sin acceso' USING ERRCODE = '42501';
  END IF;
  v_business_id := v_session.business_id;

  -- Parseo/validación del payload enviado -- se hace ANTES de mirar el
  -- status: tanto el cierre normal (status='open') como la comparación de
  -- idempotencia (status='closed') lo necesitan. Mismas reglas que el
  -- original: vocabulario de payment_method y reconciled_amount >= 0.
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
  SELECT count(*) INTO v_sent_count FROM jsonb_object_keys(v_sent);

  -- ────────────────────────────────────────────────────────────────────
  -- B/C) Sesión YA cerrada: nunca reintenta el INSERT (evita el 23505 de
  -- la UNIQUE). Compara semánticamente contra el snapshot persistido --
  -- numeric como numeric (45000 = 45000.00), notas normalizadas
  -- (NULL/''/espacios tratados igual), mismos medios, sin depender del
  -- orden del JSON recibido -- y responde sin modificar nada en esta rama.
  -- ────────────────────────────────────────────────────────────────────
  IF v_session.status = 'closed' THEN
    SELECT count(*) INTO v_stored_count
    FROM public.crm_cash_session_reconciliations
    WHERE session_id = p_session_id;

    IF v_stored_count = 0 THEN
      -- Cerrada sin snapshot: cierre legado (closeCashSession() directo, o
      -- de antes de CAJA-CIERRE-CONCILIACION-1) -- no hay nada persistido
      -- con qué comparar el payload recibido. Mismo mensaje que el guard
      -- original (compatibilidad con lo que ya matchean tests/frontend).
      RAISE EXCEPTION 'La caja ya está cerrada' USING ERRCODE = '23514',
        HINT = 'crm_cash_session_closed_no_snapshot';
    END IF;

    SELECT bool_and(
             (v_sent ? r.payment_method)
             AND r.reconciled_amount = NULLIF((v_sent -> r.payment_method) ->> 'reconciled_amount', '')::numeric
             AND COALESCE(NULLIF(btrim(r.notes), ''), '') =
                 COALESCE(NULLIF(btrim((v_sent -> r.payment_method) ->> 'notes'), ''), '')
           )
      INTO v_all_match
      FROM public.crm_cash_session_reconciliations r
      WHERE r.session_id = p_session_id;

    v_notes_equal := COALESCE(NULLIF(btrim(v_session.closing_notes), ''), '')
                    = COALESCE(NULLIF(btrim(p_closing_notes), ''), '');

    IF v_stored_count = v_sent_count AND COALESCE(v_all_match, false) AND v_notes_equal THEN
      RETURN jsonb_build_object(
        'session', to_jsonb(v_session),
        'reconciliations', (
          SELECT jsonb_agg(to_jsonb(r) ORDER BY r.payment_method)
          FROM public.crm_cash_session_reconciliations r
          WHERE r.session_id = p_session_id
        ),
        'already_closed', true
      );
    END IF;

    RAISE EXCEPTION 'La caja ya está cerrada con una conciliación distinta a la registrada' USING ERRCODE = '23514',
      HINT = 'crm_cash_session_closed_mismatch';
  END IF;

  -- ────────────────────────────────────────────────────────────────────
  -- D) Sesión abierta pero con conciliación YA persistida: estado
  -- histórico/inconsistente (el caso real de producción:
  -- 576511e7-5a6b-4571-bdd9-d4702b4e2cbd). Se detecta explícitamente ANTES
  -- de cualquier INSERT -- nunca se intenta escribir, nunca se toca ni se
  -- borra lo que ya existe.
  -- ────────────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.crm_cash_session_reconciliations WHERE session_id = p_session_id) THEN
    RAISE EXCEPTION 'Esta caja figura abierta pero ya tiene conciliación registrada (estado inconsistente). Contacta soporte.' USING ERRCODE = '23514',
      HINT = 'crm_cash_session_open_has_reconciliation';
  END IF;

  -- ────────────────────────────────────────────────────────────────────
  -- A) Flujo normal -- idéntico al original, sin cambios de comportamiento.
  -- ────────────────────────────────────────────────────────────────────
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
  'CAJA-CIERRE-IDEMPOTENTE-1: cierra una caja abierta con arqueo por medio de pago (igual que 20260915180000). Ahora es idempotente -- un reintento exacto sobre una caja ya cerrada por esta RPC devuelve el snapshot existente con already_closed=true en vez de fallar, un payload distinto da un error de dominio claro (nunca 23505), y una sesión open con conciliación ya persistida (estado histórico inconsistente) se rechaza explícitamente antes de intentar escribir.';

-- REVOKE ALL ... FROM PUBLIC, anon, authenticated + GRANT solo a
-- authenticated -- mismo patrón que 20260921150000_secure_residual_hardening.sql.
-- CREATE OR REPLACE conserva los grants existentes, pero se reafirma acá
-- como defensa en profundidad (mismo criterio que esa migración).
REVOKE ALL ON FUNCTION public.crm_close_cash_session(UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_close_cash_session(UUID, JSONB, TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Guard de reapertura — a nivel de base de datos, no solo en frontend
-- ══════════════════════════════════════════════════════════════════════════
--
-- reopenCashSession() (crmService.js) hace un UPDATE directo de
-- crm_cash_sessions (status='open', closed_at=null) sin pasar por ninguna
-- RPC. Este trigger es la única barrera real contra reabrir una caja que ya
-- tiene conciliación persistida, sin importar qué código dispare el
-- UPDATE (la UI actual, un futuro cambio que la reemplace, o un cliente
-- que llame a PostgREST directo).
--
-- Solo dispara en la TRANSICIÓN hacia 'open' (OLD.status IS DISTINCT FROM
-- 'open' AND NEW.status = 'open') -- nunca en un UPDATE que deja status sin
-- cambios. Por eso no afecta ni puede fallar por la sesión histórica
-- 576511e7-5a6b-4571-bdd9-d4702b4e2cbd (ya está open hoy: cualquier UPDATE
-- futuro sobre ella que no cambie status, como editar notas/monto inicial,
-- o que la cierre, sigue funcionando igual).
CREATE OR REPLACE FUNCTION public.crm_cash_sessions_block_reopen_reconciled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'open' AND OLD.status IS DISTINCT FROM 'open' THEN
    IF EXISTS (SELECT 1 FROM public.crm_cash_session_reconciliations WHERE session_id = NEW.id) THEN
      RAISE EXCEPTION 'No se puede reabrir una caja que ya tiene conciliación registrada'
        USING ERRCODE = '23514', HINT = 'crm_cash_session_reopen_blocked_reconciled';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_cash_sessions_block_reopen_reconciled ON public.crm_cash_sessions;
CREATE TRIGGER crm_cash_sessions_block_reopen_reconciled
  BEFORE UPDATE ON public.crm_cash_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_cash_sessions_block_reopen_reconciled();

COMMENT ON TRIGGER crm_cash_sessions_block_reopen_reconciled ON public.crm_cash_sessions IS
  'CAJA-CIERRE-IDEMPOTENTE-1: bloquea a nivel de base de datos la transición status -> ''open'' de una sesión que ya tiene filas en crm_cash_session_reconciliations. Protege contra un UPDATE directo que se salte reopenCashSession()/la UI.';

NOTIFY pgrst, 'reload schema';
