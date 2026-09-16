-- Verificación MANUAL de 20260916100000_crm_pos_payment_methods.sql
-- (hotfix TPV-PAYMENT-METHODS-1).
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción (project-ref hxxdketymcntadffmajf)
-- — solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluido el hotfix)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_crm_pos_payment_methods.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- Cubre, con datos e invocaciones REALES de crm_create_pos_sale (no solo
-- lectura de metadata -- ese source-scan vive en
-- 20260916100000_crm_pos_payment_methods.test.ts), los 18 puntos pedidos:
--   A. cash aceptado (+ #17 cash_session_id asociado)
--   B. card (legacy) aceptado
--   C. debit_card aceptado (+ #12, #16 payment_method persistido exacto)
--   D. credit_card aceptado (+ #13, #16)
--   E. mercado_pago aceptado (+ #14, #16)
--   F. bank_transfer aceptado (#5)
--   G. check aceptado (#7)
--   H. other aceptado (#8)
--   I. medio inventado ('bitcoin') sigue fallando INVALID_PAYMENT/23514 (#9)
--   J. 'credit' sigue rechazado -- NO se confunde con credit_card (#10)
--   K. no-efectivo que supera el total sigue rechazado (#11)
--   L. venta mixta cash + debit_card conserva el cálculo correcto (#15)
--   M. STOCK_INSUFFICIENT detallado sigue funcionando con un pago no-cash (#18)
--
-- Un solo negocio de prueba para todos los escenarios -- cada uno usa una
-- pos_idempotency_key distinta (no hay conflicto de idempotencia entre
-- escenarios) y una venta 100% nueva por escenario, sin reutilizar estado
-- entre ellos salvo el negocio/caja abierta/productos de setup.
--
-- Para invocar la RPC como lo haría un cliente real (auth.uid() = dueño del
-- negocio), se usa el mismo patrón ya probado en
-- verify_crm_cash_session_reconciliations.sql: SET LOCAL ROLE authenticated +
-- set_config('request.jwt.claim.sub', ...) antes de cada llamada, RESET
-- ROLE después. El setup (negocio/productos/caja) se hace directamente como
-- el rol que conecta psql (postgres/superuser).
--
-- Todo el script corre en una sola transacción con ROLLBACK final -- nunca
-- persiste nada, ni siquiera localmente.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: 1 negocio real vía trigger R1, 2 productos (uno sin control de
-- stock para los escenarios normales, uno con stock=1 para el escenario de
-- STOCK_INSUFFICIENT) y 1 caja abierta (paid_total > 0 la requiere).
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES ('00000000-0000-0000-0000-0000000000f1', 'tpvpaymentmethods@example.test', '{"name": "Negocio TPV Medios"}'::jsonb, now(), 'authenticated', 'authenticated');

DO $$
DECLARE
  v_biz               UUID;
  v_product_ok        UUID;
  v_product_low_stock UUID;
  v_session           UUID;
BEGIN
  SELECT id INTO v_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000f1';
  ASSERT v_biz IS NOT NULL, 'FAIL: setup -- el trigger R1 no creó el negocio de prueba';
  PERFORM set_config('test.biz_id', v_biz::text, true);

  INSERT INTO public.wa_products (business_id, name, price, stock_actual)
  VALUES (v_biz, 'Producto sin control de stock', 6000, NULL) RETURNING id INTO v_product_ok;
  PERFORM set_config('test.product_ok', v_product_ok::text, true);

  INSERT INTO public.wa_products (business_id, name, price, stock_actual)
  VALUES (v_biz, 'Producto con stock bajo', 6000, 1) RETURNING id INTO v_product_low_stock;
  PERFORM set_config('test.product_low_stock', v_product_low_stock::text, true);

  INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
  VALUES (v_biz, CURRENT_DATE, 0) RETURNING id INTO v_session;
  PERFORM set_config('test.session_id', v_session::text, true);

  RAISE NOTICE 'OK: setup -- negocio, productos y caja abierta de prueba creados. biz=%, session=%', v_biz, v_session;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true);

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO A: cash aceptado. Venta pagada 100% en efectivo -> éxito,
-- payment_method persistido = 'cash', cash_session_id asociado (#17).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_biz     UUID := current_setting('test.biz_id')::uuid;
  v_session UUID := current_setting('test.session_id')::uuid;
  v_invoice public.crm_invoices;
  v_pay     public.crm_payments;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-A-cash',
    jsonb_build_array(jsonb_build_object('name', 'Item A', 'unit_price', 6000, 'quantity', 1)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 6000)),
    NULL, 'CLP'
  );
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario A: status debería ser pagada, fue ' || v_invoice.status;

  SELECT * INTO v_pay FROM public.crm_payments WHERE invoice_id = v_invoice.id;
  ASSERT v_pay.payment_method = 'cash', 'FAIL escenario A: payment_method debería ser cash, fue ' || v_pay.payment_method;
  ASSERT v_pay.cash_session_id = v_session, 'FAIL escenario A: cash_session_id debería ser la sesión abierta de prueba';

  RAISE NOTICE 'OK: escenario A -- cash aceptado, venta pagada, payment_method=cash, cash_session_id asociado correctamente';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO B: card (legacy) sigue aceptado -- compatibilidad histórica.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_biz     UUID := current_setting('test.biz_id')::uuid;
  v_invoice public.crm_invoices;
  v_pay     public.crm_payments;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-B-card',
    jsonb_build_array(jsonb_build_object('name', 'Item B', 'unit_price', 6000, 'quantity', 1)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(jsonb_build_object('method', 'card', 'amount', 6000)),
    NULL, 'CLP'
  );
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario B: status debería ser pagada, fue ' || v_invoice.status;

  SELECT * INTO v_pay FROM public.crm_payments WHERE invoice_id = v_invoice.id;
  ASSERT v_pay.payment_method = 'card', 'FAIL escenario B: payment_method debería seguir siendo card (legacy), fue ' || v_pay.payment_method;

  RAISE NOTICE 'OK: escenario B -- card (legacy) sigue aceptado, payment_method=card sin reclasificar';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO C: debit_card aceptado (#3, #12). payment_method persistido
-- EXACTO -- no debe terminar guardado como 'card' (#16).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_biz     UUID := current_setting('test.biz_id')::uuid;
  v_invoice public.crm_invoices;
  v_pay     public.crm_payments;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-C-debit',
    jsonb_build_array(jsonb_build_object('name', 'Item C', 'unit_price', 6000, 'quantity', 1)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(jsonb_build_object('method', 'debit_card', 'amount', 6000)),
    NULL, 'CLP'
  );
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario C: status debería ser pagada, fue ' || v_invoice.status;

  SELECT * INTO v_pay FROM public.crm_payments WHERE invoice_id = v_invoice.id;
  ASSERT v_pay.payment_method = 'debit_card',
    'FAIL escenario C: payment_method debería ser EXACTAMENTE debit_card (no card), fue ' || v_pay.payment_method;

  RAISE NOTICE 'OK: escenario C -- debit_card aceptado, venta 100%% pagada, payment_method=debit_card (nunca card)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO D: credit_card aceptado (#4, #13). payment_method persistido
-- EXACTO -- no debe terminar guardado como 'card' (#16).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_biz     UUID := current_setting('test.biz_id')::uuid;
  v_invoice public.crm_invoices;
  v_pay     public.crm_payments;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-D-credit-card',
    jsonb_build_array(jsonb_build_object('name', 'Item D', 'unit_price', 6000, 'quantity', 1)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(jsonb_build_object('method', 'credit_card', 'amount', 6000)),
    NULL, 'CLP'
  );
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario D: status debería ser pagada, fue ' || v_invoice.status;

  SELECT * INTO v_pay FROM public.crm_payments WHERE invoice_id = v_invoice.id;
  ASSERT v_pay.payment_method = 'credit_card',
    'FAIL escenario D: payment_method debería ser EXACTAMENTE credit_card (no card), fue ' || v_pay.payment_method;

  RAISE NOTICE 'OK: escenario D -- credit_card aceptado, venta 100%% pagada, payment_method=credit_card (nunca card)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO E: mercado_pago aceptado (#6, #14). payment_method persistido
-- EXACTO -- no debe terminar guardado como 'other' (#16).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_biz     UUID := current_setting('test.biz_id')::uuid;
  v_invoice public.crm_invoices;
  v_pay     public.crm_payments;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-E-mp',
    jsonb_build_array(jsonb_build_object('name', 'Item E', 'unit_price', 6000, 'quantity', 1)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(jsonb_build_object('method', 'mercado_pago', 'amount', 6000)),
    NULL, 'CLP'
  );
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario E: status debería ser pagada, fue ' || v_invoice.status;

  SELECT * INTO v_pay FROM public.crm_payments WHERE invoice_id = v_invoice.id;
  ASSERT v_pay.payment_method = 'mercado_pago',
    'FAIL escenario E: payment_method debería ser EXACTAMENTE mercado_pago (no other), fue ' || v_pay.payment_method;

  RAISE NOTICE 'OK: escenario E -- mercado_pago aceptado, venta 100%% pagada, payment_method=mercado_pago (nunca other)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO F: bank_transfer aceptado (#5).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_biz     UUID := current_setting('test.biz_id')::uuid;
  v_invoice public.crm_invoices;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-F-transfer',
    jsonb_build_array(jsonb_build_object('name', 'Item F', 'unit_price', 6000, 'quantity', 1)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(jsonb_build_object('method', 'bank_transfer', 'amount', 6000)),
    NULL, 'CLP'
  );
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario F: status debería ser pagada, fue ' || v_invoice.status;
  RAISE NOTICE 'OK: escenario F -- bank_transfer aceptado, venta 100%% pagada';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO G: check aceptado (#7).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_biz     UUID := current_setting('test.biz_id')::uuid;
  v_invoice public.crm_invoices;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-G-check',
    jsonb_build_array(jsonb_build_object('name', 'Item G', 'unit_price', 6000, 'quantity', 1)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(jsonb_build_object('method', 'check', 'amount', 6000)),
    NULL, 'CLP'
  );
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario G: status debería ser pagada, fue ' || v_invoice.status;
  RAISE NOTICE 'OK: escenario G -- check aceptado, venta 100%% pagada';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO H: other aceptado (#8).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_biz     UUID := current_setting('test.biz_id')::uuid;
  v_invoice public.crm_invoices;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-H-other',
    jsonb_build_array(jsonb_build_object('name', 'Item H', 'unit_price', 6000, 'quantity', 1)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(jsonb_build_object('method', 'other', 'amount', 6000)),
    NULL, 'CLP'
  );
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario H: status debería ser pagada, fue ' || v_invoice.status;
  RAISE NOTICE 'OK: escenario H -- other aceptado, venta 100%% pagada';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO I: un método inventado ('bitcoin') sigue rechazado con
-- INVALID_PAYMENT / SQLSTATE 23514 (#9).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_biz      UUID := current_setting('test.biz_id')::uuid;
  v_caught   BOOLEAN := false;
  v_msg      TEXT;
  v_sqlstate TEXT;
BEGIN
  BEGIN
    PERFORM public.crm_create_pos_sale(
      v_biz, 'test-key-I-bitcoin',
      jsonb_build_array(jsonb_build_object('name', 'Item I', 'unit_price', 6000, 'quantity', 1)),
      CURRENT_DATE, NULL, 0,
      jsonb_build_array(jsonb_build_object('method', 'bitcoin', 'amount', 6000)),
      NULL, 'CLP'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_caught, 'FAIL escenario I: un método inventado debería lanzar una excepción';
  ASSERT v_msg = 'INVALID_PAYMENT', 'FAIL escenario I: el mensaje debería ser exactamente INVALID_PAYMENT, fue ' || v_msg;
  ASSERT v_sqlstate = '23514', 'FAIL escenario I: SQLSTATE debería ser 23514, fue ' || v_sqlstate;
  RAISE NOTICE 'OK: escenario I -- un medio inventado (''bitcoin'') sigue rechazado con INVALID_PAYMENT / SQLSTATE 23514';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO J: 'credit' (cuenta corriente) SIGUE rechazado como medio de
-- pago de esta RPC -- no se confunde con credit_card (#10). Este es
-- comportamiento PRE-EXISTENTE que este hotfix preserva, no una regla nueva.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_biz      UUID := current_setting('test.biz_id')::uuid;
  v_caught   BOOLEAN := false;
  v_msg      TEXT;
  v_sqlstate TEXT;
BEGIN
  BEGIN
    PERFORM public.crm_create_pos_sale(
      v_biz, 'test-key-J-credit',
      jsonb_build_array(jsonb_build_object('name', 'Item J', 'unit_price', 6000, 'quantity', 1)),
      CURRENT_DATE, NULL, 0,
      jsonb_build_array(jsonb_build_object('method', 'credit', 'amount', 6000)),
      NULL, 'CLP'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_caught, 'FAIL escenario J: ''credit'' debería seguir siendo rechazado como medio de pago de esta RPC';
  ASSERT v_msg = 'INVALID_PAYMENT', 'FAIL escenario J: el mensaje debería ser exactamente INVALID_PAYMENT, fue ' || v_msg;
  ASSERT v_sqlstate = '23514', 'FAIL escenario J: SQLSTATE debería ser 23514, fue ' || v_sqlstate;
  RAISE NOTICE 'OK: escenario J -- ''credit'' (cuenta corriente) SIGUE rechazado por crm_create_pos_sale -- no se convirtió accidentalmente en tarjeta de crédito';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO K: un pago no-efectivo que supera el total sigue rechazado --
-- solo cash puede generar vuelto (#11).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_biz      UUID := current_setting('test.biz_id')::uuid;
  v_caught   BOOLEAN := false;
  v_msg      TEXT;
  v_sqlstate TEXT;
BEGIN
  BEGIN
    -- Total = 6000, se manda debit_card por 7000 (supera el total).
    PERFORM public.crm_create_pos_sale(
      v_biz, 'test-key-K-overpay',
      jsonb_build_array(jsonb_build_object('name', 'Item K', 'unit_price', 6000, 'quantity', 1)),
      CURRENT_DATE, NULL, 0,
      jsonb_build_array(jsonb_build_object('method', 'debit_card', 'amount', 7000)),
      NULL, 'CLP'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_caught, 'FAIL escenario K: un pago no-efectivo por encima del total debería ser rechazado';
  ASSERT v_msg = 'INVALID_PAYMENT', 'FAIL escenario K: el mensaje debería ser exactamente INVALID_PAYMENT, fue ' || v_msg;
  ASSERT v_sqlstate = '23514', 'FAIL escenario K: SQLSTATE debería ser 23514, fue ' || v_sqlstate;
  RAISE NOTICE 'OK: escenario K -- debit_card por $7.000 sobre un total de $6.000 sigue rechazado (solo cash puede generar vuelto)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO L: venta mixta cash + debit_card conserva el cálculo correcto
-- de total/vuelto (#15). Total=12000: debit_card $6.000 + cash tendered
-- $8.000 (sobra respecto de lo que falta cubrir). El cash aplicado debe
-- quedar CAPADO en $6.000 (12000 - 6000), nunca en los $8.000 tendidos --
-- los $2.000 restantes son vuelto físico, nunca se guardan como pago.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_biz       UUID := current_setting('test.biz_id')::uuid;
  v_invoice   public.crm_invoices;
  v_cash_pay  public.crm_payments;
  v_debit_pay public.crm_payments;
  v_pay_count INT;
BEGIN
  SELECT * INTO v_invoice FROM public.crm_create_pos_sale(
    v_biz, 'test-key-L-mixed',
    jsonb_build_array(jsonb_build_object('name', 'Item L', 'unit_price', 6000, 'quantity', 2)),
    CURRENT_DATE, NULL, 0,
    jsonb_build_array(
      jsonb_build_object('method', 'debit_card', 'amount', 6000),
      jsonb_build_object('method', 'cash', 'amount', 8000)
    ),
    NULL, 'CLP'
  );
  ASSERT v_invoice.total = 12000, 'FAIL escenario L: total debería ser 12000, fue ' || v_invoice.total;
  ASSERT v_invoice.status = 'pagada', 'FAIL escenario L: status debería ser pagada, fue ' || v_invoice.status;

  SELECT count(*) INTO v_pay_count FROM public.crm_payments WHERE invoice_id = v_invoice.id;
  ASSERT v_pay_count = 2, 'FAIL escenario L: deberían existir exactamente 2 filas de pago (debit_card + cash), hay ' || v_pay_count;

  SELECT * INTO v_debit_pay FROM public.crm_payments WHERE invoice_id = v_invoice.id AND payment_method = 'debit_card';
  ASSERT v_debit_pay.amount = 6000, 'FAIL escenario L: el pago debit_card debería guardarse por su monto exacto (6000), fue ' || v_debit_pay.amount;

  SELECT * INTO v_cash_pay FROM public.crm_payments WHERE invoice_id = v_invoice.id AND payment_method = 'cash';
  ASSERT v_cash_pay.amount = 6000,
    'FAIL escenario L: el cash aplicado debería quedar capado en lo que faltaba cubrir (6000), no en los 8000 tendidos -- fue ' || v_cash_pay.amount;

  RAISE NOTICE 'OK: escenario L -- venta mixta cash+debit_card ($12.000 total): debit_card guarda 6000 exacto, cash tendido en 8000 queda capado en 6000 (2000 de vuelto nunca se persisten)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- ESCENARIO M: STOCK_INSUFFICIENT:<product_id>:<requested>:<available>
-- (TPV-STOCK-UX-1) sigue funcionando con un intento de pago en un medio
-- nuevo (debit_card) -- la validación de stock sigue ocurriendo ANTES que
-- la de pagos, sin verse afectada por este hotfix (#18).
-- ══════════════════════════════════════════════════════════════════════════
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
    -- Stock disponible = 1, se piden 2 unidades, pagadas con debit_card.
    PERFORM public.crm_create_pos_sale(
      v_biz, 'test-key-M-stock',
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
  ASSERT v_caught, 'FAIL escenario M: pedir más stock del disponible debería lanzar una excepción';
  ASSERT v_msg = v_expected_prefix,
    'FAIL escenario M: el mensaje debería ser exactamente ' || v_expected_prefix || ', fue ' || v_msg;
  ASSERT v_sqlstate = 'P0001', 'FAIL escenario M: SQLSTATE debería ser P0001, fue ' || v_sqlstate;
  RAISE NOTICE 'OK: escenario M -- STOCK_INSUFFICIENT detallado (%) sigue funcionando con un pago debit_card -- la validación de stock sigue ocurriendo antes que la de pagos', v_msg;
END $$;

RESET ROLE;

DO $$
BEGIN
  RAISE NOTICE 'OK: TODOS los escenarios de TPV-PAYMENT-METHODS-1 pasaron';
END $$;

-- Revertir todo — este script nunca deja datos de prueba en la base.
ROLLBACK;
