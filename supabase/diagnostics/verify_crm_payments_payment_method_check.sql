-- Verificación MANUAL de 20260916150000_crm_payments_payment_method_check.sql
-- (hotfix TPV-PAYMENT-METHODS-2).
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción (project-ref hxxdketymcntadffmajf)
-- — solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluido el hotfix)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_crm_payments_payment_method_check.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- Dos partes:
--   PARTE 1 (A-J): INSERT directos en crm_payments, probando la constraint
--   crm_payments_payment_method_check en sí misma -- exactamente el punto
--   donde falló el smoke test real de producción (la RPC ya validaba bien,
--   la tabla rechazaba igual). Corren como el rol que conecta psql
--   (postgres/superuser) -- acá no se está probando RLS/ownership, se está
--   probando la CHECK constraint de la tabla en sí, que aplica
--   independientemente del rol.
--
--   PARTE 2: re-ejecuta los escenarios CRÍTICOS de
--   verify_crm_pos_payment_methods.sql (PR #70) a través de la RPC real
--   crm_create_pos_sale, para demostrar el round-trip COMPLETO funcionando
--   ahora: RPC-level check + tabla-level CHECK constraint alineados. Sigue
--   el mismo patrón ya corregido en ese archivo: la invocación de la RPC
--   corre bajo `role=authenticated` + auth.uid() real (nunca se debilita
--   ese chequeo), y las inspecciones posteriores de crm_payments corren
--   bajo RESET ROLE (postgres/superuser) -- el shadow local de Supabase no
--   replica el GRANT implícito de plataforma sobre wa_businesses que la
--   policy de crm_payments necesita bajo authenticated.
--
-- Todo el script corre en una sola transacción con ROLLBACK final -- nunca
-- persiste nada, ni siquiera localmente.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: 1 negocio real vía trigger R1, 1 producto con stock bajo (para
-- volver a probar STOCK_INSUFFICIENT en la parte 2) y 1 caja abierta.
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES ('00000000-0000-0000-0000-0000000000f2', 'crmpaymentscheck@example.test', '{"name": "Negocio Constraint Medios"}'::jsonb, now(), 'authenticated', 'authenticated');

DO $$
DECLARE
  v_biz               UUID;
  v_product_low_stock UUID;
  v_session           UUID;
BEGIN
  SELECT id INTO v_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000f2';
  ASSERT v_biz IS NOT NULL, 'FAIL: setup -- el trigger R1 no creó el negocio de prueba';
  PERFORM set_config('test.biz_id', v_biz::text, true);

  INSERT INTO public.wa_products (business_id, name, price, stock_actual)
  VALUES (v_biz, 'Producto con stock bajo', 6000, 1) RETURNING id INTO v_product_low_stock;
  PERFORM set_config('test.product_low_stock', v_product_low_stock::text, true);

  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 0) RETURNING id INTO v_session;
  PERFORM set_config('test.session_id', v_session::text, true);

  RAISE NOTICE 'OK: setup -- negocio, producto y caja abierta de prueba creados. biz=%, session=%', v_biz, v_session;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE 1 — la constraint crm_payments_payment_method_check en sí misma
-- (INSERT directo, sin pasar por la RPC). Corre como postgres/superuser --
-- se está probando el CHECK de la tabla, no RLS.
-- ══════════════════════════════════════════════════════════════════════════

-- A. cash aceptado.
DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
BEGIN
  INSERT INTO public.crm_payments (business_id, amount, payment_method) VALUES (v_biz, 1000, 'cash');
  RAISE NOTICE 'OK: escenario A -- INSERT con payment_method=cash aceptado por la constraint';
END $$;

-- B. card (legacy) aceptado.
DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
BEGIN
  INSERT INTO public.crm_payments (business_id, amount, payment_method) VALUES (v_biz, 1000, 'card');
  RAISE NOTICE 'OK: escenario B -- INSERT con payment_method=card (legacy) aceptado por la constraint';
END $$;

-- C. debit_card aceptado -- exactamente el caso que falló en el smoke test real.
DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
BEGIN
  INSERT INTO public.crm_payments (business_id, amount, payment_method) VALUES (v_biz, 1000, 'debit_card');
  RAISE NOTICE 'OK: escenario C -- INSERT con payment_method=debit_card aceptado por la constraint (el bug real de producción queda corregido)';
END $$;

