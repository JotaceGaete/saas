-- Verificación MANUAL de 20260915180000_crm_cash_session_reconciliations.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción (project-ref hxxdketymcntadffmajf)
-- — solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluida esta)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_crm_cash_session_reconciliations.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- Cubre, con datos e invocaciones REALES de la RPC crm_close_cash_session
-- (no solo lectura de metadata -- ese source-scan vive en
-- 20260915180000_crm_cash_session_reconciliations.test.ts), los 10
-- escenarios de la auditoría:
--   1. gasto manual en efectivo DISMINUYE expected_cash
--   2. entrada manual en efectivo AUMENTA expected_cash
--   3. gasto manual con payment_method='bank_transfer' NO modifica expected_cash
--   4. cobro con payment_method='debit_card' NO modifica expected_cash
--   5. initial_amount SÍ forma parte de expected_cash
--   6. un pago anulado NO forma parte de ningún esperado
--   7. un movimiento anulado NO forma parte de expected_cash
--   8. cerrar omitiendo un medio con actividad real -> falla
--   9. un medio SIN actividad no es exigido -> cerrar sin esa línea funciona
--  10. doble intento de cierre de la MISMA sesión no duplica conciliación
--      (sustituto de concurrencia real -- ver nota en el bloque 10)
-- + un bonus: exige observación cuando hay diferencia (ya cubierto a nivel
--   de texto por el test A, acá se prueba en runtime real).
--
-- Un solo negocio/usuario de prueba para todos los escenarios -- cada uno
-- abre y CIERRA su propia sesión antes de pasar al siguiente, respetando
-- la constraint real uq_crm_cash_sessions_one_open_per_business (solo una
-- caja 'open' por negocio a la vez).
--
-- Para invocar la RPC como lo haría un cliente real (auth.uid() = dueño del
-- negocio), se usa el mismo patrón ya probado en
-- verify_referral_payout_requests.sql: SET LOCAL ROLE authenticated +
-- set_config('request.jwt.claim.sub', ...) antes de cada llamada, RESET
-- ROLE después. El setup (insertar sesiones/pagos/movimientos de prueba)
-- se hace directamente como el rol que conecta psql (postgres/superuser),
-- igual que en verify_crm_cash_documents_reconciliation.sql.
--
-- Todo el script corre en una sola transacción con ROLLBACK final -- nunca
-- persiste nada, ni siquiera localmente.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: 1 negocio real vía trigger R1 (wa_handle_new_user_business)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES ('00000000-0000-0000-0000-0000000000e1', 'cierrecaja@example.test', '{"name": "Negocio Cierre Caja"}'::jsonb, now(), 'authenticated', 'authenticated');

DO $$
DECLARE
  v_biz UUID;
