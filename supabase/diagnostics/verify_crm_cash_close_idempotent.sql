-- Verificación MANUAL de 20260923100000_crm_cash_close_idempotent.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción (project-ref hxxdketymcntadffmajf)
-- — solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluida esta)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/verify_crm_cash_close_idempotent.sql
--   4. supabase stop
--
-- Concurrencia REAL (dos conexiones) vive aparte en
-- verify_crm_cash_close_idempotent_concurrency.sh -- este script corre en
-- una sola conexión/transacción.
--
-- Escenarios (invocaciones REALES de la RPC y UPDATEs reales como el rol
-- authenticated, igual que reopenCashSession() vía RLS):
--   1. primer cierre -> éxito, already_closed=false
--   2. repetición idéntica -> devuelve el snapshot, already_closed=true, no
--      escribe nada (filas, closed_at, closed_by, closing_notes intactos)
--   3. repetición equivalente con otra representación (monto "2000.00"
--      como string, otro orden de medios, notas vacías vs NULL, observación con espacios) ->
--      también se trata como repetición
--   4. monto distinto -> P0001 / CASH_SESSION_ALREADY_CLOSED_DIFFERENT, nada cambia
--   5. medio extra -> idem
--   6. medio faltante -> idem
--   7. nota por medio distinta -> idem
--   8. observación general distinta -> idem
--   9. payload inválido sobre caja cerrada -> sigue fallando por validación (22023)
--  10. otro usuario no puede leer el snapshot vía repetición -> 42501
--  11. reabrir (UPDATE status='open') una caja con conciliación -> bloqueado
--      por el trigger (CASH_SESSION_RECONCILED_REOPEN_BLOCKED), nada cambia
--  12. caja cerrada SIN snapshot (legacy) -> la RPC falla con
--      CASH_SESSION_ALREADY_CLOSED; reabrirla sigue permitido; cerrarla
--      después con el asistente funciona
--  13. caja 'open' que YA tiene conciliaciones (estado heredado de antes del
--      trigger, reproducido insertando las filas directamente como el rol
--      dueño de la conexión, igual que quedaron en producción) -> la RPC
--      falla con
--      CASH_SESSION_REOPENED_WITH_RECONCILIATION, NUNCA con 23505, y no
--      toca ni la sesión ni el snapshot
--
-- Todo el script corre en una sola transacción con ROLLBACK final.

BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'cierreidem@example.test', '{"name": "Negocio Cierre Idempotente"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'cierreidem-otro@example.test', '{"name": "Otro Negocio"}'::jsonb, now(), 'authenticated', 'authenticated');

DO $$
DECLARE
  v_biz UUID;
  v_session UUID;
BEGIN
  SELECT id INTO v_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000f1';
  ASSERT v_biz IS NOT NULL, 'FAIL: setup — el trigger R1 no creó el negocio de prueba';
  PERFORM set_config('test.biz_id', v_biz::text, true);

  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 10000) RETURNING id INTO v_session;
  PERFORM set_config('test.session', v_session::text, true);

  -- 2.000 cobrados con débito -> débito es obligatorio en la conciliación.
  INSERT INTO public.crm_payments (business_id, amount, payment_method, cash_session_id)
  VALUES (v_biz, 2000, 'debit_card', v_session);
  RAISE NOTICE 'OK: setup — negocio % y sesión %', v_biz, v_session;
END $$;

-- Helper de la prueba: ejecuta la RPC y devuelve SQLSTATE|HINT (o 'OK').
CREATE FUNCTION pg_temp.try_close(p_session UUID, p_payload JSONB, p_notes TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_state TEXT;
  v_hint  TEXT;
BEGIN
  PERFORM public.crm_close_cash_session(p_session, p_payload, p_notes);
  RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_hint = PG_EXCEPTION_HINT;
  RETURN v_state || '|' || COALESCE(v_hint, '');
END $$;

-- Foto del estado persistido de una sesión: fila de sesión + snapshot.
CREATE FUNCTION pg_temp.snapshot_of(p_session UUID)
RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'session', (SELECT to_jsonb(s) FROM public.crm_cash_sessions s WHERE s.id = p_session),
    'recon', (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.payment_method), '[]'::jsonb)
              FROM public.crm_cash_session_reconciliations r WHERE r.session_id = p_session)
  )