-- D. credit_card aceptado.
DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
BEGIN
  INSERT INTO public.crm_payments (business_id, amount, payment_method) VALUES (v_biz, 1000, 'credit_card');
  RAISE NOTICE 'OK: escenario D -- INSERT con payment_method=credit_card aceptado por la constraint';
END $$;

-- E. bank_transfer aceptado.
DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
BEGIN
  INSERT INTO public.crm_payments (business_id, amount, payment_method) VALUES (v_biz, 1000, 'bank_transfer');
  RAISE NOTICE 'OK: escenario E -- INSERT con payment_method=bank_transfer aceptado por la constraint';
END $$;

-- F. mercado_pago aceptado.
DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
BEGIN
  INSERT INTO public.crm_payments (business_id, amount, payment_method) VALUES (v_biz, 1000, 'mercado_pago');
  RAISE NOTICE 'OK: escenario F -- INSERT con payment_method=mercado_pago aceptado por la constraint';
END $$;

-- G. check aceptado.
DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
BEGIN
  INSERT INTO public.crm_payments (business_id, amount, payment_method) VALUES (v_biz, 1000, 'check');
  RAISE NOTICE 'OK: escenario G -- INSERT con payment_method=check aceptado por la constraint';
END $$;

-- H. other aceptado.
DO $$
DECLARE
  v_biz UUID := current_setting('test.biz_id')::uuid;
BEGIN
  INSERT INTO public.crm_payments (business_id, amount, payment_method) VALUES (v_biz, 1000, 'other');
  RAISE NOTICE 'OK: escenario H -- INSERT con payment_method=other aceptado por la constraint';
END $$;

-- I. 'credit' (cuenta corriente) SIGUE rechazado por la constraint -- nunca
--    se confunde con credit_card.
DO $$
DECLARE
  v_biz      UUID := current_setting('test.biz_id')::uuid;
  v_caught   BOOLEAN := false;
  v_msg      TEXT;
  v_sqlstate TEXT;
BEGIN
  BEGIN
    INSERT INTO public.crm_payments (business_id, amount, payment_method) VALUES (v_biz, 1000, 'credit');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_caught, 'FAIL escenario I: INSERT con payment_method=credit debería haber sido rechazado';
  ASSERT v_sqlstate = '23514', 'FAIL escenario I: SQLSTATE debería ser 23514, fue ' || v_sqlstate;
  ASSERT v_msg LIKE '%crm_payments_payment_method_check%',
    'FAIL escenario I: el mensaje debería nombrar crm_payments_payment_method_check, fue ' || v_msg;
  RAISE NOTICE 'OK: escenario I -- ''credit'' (cuenta corriente) SIGUE rechazado por crm_payments_payment_method_check -- no se confunde con credit_card';
END $$;

-- J. un medio inventado ('bitcoin') sigue rechazado por la constraint.
DO $$
DECLARE
  v_biz      UUID := current_setting('test.biz_id')::uuid;
  v_caught   BOOLEAN := false;
  v_msg      TEXT;
  v_sqlstate TEXT;
BEGIN
  BEGIN
    INSERT INTO public.crm_payments (business_id, amount, payment_method) VALUES (v_biz, 1000, 'bitcoin');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_caught, 'FAIL escenario J: INSERT con payment_method=bitcoin debería haber sido rechazado';
  ASSERT v_sqlstate = '23514', 'FAIL escenario J: SQLSTATE debería ser 23514, fue ' || v_sqlstate;
  ASSERT v_msg LIKE '%crm_payments_payment_method_check%',
    'FAIL escenario J: el mensaje debería nombrar crm_payments_payment_method_check, fue ' || v_msg;
  RAISE NOTICE 'OK: escenario J -- un medio inventado (''bitcoin'') sigue rechazado por crm_payments_payment_method_check';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE 2 — re-ejecución de los escenarios CRÍTICOS del RPC real
-- (crm_create_pos_sale), ahora que la constraint de tabla está alineada.
-- Antes de este hotfix, estos mismos escenarios pasaban en local (porque
-- la base local reconstruida nunca tuvo la constraint) pero habrían
-- fallado en producción exactamente como el smoke test real.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true);

