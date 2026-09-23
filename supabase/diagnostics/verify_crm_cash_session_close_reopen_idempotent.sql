-- Verificación MANUAL de
-- 20260923150000_crm_close_cash_session_idempotent_reopen_guard.sql
-- (CAJA-CIERRE-IDEMPOTENTE-1). NO es una migración -- no vive en
-- supabase/migrations/ a propósito, para que el CLI de Supabase nunca la
-- levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción (project-ref hxxdketymcntadffmajf)
-- -- solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluida esta)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_crm_cash_session_close_reopen_idempotent.sql
--   4. supabase stop              (apaga y descarta todo -- nada persiste)
--
-- No se pudo correr en este contenedor: no hay Docker/daemon disponible
-- (sin él no se puede levantar `supabase start`), así que este script queda
-- pendiente de ejecución manual real -- ver el reporte final para el detalle.
--
-- Cubre, con invocaciones REALES de crm_close_cash_session y del trigger
-- crm_cash_sessions_block_reopen_reconciled (no solo lectura de metadata --
-- ese source-scan vive en
-- 20260923150000_crm_close_cash_session_idempotent_reopen_guard.test.ts):
--   1. B) closed + mismo payload exacto -> idempotente (already_closed=true,
--      no escribe nada, closed_at sin cambios)
--   2. B) equivalencia semántica: numeric 45000 vs 45000.00, JSON en
--      distinto orden, notas NULL/''/espacios -- todo se sigue tratando
--      como el mismo payload
--   3. C) closed + payload con un monto distinto -> error de dominio claro,
--      nunca 23505, no escribe nada
--   4. C) closed + notas distintas -> error de dominio claro
--   5. closed sin ningún snapshot (cierre legado) -> error de dominio claro
--   6. D) open + conciliación YA persistida (estado histórico inconsistente,
--      el caso real de producción) -> error de dominio claro, nunca intenta
--      el INSERT, no toca lo existente
--   7. reapertura de una caja con conciliación -> bloqueada por el trigger,
--      incluso con un UPDATE directo (no una RPC)
--   8. reapertura de una caja SIN conciliación -> sigue funcionando igual
--      que antes (el trigger no debe romper el camino feliz)
--   9. réplica exacta del caso de producción reportado
--      (576511e7-5a6b-4571-bdd9-d4702b4e2cbd: open + 3 filas de
--      conciliación ya persistidas) -- confirma que aplicar esta migración
--      y luego llamar a la RPC sobre una fila en ese estado no falla al
--      aplicar y sí rechaza limpiamente al invocar
--
-- Mismo patrón que verify_crm_cash_session_reconciliations.sql: 1 negocio
-- real vía trigger R1, SET LOCAL ROLE authenticated + JWT claims para
-- invocar la RPC como lo haría un cliente real, todo en una transacción con
-- ROLLBACK final -- nunca persiste nada.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: 1 negocio real vía trigger R1 (wa_handle_new_user_business)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES ('00000000-0000-0000-0000-0000000000e2', 'cierreidempotente@example.test', '{"name": "Negocio Cierre Idempotente"}'::jsonb, now(), 'authenticated', 'authenticated');

DO $$
DECLARE
  v_biz UUID;
BEGIN
  SELECT id INTO v_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000e2';
  ASSERT v_biz IS NOT NULL, 'FAIL: setup — el trigger R1 no creó el negocio de prueba';
  PERFORM set_config('test.biz_id', v_biz::text, true);
  RAISE NOTICE 'OK: setup — negocio de prueba creado vía trigger R1 real. biz=%', v_biz;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 1/2: B) closed + mismo payload exacto (incluida equivalencia
-- semántica: numeric con distinta escala, JSON en otro orden, notas
-- normalizadas) -> idempotente.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 45000) RETURNING id INTO v_session;
  PERFORM set_config('test.session1', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e2','role','authenticated')::text, true);

DO $$
DECLARE
  v_session UUID := current_setting('test.session1')::uuid;
  v_result  JSONB;
  v_closed_at_1 TIMESTAMPTZ;
BEGIN
  -- Primer cierre: 45000 (entero), notas '  con vuelto  ' (con espacios).
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 45000, 'notes', '  con vuelto  ')),
    NULL
  );
  ASSERT (v_result->>'already_closed')::boolean = false, 'FAIL escenario 1: el primer cierre no debería ser already_closed';
  ASSERT (v_result->'session'->>'status') = 'closed', 'FAIL escenario 1: el primer cierre debería dejar status=closed';

  SELECT closed_at INTO v_closed_at_1 FROM public.crm_cash_sessions WHERE id = v_session;
  PERFORM set_config('test.session1_closed_at', v_closed_at_1::text, true);
  RAISE NOTICE 'OK: escenario 1 (1/3) — primer cierre exitoso, closed_at=%', v_closed_at_1;