$$;

GRANT EXECUTE ON FUNCTION pg_temp.try_close(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.snapshot_of(UUID) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true);

-- ── 1 + 2 + 3: primer cierre y repeticiones equivalentes ─────────────────────
DO $$
DECLARE
  v_session UUID := current_setting('test.session')::uuid;
  v_payload JSONB := jsonb_build_array(
    jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 9500, 'notes', 'faltó vuelto'),
    jsonb_build_object('payment_method', 'debit_card', 'reconciled_amount', 2000, 'notes', NULL)
  );
  v_first  JSONB;
  v_replay JSONB;
  v_before JSONB;
BEGIN
  v_first := public.crm_close_cash_session(v_session, v_payload, 'Diferencia de vuelto');
  ASSERT (v_first->>'already_closed')::boolean = false, 'FAIL 1: already_closed debería ser false en el primer cierre';
  ASSERT (v_first->'session'->>'status') = 'closed', 'FAIL 1: la sesión debería quedar closed';
  ASSERT jsonb_array_length(v_first->'reconciliations') = 2, 'FAIL 1: deberían existir 2 conciliaciones';
  RAISE NOTICE 'OK 1: primer cierre exitoso (already_closed=false)';

  v_before := pg_temp.snapshot_of(v_session);

  v_replay := public.crm_close_cash_session(v_session, v_payload, 'Diferencia de vuelto');
  ASSERT (v_replay->>'already_closed')::boolean = true, 'FAIL 2: la repetición idéntica debería devolver already_closed=true';
  ASSERT v_replay->'reconciliations' = v_before->'recon', 'FAIL 2: la repetición debería devolver EXACTAMENTE el snapshot guardado';
  ASSERT (v_replay->'session') = (v_before->'session'), 'FAIL 2: la repetición debería devolver la sesión guardada sin cambios';
  ASSERT pg_temp.snapshot_of(v_session) = v_before, 'FAIL 2: la repetición no debería escribir nada';
  RAISE NOTICE 'OK 2: repetición idéntica -> snapshot original, sin escrituras';

  -- 3: misma semántica, otra representación.
  v_replay := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(
      jsonb_build_object('payment_method', 'debit_card', 'reconciled_amount', '2000.00', 'notes', ''),
      jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 9500.0, 'notes', 'faltó vuelto')
    ),
    '  Diferencia de vuelto  '
  );
  ASSERT (v_replay->>'already_closed')::boolean = true, 'FAIL 3: una repetición equivalente (otro orden/formato) debería tratarse como repetición';
  ASSERT pg_temp.snapshot_of(v_session) = v_before, 'FAIL 3: la repetición equivalente no debería escribir nada';
  RAISE NOTICE 'OK 3: repetición equivalente (orden, "2000.00", notas vacías, espacios) -> snapshot original';

  PERFORM set_config('test.before', v_before::text, true);
END $$;

-- ── 4..10: payloads distintos / inválidos / otro usuario ───────────────────
DO $$
DECLARE
  v_session UUID := current_setting('test.session')::uuid;
  v_before  JSONB := current_setting('test.before')::jsonb;
  v_r TEXT;
  c_diff CONSTANT TEXT := 'P0001|CASH_SESSION_ALREADY_CLOSED_DIFFERENT';