-- K. debit_card completa una venta de punta a punta (RPC + INSERT real en
--    crm_payments pasando la constraint).
DO $$
DECLARE
  v_biz     UUID := current_setting('test.biz_id')::uuid;
  v_invoice public.crm_invoices;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-K-debit-e2e',
    jsonb_build_array(jsonb_build_object('name', 'Item K', 'unit_price', 6000, 'quantity', 1)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(jsonb_build_object('method', 'debit_card', 'amount', 6000)),
    NULL, 'CLP'
  );
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario K: status debería ser pagada, fue ' || v_invoice.status;
  PERFORM set_config('test.invoice_k', v_invoice.id::text, true);
END $$;

RESET ROLE;

DO $$
DECLARE
  v_invoice_id UUID := current_setting('test.invoice_k')::uuid;
  v_pay        public.crm_payments;
BEGIN
  SELECT * INTO v_pay FROM public.crm_payments WHERE invoice_id = v_invoice_id;
  ASSERT v_pay.payment_method = 'debit_card', 'FAIL escenario K: payment_method debería ser debit_card, fue ' || v_pay.payment_method;
  RAISE NOTICE 'OK: escenario K -- venta 100%% pagada con debit_card completa de punta a punta (RPC + constraint de tabla)';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true);

-- L. credit_card completa una venta de punta a punta.
DO $$
DECLARE
  v_biz     UUID := current_setting('test.biz_id')::uuid;
  v_invoice public.crm_invoices;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-L-credit-card-e2e',
    jsonb_build_array(jsonb_build_object('name', 'Item L', 'unit_price', 6000, 'quantity', 1)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(jsonb_build_object('method', 'credit_card', 'amount', 6000)),
    NULL, 'CLP'
  );
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario L: status debería ser pagada, fue ' || v_invoice.status;
  PERFORM set_config('test.invoice_l', v_invoice.id::text, true);
END $$;

RESET ROLE;

DO $$
DECLARE
  v_invoice_id UUID := current_setting('test.invoice_l')::uuid;
  v_pay        public.crm_payments;
BEGIN
  SELECT * INTO v_pay FROM public.crm_payments WHERE invoice_id = v_invoice_id;
  ASSERT v_pay.payment_method = 'credit_card', 'FAIL escenario L: payment_method debería ser credit_card, fue ' || v_pay.payment_method;
  RAISE NOTICE 'OK: escenario L -- venta 100%% pagada con credit_card completa de punta a punta (RPC + constraint de tabla)';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true);

-- M. mercado_pago completa una venta de punta a punta.
DO $$
DECLARE
  v_biz     UUID := current_setting('test.biz_id')::uuid;
  v_invoice public.crm_invoices;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-M-mp-e2e',
    jsonb_build_array(jsonb_build_object('name', 'Item M', 'unit_price', 6000, 'quantity', 1)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(jsonb_build_object('method', 'mercado_pago', 'amount', 6000)),
    NULL, 'CLP'
  );
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario M: status debería ser pagada, fue ' || v_invoice.status;
  PERFORM set_config('test.invoice_m', v_invoice.id::text, true);
END $$;

RESET ROLE;

DO $$
DECLARE
  v_invoice_id UUID := current_setting('test.invoice_m')::uuid;
  v_pay        public.crm_payments;
BEGIN
  SELECT * INTO v_pay FROM public.crm_payments WHERE invoice_id = v_invoice_id;
  ASSERT v_pay.payment_method = 'mercado_pago', 'FAIL escenario M: payment_method debería ser mercado_pago, fue ' || v_pay.payment_method;
  RAISE NOTICE 'OK: escenario M -- venta 100%% pagada con mercado_pago completa de punta a punta (RPC + constraint de tabla)';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true);

-- N. sobrepago no-cash sigue rechazado -- solo cash puede generar vuelto.
DO $$
DECLARE
  v_biz      UUID := current_setting('test.biz_id')::uuid;
  v_caught   BOOLEAN := false;
  v_msg      TEXT;
  v_sqlstate TEXT;