BEGIN
  SELECT id INTO v_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000e1';
  ASSERT v_biz IS NOT NULL, 'FAIL: setup — el trigger R1 no creó el negocio de prueba';
  PERFORM set_config('test.biz_id', v_biz::text, true);
  RAISE NOTICE 'OK: setup — negocio de prueba creado vía trigger R1 real. biz=%', v_biz;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 1: gasto manual en efectivo (direction='out', payment_method=
-- 'cash') DISMINUYE expected_cash.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 10000) RETURNING id INTO v_session;

  INSERT INTO public.crm_cash_movements (business_id, session_id, direction, amount, reason, payment_method)
  VALUES (v_biz, v_session, 'out', 3000, 'Compra de insumos en efectivo', 'cash');

  PERFORM set_config('test.session1', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_session UUID := current_setting('test.session1')::uuid;
  v_result JSONB;
BEGIN
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 7000, 'notes', NULL)),
    NULL
  );
  ASSERT (v_result->'session'->>'expected_cash')::numeric = 7000,
    'FAIL escenario 1: expected_cash debería ser 10000 - 3000 = 7000, fue ' || (v_result->'session'->>'expected_cash');
  ASSERT (v_result->'session'->>'cash_difference')::numeric = 0,
    'FAIL escenario 1: no debería haber diferencia (contado = esperado)';
  RAISE NOTICE 'OK: escenario 1 — salida manual en efectivo ($3.000) DISMINUYE expected_cash: 10000 -> 7000';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 2: entrada manual en efectivo (direction='in', payment_method=
-- 'cash') AUMENTA expected_cash.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 10000) RETURNING id INTO v_session;

  INSERT INTO public.crm_cash_movements (business_id, session_id, direction, amount, reason, category, payment_method)
  VALUES (v_biz, v_session, 'in', 5000, 'Fondo de caja adicional', 'cash_fund', 'cash');

  PERFORM set_config('test.session2', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_session UUID := current_setting('test.session2')::uuid;
  v_result JSONB;
BEGIN
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 15000, 'notes', NULL)),
    NULL
  );
  ASSERT (v_result->'session'->>'expected_cash')::numeric = 15000,
    'FAIL escenario 2: expected_cash debería ser 10000 + 5000 = 15000, fue ' || (v_result->'session'->>'expected_cash');
  RAISE NOTICE 'OK: escenario 2 — entrada manual en efectivo ($5.000) AUMENTA expected_cash: 10000 -> 15000';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 3: gasto manual con payment_method='bank_transfer' (insertado
-- directamente para probar el filtro, aunque la UI no lo ofrezca hoy) NO
-- modifica expected_cash.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 10000) RETURNING id INTO v_session;

  -- crm_cash_movements.payment_method no tiene CHECK -- se puede insertar
  -- directamente con 'bank_transfer' aunque CashMovementModal hoy no
  -- ofrezca esa opción en su UI. Prueba real del filtro de la RPC, no solo
  -- del caso feliz (100% cash) que ya cubre todo el resto del dataset real.
  INSERT INTO public.crm_cash_movements (business_id, session_id, direction, amount, reason, payment_method)
  VALUES (v_biz, v_session, 'out', 4000, 'Prueba de filtro payment_method != cash', 'bank_transfer');

  PERFORM set_config('test.session3', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_session UUID := current_setting('test.session3')::uuid;
  v_result JSONB;
  v_recon_count INT;
BEGIN
  -- La RPC no debe exigir una línea 'bank_transfer' -- ese movimiento vive
  -- en crm_cash_movements, que la RPC SOLO usa para calcular 'cash'. Cerrar
  -- con únicamente la línea de efectivo debe alcanzar y tener éxito.
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 10000, 'notes', NULL)),
    NULL
  );
  ASSERT (v_result->'session'->>'expected_cash')::numeric = 10000,
    'FAIL escenario 3: expected_cash no debería verse afectado por el movimiento bank_transfer, fue ' || (v_result->'session'->>'expected_cash');

  SELECT count(*) INTO v_recon_count FROM public.crm_cash_session_reconciliations WHERE session_id = v_session;
  ASSERT v_recon_count = 1,
    'FAIL escenario 3: no debería haberse creado una línea de conciliación para bank_transfer (sin actividad para la RPC), hay ' || v_recon_count;

  RAISE NOTICE 'OK: escenario 3 — salida manual con payment_method=''bank_transfer'' ($4.000) NO modifica expected_cash (sigue en 10000) y no exige/crea una línea de conciliación para ese medio';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 4: un cobro (crm_payments) con payment_method='debit_card' NO