END $$;

DO $$
DECLARE
  v_session UUID := current_setting('test.session1')::uuid;
  v_result  JSONB;
BEGIN
  -- Reintento: 45000.00 (misma cantidad, distinta escala numérica), notas
  -- 'con vuelto' (mismo texto, sin los espacios) -- debe seguir
  -- considerándose el MISMO payload.
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 45000.00, 'notes', 'con vuelto')),
    NULL
  );
  ASSERT (v_result->>'already_closed')::boolean = true,
    'FAIL escenario 1: 45000 vs 45000.00 + notas con/sin espacios debería seguir siendo el mismo payload (already_closed=true)';
  RAISE NOTICE 'OK: escenario 1 (2/3) — reintento con 45000.00 y notas sin espacios extra reconocido como el mismo payload';
END $$;

DO $$
DECLARE
  v_session UUID := current_setting('test.session1')::uuid;
  v_result  JSONB;
BEGIN
  -- Mismo payload, pero el objeto JSON del medio con las claves en otro
  -- orden -- no debe importar: se indexa por clave, nunca se compara texto
  -- crudo.
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('notes', 'con vuelto', 'reconciled_amount', 45000, 'payment_method', 'cash')),
    NULL
  );
  ASSERT (v_result->>'already_closed')::boolean = true,
    'FAIL escenario 1: el orden de las claves del JSON no debería afectar la comparación de equivalencia';
  RAISE NOTICE 'OK: escenario 1 (3/3) — JSON con claves en otro orden reconocido como el mismo payload';
END $$;

RESET ROLE;

DO $$
DECLARE
  v_session UUID := current_setting('test.session1')::uuid;
  v_recon_count INT;
  v_closed_at_2 TIMESTAMPTZ;
  v_closed_at_1 TIMESTAMPTZ := current_setting('test.session1_closed_at')::timestamptz;
BEGIN
  SELECT count(*) INTO v_recon_count FROM public.crm_cash_session_reconciliations WHERE session_id = v_session;
  ASSERT v_recon_count = 1,
    'FAIL escenario 1: los 3 reintentos idempotentes NO deberían haber insertado filas adicionales, hay ' || v_recon_count;

  SELECT closed_at INTO v_closed_at_2 FROM public.crm_cash_sessions WHERE id = v_session;
  ASSERT v_closed_at_2 = v_closed_at_1,
    'FAIL escenario 1: closed_at no debería haber cambiado en ningún reintento idempotente';

  RAISE NOTICE 'OK: escenario 1 — después de 3 reintentos idempotentes sigue habiendo exactamente 1 fila de conciliación y closed_at sin cambios';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 3/4: C) closed + payload DISTINTO (monto y notas) -> error de
-- dominio claro, nunca 23505, no escribe nada.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 20000) RETURNING id INTO v_session;
  PERFORM set_config('test.session2', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e2','role','authenticated')::text, true);

DO $$
DECLARE
  v_session UUID := current_setting('test.session2')::uuid;
BEGIN
  PERFORM public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 20000, 'notes', NULL)),
    NULL
  );
END $$;

DO $$
DECLARE
  v_session   UUID := current_setting('test.session2')::uuid;
  v_caught    BOOLEAN := false;
  v_sqlstate  TEXT;
  v_hint      TEXT;
BEGIN
  -- Mismo medio, monto DISTINTO (20000 -> 19000).
  BEGIN
    PERFORM public.crm_close_cash_session(
      v_session,
      jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 19000, 'notes', NULL)),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_sqlstate := SQLSTATE;
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  ASSERT v_caught, 'FAIL escenario 3: un monto distinto sobre una caja ya cerrada debería fallar';
  ASSERT v_sqlstate = '23514', 'FAIL escenario 3: debería fallar con SQLSTATE 23514, fue ' || COALESCE(v_sqlstate, 'NULL');
  ASSERT v_sqlstate <> '23505', 'FAIL escenario 3: NUNCA debería fallar con 23505 (violación de la UNIQUE) -- eso es justo el bug que corrige esta migración';
  ASSERT v_hint = 'crm_cash_session_closed_mismatch',
    'FAIL escenario 3: el HINT debería ser crm_cash_session_closed_mismatch, fue ' || COALESCE(v_hint, 'NULL');
  RAISE NOTICE 'OK: escenario 3 — monto distinto sobre caja cerrada: error de dominio 23514/crm_cash_session_closed_mismatch, nunca 23505';
END $$;

DO $$
DECLARE
  v_session   UUID := current_setting('test.session2')::uuid;
  v_caught    BOOLEAN := false;
  v_hint      TEXT;