BEGIN
  BEGIN
    PERFORM public.crm_create_pos_sale(
      v_biz, 'test-key-N-overpay-e2e',
      jsonb_build_array(jsonb_build_object('name', 'Item N', 'unit_price', 6000, 'quantity', 1)),
      CURRENT_DATE, NULL, 0,
      jsonb_build_array(jsonb_build_object('method', 'debit_card', 'amount', 7000)),
      NULL, 'CLP'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_caught, 'FAIL escenario N: un pago no-efectivo por encima del total debería ser rechazado';
  ASSERT v_msg = 'INVALID_PAYMENT', 'FAIL escenario N: el mensaje debería ser exactamente INVALID_PAYMENT, fue ' || v_msg;
  ASSERT v_sqlstate = '23514', 'FAIL escenario N: SQLSTATE debería ser 23514, fue ' || v_sqlstate;
  RAISE NOTICE 'OK: escenario N -- debit_card por $7.000 sobre un total de $6.000 sigue rechazado (solo cash puede generar vuelto)';
END $$;

-- O. venta mixta cash + debit_card conserva el cálculo correcto -- el cash
--    tendido de más queda capado, nunca se persiste como pago.
DO $$
DECLARE
  v_biz     UUID := current_setting('test.biz_id')::uuid;
  v_invoice public.crm_invoices;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-O-mixed-e2e',
    jsonb_build_array(jsonb_build_object('name', 'Item O', 'unit_price', 6000, 'quantity', 2)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(
      jsonb_build_object('method', 'debit_card', 'amount', 6000),
      jsonb_build_object('method', 'cash', 'amount', 8000)
    ),
    NULL, 'CLP'
  );
  ASSERT v_invoice.total = 12000, 'FAIL escenario O: total debería ser 12000, fue ' || v_invoice.total;
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario O: status debería ser pagada, fue ' || v_invoice.status;
  PERFORM set_config('test.invoice_o', v_invoice.id::text, true);
END $$;

RESET ROLE;

DO $$
DECLARE
  v_invoice_id UUID := current_setting('test.invoice_o')::uuid;
  v_cash_pay   public.crm_payments;
  v_debit_pay  public.crm_payments;
BEGIN
  SELECT * INTO v_debit_pay FROM public.crm_payments WHERE invoice_id = v_invoice_id AND payment_method = 'debit_card';
  ASSERT v_debit_pay.amount = 6000, 'FAIL escenario O: el pago debit_card debería guardarse por su monto exacto (6000), fue ' || v_debit_pay.amount;

  SELECT * INTO v_cash_pay FROM public.crm_payments WHERE invoice_id = v_invoice_id AND payment_method = 'cash';
  ASSERT v_cash_pay.amount = 6000,
    'FAIL escenario O: el cash aplicado debería quedar capado en lo que faltaba cubrir (6000), no en los 8000 tendidos -- fue ' || v_cash_pay.amount;

  RAISE NOTICE 'OK: escenario O -- venta mixta cash+debit_card ($12.000 total): debit_card guarda 6000 exacto, cash tendido en 8000 queda capado en 6000 (vuelto nunca se persiste)';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true);

-- P. STOCK_INSUFFICIENT detallado sigue funcionando con un pago no-cash --
--    la validación de stock sigue ocurriendo antes que la de pagos.
DO $$
DECLARE
  v_biz             UUID := current_setting('test.biz_id')::uuid;
  v_product         UUID := current_setting('test.product_low_stock')::uuid;
  v_caught          BOOLEAN := false;
  v_msg             TEXT;
  v_sqlstate        TEXT;
  v_expected_prefix TEXT;
BEGIN
  v_expected_prefix := 'STOCK_INSUFFICIENT:' || v_product::text || ':2:1';
  BEGIN
    PERFORM public.crm_create_pos_sale(
      v_biz, 'test-key-P-stock-e2e',
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'name', 'Producto con stock bajo', 'unit_price', 6000, 'quantity', 2)),
      CURRENT_DATE, NULL, 0,
      jsonb_build_array(jsonb_build_object('method', 'debit_card', 'amount', 12000)),
      NULL, 'CLP'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_caught, 'FAIL escenario P: pedir más stock del disponible debería lanzar una excepción';
  ASSERT v_msg = v_expected_prefix,
    'FAIL escenario P: el mensaje debería ser exactamente ' || v_expected_prefix || ', fue ' || v_msg;
  ASSERT v_sqlstate = 'P0001', 'FAIL escenario P: SQLSTATE debería ser P0001, fue ' || v_sqlstate;
  RAISE NOTICE 'OK: escenario P -- STOCK_INSUFFICIENT detallado (%) sigue funcionando con un pago debit_card', v_msg;
END $$;

RESET ROLE;

DO $$
BEGIN
  RAISE NOTICE 'OK: TODOS los escenarios de TPV-PAYMENT-METHODS-2 pasaron';
END $$;

-- Revertir todo — este script nunca deja datos de prueba en la base.
ROLLBACK;