-- modifica expected_cash -- debe aparecer solo en su propio esperado de
-- debit_card.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 10000) RETURNING id INTO v_session;

  INSERT INTO public.crm_payments (business_id, amount, payment_method, cash_session_id)
  VALUES (v_biz, 25000, 'debit_card', v_session);

  PERFORM set_config('test.session4', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_session UUID := current_setting('test.session4')::uuid;
  v_result JSONB;
  v_cash_row JSONB;
  v_debit_row JSONB;
BEGIN
  -- debit_card SÍ tuvo actividad real -> la RPC debe exigir esa línea.
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(
      jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 10000, 'notes', NULL),
      jsonb_build_object('payment_method', 'debit_card', 'reconciled_amount', 25000, 'notes', NULL)
    ),
    NULL
  );
  ASSERT (v_result->'session'->>'expected_cash')::numeric = 10000,
    'FAIL escenario 4: expected_cash NO debería incluir el cobro debit_card, fue ' || (v_result->'session'->>'expected_cash');

  SELECT r INTO v_cash_row FROM jsonb_array_elements(v_result->'reconciliations') r WHERE r->>'payment_method' = 'cash';
  SELECT r INTO v_debit_row FROM jsonb_array_elements(v_result->'reconciliations') r WHERE r->>'payment_method' = 'debit_card';
  ASSERT (v_cash_row->>'expected_amount')::numeric = 10000, 'FAIL escenario 4: expected_amount de cash debería ser 10000';
  ASSERT (v_debit_row->>'expected_amount')::numeric = 25000, 'FAIL escenario 4: expected_amount de debit_card debería ser 25000 (el cobro completo)';

  RAISE NOTICE 'OK: escenario 4 — cobro debit_card ($25.000) NO afecta expected_cash (sigue en 10000) y aparece únicamente en su propio esperado de debit_card ($25.000)';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 5: el initial_amount de la sesión SÍ forma parte de expected_cash.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  -- Sesión sin NINGUNA otra actividad -- expected_cash debe ser EXACTAMENTE
  -- el fondo inicial, ni $0 ni cualquier otro valor.
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 20000) RETURNING id INTO v_session;

  PERFORM set_config('test.session5', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_session UUID := current_setting('test.session5')::uuid;
  v_result JSONB;
BEGIN
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 20000, 'notes', NULL)),
    NULL
  );
  ASSERT (v_result->'session'->>'expected_cash')::numeric = 20000,
    'FAIL escenario 5: expected_cash de una sesión sin actividad debería ser exactamente el initial_amount (20000), fue ' || (v_result->'session'->>'expected_cash');
  RAISE NOTICE 'OK: escenario 5 — sin ninguna otra actividad, expected_cash = initial_amount exacto (20000)';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 6: un pago anulado (voided_at seteado) NO forma parte de
-- ningún esperado -- ni del suyo propio ni (si fuera cash) de expected_cash.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 10000) RETURNING id INTO v_session;

  -- Pago en efectivo ANULADO -- si se contara, expected_cash sería 15000.
  INSERT INTO public.crm_payments (business_id, amount, payment_method, cash_session_id, voided_at, void_reason)
  VALUES (v_biz, 5000, 'cash', v_session, now(), 'Anulado para la prueba');

  -- Pago debit_card ANULADO -- si se contara, exigiría una línea debit_card.
  INSERT INTO public.crm_payments (business_id, amount, payment_method, cash_session_id, voided_at, void_reason)
  VALUES (v_biz, 8000, 'debit_card', v_session, now(), 'Anulado para la prueba');

  PERFORM set_config('test.session6', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_session UUID := current_setting('test.session6')::uuid;
  v_result JSONB;
BEGIN
  -- Si el pago cash anulado se hubiera contado, expected_cash sería 15000
  -- y la RPC habría EXIGIDO también una línea debit_card (por el pago
  -- debit_card anulado) -- enviar solo 'cash' con 10000 falla en ambos
  -- casos si la exclusión de anulados no funcionara.
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 10000, 'notes', NULL)),
    NULL
  );
  ASSERT (v_result->'session'->>'expected_cash')::numeric = 10000,
    'FAIL escenario 6: el pago cash anulado ($5.000) no debería sumarse a expected_cash, fue ' || (v_result->'session'->>'expected_cash');
  ASSERT jsonb_array_length(v_result->'reconciliations') = 1,
    'FAIL escenario 6: el pago debit_card anulado no debería exigir/crear una línea de conciliación propia';
  RAISE NOTICE 'OK: escenario 6 — un pago anulado (cash $5.000 Y debit_card $8.000) no forma parte de NINGÚN esperado: expected_cash sigue en 10000 y no se exige línea debit_card';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 7: un movimiento anulado (voided_at seteado) NO forma parte de
-- expected_cash.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 10000) RETURNING id INTO v_session;

  -- Entrada manual en efectivo ANULADA -- si se contara, expected_cash
  -- sería 16000.
  INSERT INTO public.crm_cash_movements (business_id, session_id, direction, amount, reason, category, payment_method, voided_at, void_reason)
  VALUES (v_biz, v_session, 'in', 6000, 'Entrada anulada para la prueba', 'cash_fund', 'cash', now(), 'Anulado para la prueba');

  PERFORM set_config('test.session7', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_session UUID := current_setting('test.session7')::uuid;
  v_result JSONB;
BEGIN
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 10000, 'notes', NULL)),
    NULL
  );
  ASSERT (v_result->'session'->>'expected_cash')::numeric = 10000,
    'FAIL escenario 7: la entrada manual anulada ($6.000) no debería sumarse a expected_cash, fue ' || (v_result->'session'->>'expected_cash');
  RAISE NOTICE 'OK: escenario 7 — una entrada manual anulada ($6.000) NO forma parte de expected_cash (sigue en 10000)';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 8: cerrar sin incluir en p_reconciliations un medio que tuvo