BEGIN
  -- 4: monto distinto
  v_r := pg_temp.try_close(v_session, '[{"payment_method":"cash","reconciled_amount":10000,"notes":"faltó vuelto"},{"payment_method":"debit_card","reconciled_amount":2000}]', 'Diferencia de vuelto');
  ASSERT v_r = c_diff, 'FAIL 4: monto distinto debería fallar con ' || c_diff || ', fue ' || v_r;
  -- 5: medio extra
  v_r := pg_temp.try_close(v_session, '[{"payment_method":"cash","reconciled_amount":9500,"notes":"faltó vuelto"},{"payment_method":"debit_card","reconciled_amount":2000},{"payment_method":"check","reconciled_amount":0}]', 'Diferencia de vuelto');
  ASSERT v_r = c_diff, 'FAIL 5: medio extra debería fallar con ' || c_diff || ', fue ' || v_r;
  -- 6: medio faltante
  v_r := pg_temp.try_close(v_session, '[{"payment_method":"cash","reconciled_amount":9500,"notes":"faltó vuelto"}]', 'Diferencia de vuelto');
  ASSERT v_r = c_diff, 'FAIL 6: medio faltante debería fallar con ' || c_diff || ', fue ' || v_r;
  -- 7: nota por medio distinta
  v_r := pg_temp.try_close(v_session, '[{"payment_method":"cash","reconciled_amount":9500,"notes":"otra nota"},{"payment_method":"debit_card","reconciled_amount":2000}]', 'Diferencia de vuelto');
  ASSERT v_r = c_diff, 'FAIL 7: nota distinta debería fallar con ' || c_diff || ', fue ' || v_r;
  -- 8: observación distinta (y ausente)
  v_r := pg_temp.try_close(v_session, '[{"payment_method":"cash","reconciled_amount":9500,"notes":"faltó vuelto"},{"payment_method":"debit_card","reconciled_amount":2000}]', 'Otra observación');
  ASSERT v_r = c_diff, 'FAIL 8a: observación distinta debería fallar con ' || c_diff || ', fue ' || v_r;
  v_r := pg_temp.try_close(v_session, '[{"payment_method":"cash","reconciled_amount":9500,"notes":"faltó vuelto"},{"payment_method":"debit_card","reconciled_amount":2000}]', NULL);
  ASSERT v_r = c_diff, 'FAIL 8b: observación ausente debería fallar con ' || c_diff || ', fue ' || v_r;
  -- 9: payload inválido sigue rechazado por validación
  v_r := pg_temp.try_close(v_session, '[{"payment_method":"bitcoin","reconciled_amount":1}]', NULL);
  ASSERT v_r LIKE '22023|%', 'FAIL 9: medio inválido debería fallar con 22023, fue ' || v_r;

  ASSERT pg_temp.snapshot_of(v_session) = v_before, 'FAIL 4-9: ningún intento rechazado debería haber escrito nada';
  RAISE NOTICE 'OK 4-9: payloads distintos/inválidos rechazados con error de dominio, cierre histórico intacto';

  -- 10: otro usuario (otro negocio) no puede usar la repetición para leer el snapshot
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
  v_r := pg_temp.try_close(v_session, '[{"payment_method":"cash","reconciled_amount":9500,"notes":"faltó vuelto"},{"payment_method":"debit_card","reconciled_amount":2000}]', 'Diferencia de vuelto');
  ASSERT v_r LIKE '42501|%', 'FAIL 10: otro usuario debería recibir 42501, fue ' || v_r;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  RAISE NOTICE 'OK 10: otro negocio no puede repetir/leer el cierre (42501)';
END $$;

-- ── 11: reabrir una caja con conciliación queda bloqueado ──────────────────
DO $$
DECLARE
  v_session UUID := current_setting('test.session')::uuid;
  v_before  JSONB := current_setting('test.before')::jsonb;
  v_state TEXT;
  v_hint  TEXT;
  v_caught BOOLEAN := false;
BEGIN
  BEGIN
    -- Exactamente lo que hace reopenCashSession() (UPDATE directo vía RLS).
    UPDATE public.crm_cash_sessions SET status = 'open', closed_at = NULL WHERE id = v_session;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_hint = PG_EXCEPTION_HINT;
  END;
  ASSERT v_caught, 'FAIL 11: reabrir una caja con conciliación debería estar bloqueado';
  ASSERT v_state = 'P0001' AND v_hint = 'CASH_SESSION_RECONCILED_REOPEN_BLOCKED',
    'FAIL 11: error inesperado al reabrir: ' || COALESCE(v_state, 'NULL') || '|' || COALESCE(v_hint, 'NULL');
  ASSERT pg_temp.snapshot_of(v_session) = v_before, 'FAIL 11: el intento de reabrir no debería cambiar nada';

  -- Otros UPDATE de la caja cerrada (p.ej. Editar notas) siguen funcionando.
  UPDATE public.crm_cash_sessions SET notes = 'nota editada' WHERE id = v_session;
  ASSERT (SELECT notes FROM public.crm_cash_sessions WHERE id = v_session) = 'nota editada',
    'FAIL 11: el trigger no debería bloquear UPDATEs que no reabren la caja';
  RAISE NOTICE 'OK 11: reabrir caja conciliada bloqueado (CASH_SESSION_RECONCILED_REOPEN_BLOCKED); otros UPDATE siguen permitidos';