BEGIN
  -- Mismo monto, notas DISTINTAS (NULL -> 'ajuste manual').
  BEGIN
    PERFORM public.crm_close_cash_session(
      v_session,
      jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 20000, 'notes', 'ajuste manual')),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  ASSERT v_caught, 'FAIL escenario 4: notas distintas por línea sobre una caja ya cerrada deberían fallar';
  ASSERT v_hint = 'crm_cash_session_closed_mismatch',
    'FAIL escenario 4: el HINT debería ser crm_cash_session_closed_mismatch, fue ' || COALESCE(v_hint, 'NULL');
  RAISE NOTICE 'OK: escenario 4 — notas de línea distintas sobre caja cerrada: error de dominio crm_cash_session_closed_mismatch';
END $$;

RESET ROLE;

DO $$
DECLARE
  v_session UUID := current_setting('test.session2')::uuid;
  v_recon_count INT;
BEGIN
  SELECT count(*) INTO v_recon_count FROM public.crm_cash_session_reconciliations WHERE session_id = v_session;
  ASSERT v_recon_count = 1,
    'FAIL escenarios 3/4: ninguno de los dos intentos con payload distinto debería haber escrito nada, hay ' || v_recon_count;
  RAISE NOTICE 'OK: escenarios 3/4 — ningún intento con payload distinto escribió nada (sigue habiendo exactamente 1 fila, la del cierre original)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 5: closed SIN ningún snapshot (cierre legado, p. ej. vía la
-- función closeCashSession() legacy que solo hace UPDATE directo) -> error
-- de dominio claro, identificable por HINT.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount, status, closed_at)
  VALUES (v_biz, CURRENT_DATE, 5000, 'closed', now()) RETURNING id INTO v_session;
  PERFORM set_config('test.session3', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e2','role','authenticated')::text, true);

DO $$
DECLARE
  v_session   UUID := current_setting('test.session3')::uuid;
  v_caught    BOOLEAN := false;
  v_hint      TEXT;
BEGIN
  BEGIN
    PERFORM public.crm_close_cash_session(
      v_session,
      jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 5000, 'notes', NULL)),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  ASSERT v_caught, 'FAIL escenario 5: cerrar una sesión legado (closed, sin snapshot) debería fallar';
  ASSERT v_hint = 'crm_cash_session_closed_no_snapshot',
    'FAIL escenario 5: el HINT debería ser crm_cash_session_closed_no_snapshot, fue ' || COALESCE(v_hint, 'NULL');
  RAISE NOTICE 'OK: escenario 5 — cierre legado sin snapshot: error de dominio crm_cash_session_closed_no_snapshot';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 6/9: D) open + conciliación YA persistida -- réplica exacta del
-- caso real de producción (576511e7-5a6b-4571-bdd9-d4702b4e2cbd: status=
-- open, closed_at=NULL, 3 filas ya persistidas: cash, mercado_pago,
-- debit_card).
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  -- Estado histórico/inconsistente construido a propósito (como el real de
  -- producción): status='open', closed_at=NULL, con filas ya persistidas en
  -- crm_cash_session_reconciliations. Se inserta directo como el rol admin
  -- que conecta psql -- reproduce el estado, no cómo se llegó a él.
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount, status, closed_at)
  VALUES (v_biz, CURRENT_DATE, 10000, 'open', NULL) RETURNING id INTO v_session;

  INSERT INTO public.crm_cash_session_reconciliations
    (business_id, session_id, payment_method, expected_amount, reconciled_amount, notes)
  VALUES
    (v_biz, v_session, 'cash', 10000, 10000, NULL),
    (v_biz, v_session, 'mercado_pago', 5000, 5000, NULL),
    (v_biz, v_session, 'debit_card', 3000, 3000, NULL);

  PERFORM set_config('test.session4', v_session::text, true);
  RAISE NOTICE 'OK: setup escenario 6/9 — sesión open + 3 filas de conciliación ya persistidas (réplica del caso real de producción)';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e2','role','authenticated')::text, true);

DO $$
DECLARE
  v_session   UUID := current_setting('test.session4')::uuid;
  v_caught    BOOLEAN := false;
  v_sqlstate  TEXT;
  v_hint      TEXT;