-- actividad real -> la RPC debe fallar.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 10000) RETURNING id INTO v_session;

  -- debit_card SÍ tuvo actividad real -- omitirla al cerrar debe fallar.
  INSERT INTO public.crm_payments (business_id, amount, payment_method, cash_session_id)
  VALUES (v_biz, 30000, 'debit_card', v_session);

  PERFORM set_config('test.session8', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_session UUID := current_setting('test.session8')::uuid;
  v_caught  BOOLEAN := false;
  v_msg     TEXT;
BEGIN
  BEGIN
    -- Omite deliberadamente la línea de debit_card.
    PERFORM public.crm_close_cash_session(
      v_session,
      jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 10000, 'notes', NULL)),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
  END;

  ASSERT v_caught, 'FAIL escenario 8: cerrar sin conciliar debit_card (con actividad real) debería haber lanzado una excepción';
  ASSERT v_msg LIKE 'Falta conciliar%',
    'FAIL escenario 8: el mensaje de error debería empezar con ''Falta conciliar'', fue: ' || v_msg;
  RAISE NOTICE 'OK: escenario 8 — cerrar omitiendo debit_card (con $30.000 de actividad real) FALLA con: %', v_msg;
END $$;

RESET ROLE;

DO $$
DECLARE
  v_session UUID := current_setting('test.session8')::uuid;
  v_status TEXT;
  v_recon_count INT;
BEGIN
  SELECT status INTO v_status FROM public.crm_cash_sessions WHERE id = v_session;
  ASSERT v_status = 'open', 'FAIL escenario 8: la sesión NO debería haber quedado cerrada tras el intento fallido, status=' || v_status;

  SELECT count(*) INTO v_recon_count FROM public.crm_cash_session_reconciliations WHERE session_id = v_session;
  ASSERT v_recon_count = 0, 'FAIL escenario 8: el intento fallido no debería haber persistido ninguna fila de conciliación, hay ' || v_recon_count;

  RAISE NOTICE 'OK: escenario 8 — tras el intento fallido, la sesión sigue ''open'' y no quedó ninguna fila de conciliación persistida (rollback completo del intento)';
END $$;

-- Limpieza explícita: la sesión de este escenario quedó deliberadamente
-- 'open' a propósito (para poder verificar arriba que el intento fallido
-- no la cerró ni dejó conciliaciones). Una vez verificado eso, hay que
-- liberarla -- si no, el escenario siguiente no puede abrir SU propia
-- sesión para el mismo v_biz (uq_crm_cash_sessions_one_open_per_business
-- permite solo una caja 'open' por negocio a la vez, y todo este script
-- reutiliza un único negocio de prueba). Cierre directo de la fila, no vía
-- la RPC: crm_close_cash_session ya quedó probada en los demás escenarios,
-- esto es únicamente higiene de fixtures para no romper el aislamiento del
-- siguiente bloque.
DO $$
DECLARE
  v_session UUID := current_setting('test.session8')::uuid;
BEGIN
  UPDATE public.crm_cash_sessions
  SET status = 'closed', closed_at = now()
  WHERE id = v_session;
  RAISE NOTICE 'OK: escenario 8 — limpieza: sesión de prueba liberada (cerrada directamente, sin pasar por la RPC) para no bloquear uq_crm_cash_sessions_one_open_per_business en el escenario siguiente';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 9: un medio SIN actividad en la sesión (nunca apareció en
-- crm_payments/crm_cash_movements) NO es exigido -- cerrar sin esa línea
-- debe tener éxito.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  -- Sin ningún crm_payments ni crm_cash_movements de ningún medio -- solo
  -- el fondo inicial. 'mercado_pago' NUNCA aparece en esta sesión.
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 10000) RETURNING id INTO v_session;

  PERFORM set_config('test.session9', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_session UUID := current_setting('test.session9')::uuid;
  v_result JSONB;
  v_has_mp BOOLEAN;
BEGIN
  -- No se manda ninguna línea de mercado_pago -- debe cerrar igual, sin error.
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 10000, 'notes', NULL)),
    NULL
  );
  ASSERT (v_result->'session'->>'status') = 'closed',
    'FAIL escenario 9: la sesión debería haber cerrado exitosamente sin necesitar una línea de mercado_pago';

  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(v_result->'reconciliations') r WHERE r->>'payment_method' = 'mercado_pago') INTO v_has_mp;
  ASSERT NOT v_has_mp, 'FAIL escenario 9: no debería haberse creado una línea de conciliación para mercado_pago (nunca tuvo actividad)';

  RAISE NOTICE 'OK: escenario 9 — un medio sin actividad (mercado_pago) NO se exige en p_reconciliations: la sesión cerró con éxito enviando solo la línea de efectivo';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO 10: doble intento de cierre de la MISMA sesión no debe producir