END $$;

-- ── 12: caja cerrada SIN snapshot (cierre legacy) ──────────────────────────
DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_legacy UUID;
  v_r TEXT;
  v_result JSONB;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount, status, closed_at)
  VALUES (v_biz, CURRENT_DATE, 500, 'closed', now()) RETURNING id INTO v_legacy;

  v_r := pg_temp.try_close(v_legacy, '[{"payment_method":"cash","reconciled_amount":500}]', NULL);
  ASSERT v_r = 'P0001|CASH_SESSION_ALREADY_CLOSED', 'FAIL 12a: caja legacy cerrada debería fallar con CASH_SESSION_ALREADY_CLOSED, fue ' || v_r;
  ASSERT NOT EXISTS (SELECT 1 FROM public.crm_cash_session_reconciliations WHERE session_id = v_legacy),
    'FAIL 12a: nunca debería crearse un snapshot a posteriori para una caja legacy';

  -- Sin snapshot, reabrir sigue permitido (comportamiento previo intacto)...
  UPDATE public.crm_cash_sessions SET status = 'open', closed_at = NULL WHERE id = v_legacy;
  ASSERT (SELECT status FROM public.crm_cash_sessions WHERE id = v_legacy) = 'open', 'FAIL 12b: reabrir una caja sin snapshot debería seguir permitido';

  -- ...y el asistente puede cerrarla normalmente.
  v_result := public.crm_close_cash_session(v_legacy, '[{"payment_method":"cash","reconciled_amount":500}]', NULL);
  ASSERT (v_result->>'already_closed')::boolean = false AND (v_result->'session'->>'status') = 'closed',
    'FAIL 12c: cerrar con el asistente una caja legacy reabierta debería funcionar';
  RAISE NOTICE 'OK 12: caja legacy -> CASH_SESSION_ALREADY_CLOSED; reabrir permitido; cierre posterior OK';
END $$;

-- ── 13: caja 'open' con conciliaciones heredadas (estado previo al trigger) ─
RESET ROLE;
DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_stuck UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 700) RETURNING id INTO v_stuck;
  INSERT INTO public.crm_cash_session_reconciliations (business_id, session_id, payment_method, expected_amount, reconciled_amount)
  VALUES (v_biz, v_stuck, 'cash', 700, 700), (v_biz, v_stuck, 'mercado_pago', 0, 0);
  PERFORM set_config('test.stuck', v_stuck::text, true);
END $$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_stuck  UUID := current_setting('test.stuck')::uuid;
  v_before JSONB := pg_temp.snapshot_of(current_setting('test.stuck')::uuid);
  v_r TEXT;
BEGIN
  v_r := pg_temp.try_close(v_stuck, '[{"payment_method":"cash","reconciled_amount":700},{"payment_method":"mercado_pago","reconciled_amount":0}]', NULL);
  ASSERT v_r = 'P0001|CASH_SESSION_REOPENED_WITH_RECONCILIATION',
    'FAIL 13: caja abierta con snapshot previo debería fallar con CASH_SESSION_REOPENED_WITH_RECONCILIATION (nunca 23505), fue ' || v_r;
  ASSERT pg_temp.snapshot_of(v_stuck) = v_before, 'FAIL 13: el intento no debería tocar la sesión ni el snapshot heredado';
  RAISE NOTICE 'OK 13: caja reabierta con snapshot heredado -> error de dominio, sin 23505 y sin escrituras';
END $$;

RESET ROLE;

ROLLBACK;