BEGIN
  BEGIN
    PERFORM public.crm_close_cash_session(
      v_session,
      jsonb_build_array(
        jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 10000, 'notes', NULL),
        jsonb_build_object('payment_method', 'mercado_pago', 'reconciled_amount', 5000, 'notes', NULL),
        jsonb_build_object('payment_method', 'debit_card', 'reconciled_amount', 3000, 'notes', NULL)
      ),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_sqlstate := SQLSTATE;
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  ASSERT v_caught, 'FAIL escenario 6/9: cerrar una sesión open con conciliación ya persistida debería fallar, nunca intentar el INSERT';
  ASSERT v_sqlstate = '23514', 'FAIL escenario 6/9: debería fallar con SQLSTATE 23514, fue ' || COALESCE(v_sqlstate, 'NULL');
  ASSERT v_sqlstate <> '23505', 'FAIL escenario 6/9: NUNCA debería fallar con 23505 -- el guard debe rechazar ANTES de intentar el INSERT';
  ASSERT v_hint = 'crm_cash_session_open_has_reconciliation',
    'FAIL escenario 6/9: el HINT debería ser crm_cash_session_open_has_reconciliation, fue ' || COALESCE(v_hint, 'NULL');
  RAISE NOTICE 'OK: escenario 6/9 — sesión open con conciliación ya persistida (caso real de producción) rechazada limpiamente: 23514/crm_cash_session_open_has_reconciliation, sin intentar el INSERT';
END $$;

RESET ROLE;

DO $$
DECLARE
  v_session UUID := current_setting('test.session4')::uuid;
  v_status  TEXT;
  v_closed_at TIMESTAMPTZ;
  v_recon_count INT;
BEGIN
  -- La sesión y sus 3 conciliaciones deben seguir EXACTAMENTE igual que
  -- antes del intento de cierre -- nada se tocó ni se borró.
  SELECT status, closed_at INTO v_status, v_closed_at FROM public.crm_cash_sessions WHERE id = v_session;
  ASSERT v_status = 'open', 'FAIL escenario 6/9: la sesión debería seguir open (esta migración NO corrige el estado histórico)';
  ASSERT v_closed_at IS NULL, 'FAIL escenario 6/9: closed_at debería seguir NULL';

  SELECT count(*) INTO v_recon_count FROM public.crm_cash_session_reconciliations WHERE session_id = v_session;
  ASSERT v_recon_count = 3, 'FAIL escenario 6/9: deberían seguir existiendo las 3 filas originales, hay ' || v_recon_count;

  RAISE NOTICE 'OK: escenario 6/9 — la sesión histórica quedó exactamente igual (open, closed_at NULL, 3 filas de conciliación intactas) tras el intento de cierre rechazado';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 7: reapertura de una caja CON conciliación -- bloqueada por el
-- trigger crm_cash_sessions_block_reopen_reconciled, incluso con un UPDATE
-- directo (así es como reopenCashSession() en crmService.js la reabre hoy
-- -- no pasa por ninguna RPC).
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_session UUID := current_setting('test.session1')::uuid; -- cerrada en el escenario 1, con 1 fila de conciliación
  v_caught  BOOLEAN := false;
  v_sqlstate TEXT;
  v_hint     TEXT;
BEGIN
  BEGIN
    UPDATE public.crm_cash_sessions SET status = 'open', closed_at = NULL WHERE id = v_session;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_sqlstate := SQLSTATE;
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  ASSERT v_caught, 'FAIL escenario 7: reabrir (UPDATE directo) una caja con conciliación registrada debería fallar';
  ASSERT v_sqlstate = '23514', 'FAIL escenario 7: debería fallar con SQLSTATE 23514, fue ' || COALESCE(v_sqlstate, 'NULL');
  ASSERT v_hint = 'crm_cash_session_reopen_blocked_reconciled',
    'FAIL escenario 7: el HINT debería ser crm_cash_session_reopen_blocked_reconciled, fue ' || COALESCE(v_hint, 'NULL');

  PERFORM 1 FROM public.crm_cash_sessions WHERE id = v_session AND status = 'closed';
  ASSERT FOUND, 'FAIL escenario 7: la sesión debería seguir closed tras el intento de reapertura rechazado';

  RAISE NOTICE 'OK: escenario 7 — reapertura de caja con conciliación bloqueada a nivel de base de datos (UPDATE directo, sin pasar por ninguna RPC): 23514/crm_cash_session_reopen_blocked_reconciled';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 8: reapertura de una caja SIN conciliación -- el camino feliz
-- (closeCashSession() legado, o cualquier caja cerrada sin pasar por el
-- asistente) debe seguir funcionando igual que antes de este trigger.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount, status, closed_at)
  VALUES (v_biz, CURRENT_DATE, 1000, 'closed', now()) RETURNING id INTO v_session;

  UPDATE public.crm_cash_sessions SET status = 'open', closed_at = NULL WHERE id = v_session;

  PERFORM 1 FROM public.crm_cash_sessions WHERE id = v_session AND status = 'open' AND closed_at IS NULL;
  ASSERT FOUND, 'FAIL escenario 8: reabrir una caja SIN conciliación (camino feliz) debería seguir funcionando';

  RAISE NOTICE 'OK: escenario 8 — reapertura de una caja sin conciliación sigue funcionando igual que antes (el trigger no rompe el camino feliz)';
END $$;

ROLLBACK;