-- dos filas de conciliación ni dejar la sesión en un estado inconsistente.
--
-- NOTA sobre el sustituto de concurrencia: este script corre secuencial
-- con psql -f en una sola conexión/transacción, lo que hace impráctico
-- simular dos conexiones concurrentes reales dentro de este mismo archivo.
-- Como permite explícitamente la auditoría, se sustituye por una prueba de
-- IDEMPOTENCIA SECUENCIAL: se cierra la sesión una vez (éxito), y se
-- reintenta cerrarla una segunda vez inmediatamente después (debe fallar
-- con "La caja ya está cerrada" y no debe alterar nada). El lock real
-- (`FOR UPDATE OF s`) que haría bloquear/serializar dos conexiones
-- concurrentes genuinas ya está verificado a nivel de código fuente en
-- 20260915180000_crm_cash_session_reconciliations.test.ts
-- ("toma un lock de fila (FOR UPDATE) sobre la sesión antes de leer/
-- escribir nada") -- ambas pruebas juntas cubren el escenario.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 10000) RETURNING id INTO v_session;

  PERFORM set_config('test.session10', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_session UUID := current_setting('test.session10')::uuid;
  v_result JSONB;
  v_closed_at_1 TIMESTAMPTZ;
BEGIN
  -- Primer cierre: éxito.
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 10000, 'notes', NULL)),
    NULL
  );
  ASSERT (v_result->'session'->>'status') = 'closed', 'FAIL escenario 10: el primer cierre debería haber tenido éxito';

  SELECT closed_at INTO v_closed_at_1 FROM public.crm_cash_sessions WHERE id = v_session;
  PERFORM set_config('test.session10_closed_at', v_closed_at_1::text, true);

  RAISE NOTICE 'OK: escenario 10 (parte 1/2) — primer cierre exitoso, closed_at=%', v_closed_at_1;
END $$;

DO $$
DECLARE
  v_session   UUID := current_setting('test.session10')::uuid;
  v_caught    BOOLEAN := false;
  v_msg       TEXT;
  v_sqlstate  TEXT;
BEGIN
  -- Segundo intento de cierre de la MISMA sesión (ya cerrada) -- debe fallar.
  BEGIN
    PERFORM public.crm_close_cash_session(
      v_session,
      jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 10000, 'notes', NULL)),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
    v_sqlstate := SQLSTATE;
  END;

  ASSERT v_caught, 'FAIL escenario 10: el segundo intento de cierre debería haber lanzado una excepción';
  -- Verificación semántica ASCII-safe: comparar el mensaje EXACTO contra
  -- 'La caja ya está cerrada' es frágil frente a clientes psql/Windows con
  -- client_encoding distinto de UTF-8 (mojibake real observado en la 'á'
  -- durante una corrida local -- el rechazo era correcto, solo la
  -- comparación de bytes fallaba). Se verifica el SQLSTATE exacto (23514,
  -- el mismo que usa RAISE EXCEPTION 'La caja ya está cerrada' en la RPC)
  -- más un LIKE anclado en el prefijo/sufijo 100% ASCII del mensaje, sin
  -- tocar el carácter acentuado -- no debilita lo que se verifica, solo
  -- deja de depender de un byte sensible al encoding del cliente.
  ASSERT v_sqlstate = '23514',
    'FAIL escenario 10: el segundo intento debería fallar con SQLSTATE 23514, fue ' || COALESCE(v_sqlstate, 'NULL');
  ASSERT v_msg LIKE 'La caja ya%cerrada',
    'FAIL escenario 10: el mensaje del segundo intento debería empezar con ''La caja ya'' y terminar en ''cerrada'', fue: ' || v_msg;

  RAISE NOTICE 'OK: escenario 10 (parte 2/2) — el segundo intento de cierre de la misma sesión fue rechazado con: %', v_msg;
END $$;

RESET ROLE;

DO $$
DECLARE
  v_session UUID := current_setting('test.session10')::uuid;
  v_recon_count  INT;
  v_status       TEXT;
  v_closed_at_2  TIMESTAMPTZ;
  v_closed_at_1  TIMESTAMPTZ := current_setting('test.session10_closed_at')::timestamptz;
BEGIN
  SELECT count(*) INTO v_recon_count FROM public.crm_cash_session_reconciliations WHERE session_id = v_session;
  ASSERT v_recon_count = 1,
    'FAIL escenario 10: debería existir EXACTAMENTE 1 fila de conciliación (la del primer cierre), hay ' || v_recon_count;

  SELECT status, closed_at INTO v_status, v_closed_at_2 FROM public.crm_cash_sessions WHERE id = v_session;
  ASSERT v_status = 'closed', 'FAIL escenario 10: la sesión debería seguir closed tras el intento fallido';
  ASSERT v_closed_at_2 = v_closed_at_1,
    'FAIL escenario 10: closed_at no debería haber cambiado tras el segundo intento (fallido) -- el estado quedó inconsistente';

  RAISE NOTICE 'OK: escenario 10 — el doble intento de cierre NO produjo dos filas de conciliación (hay exactamente 1) ni dejó la sesión en un estado inconsistente (status=closed, closed_at sin cambios)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BONUS (no numerado en la auditoría, prueba en runtime real de una regla
-- ya cubierta a nivel de texto por el test A): si hay diferencia entre
-- esperado y conciliado, p_closing_notes es obligatorio.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
  v_session UUID;
BEGIN
  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 10000) RETURNING id INTO v_session;

  PERFORM set_config('test.session_bonus', v_session::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);

DO $$
DECLARE
  v_session   UUID := current_setting('test.session_bonus')::uuid;
  v_caught    BOOLEAN := false;
  v_msg       TEXT;
  v_sqlstate  TEXT;
  v_result    JSONB;
BEGIN
  -- Contado ($9.500) distinto de esperado ($10.000), sin observación -> falla.
  BEGIN
    PERFORM public.crm_close_cash_session(
      v_session,
      jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 9500, 'notes', NULL)),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
    v_sqlstate := SQLSTATE;
  END;
  -- Mismo criterio ASCII-safe que el escenario 10: SQLSTATE exacto + LIKE
  -- anclado antes de la palabra acentuada ('observación') en vez de
  -- comparar el mensaje completo, para no depender de un byte sensible al
  -- encoding del cliente psql.
  ASSERT v_caught AND v_sqlstate = '23514' AND v_msg LIKE 'Debes indicar una%',
    'FAIL bonus: cerrar con diferencia y sin observación debería fallar con SQLSTATE 23514 y mensaje que empiece con "Debes indicar una...", fue caught=' || v_caught || ' sqlstate=' || COALESCE(v_sqlstate, 'NULL') || ' msg=' || COALESCE(v_msg, 'NULL');
  RAISE NOTICE 'OK: bonus (1/2) — diferencia sin observación FALLA con: %', v_msg;

  -- La MISMA diferencia, ahora con observación -> éxito.
  v_result := public.crm_close_cash_session(
    v_session,
    jsonb_build_array(jsonb_build_object('payment_method', 'cash', 'reconciled_amount', 9500, 'notes', NULL)),
    'Faltante de $500, posible vuelto mal entregado'
  );
  ASSERT (v_result->'session'->>'cash_difference')::numeric = -500,
    'FAIL bonus: cash_difference debería ser -500 (9500 - 10000)';
  RAISE NOTICE 'OK: bonus (2/2) — la misma diferencia CON observación cierra con éxito, cash_difference=-500';
END $$;

RESET ROLE;

-- Revertir todo — este script nunca deja datos de prueba en la base.
ROLLBACK;
