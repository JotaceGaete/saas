-- Verificación MANUAL de 20260809120000_restore_crm_payments_order_id.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción (project-ref hxxdketymcntadffmajf)
-- — solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluida esta)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_restore_crm_payments_order_id.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- Cubre exactamente lo pedido: columna existe, tipo UUID, FK correcta a
-- wa_orders(id), ON DELETE SET NULL, insertar pago con order_id, borrar el
-- pedido deja order_id = NULL, y que ese flujo no afecta quote_id ni
-- void_cash_session_id (columnas restauradas por separado en
-- 20260809110000_crm_cash_documents_reconciliation.sql).

BEGIN;

-- ── Setup: 1 negocio real vía trigger R1 (wa_handle_new_user_business) ──────
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'crmorderid-a@example.test', '{"name": "Negocio A"}'::jsonb, now(), 'authenticated', 'authenticated');

DO $$
DECLARE
  v_biz_a uuid;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000d1';
  ASSERT v_biz_a IS NOT NULL, 'FAIL: setup — el trigger R1 no creó el negocio de prueba';
  RAISE NOTICE 'OK: setup — negocio creado via trigger R1 real. A=%', v_biz_a;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 1: columna existe, tipo UUID
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_data_type text;
  v_udt_name  text;
BEGIN
  SELECT data_type, udt_name INTO v_data_type, v_udt_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'crm_payments' AND column_name = 'order_id';

  ASSERT v_data_type IS NOT NULL, 'FAIL: crm_payments.order_id no existe';
  ASSERT v_udt_name = 'uuid', 'FAIL: crm_payments.order_id debería ser UUID, es ' || COALESCE(v_udt_name, 'NULL');
  RAISE NOTICE 'OK: crm_payments.order_id existe y es de tipo UUID';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 2: FK correcta a wa_orders(id), ON DELETE SET NULL
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_confdeltype "char";
  v_ref_table text;
  v_ref_column text;
BEGIN
  SELECT
    c.confdeltype,
    ref.relname,
    a.attname
  INTO v_confdeltype, v_ref_table, v_ref_column
  FROM pg_constraint c
  JOIN pg_class ref ON ref.oid = c.confrelid
  JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = ANY(c.confkey)
  WHERE c.conrelid = 'public.crm_payments'::regclass
    AND c.contype = 'f'
    AND c.conkey = (
      SELECT ARRAY[attnum] FROM pg_attribute
      WHERE attrelid = 'public.crm_payments'::regclass AND attname = 'order_id'
    );

  ASSERT v_ref_table = 'wa_orders', 'FAIL: crm_payments.order_id debería referenciar wa_orders, referencia ' || COALESCE(v_ref_table, 'NULL');
  ASSERT v_ref_column = 'id', 'FAIL: crm_payments.order_id debería referenciar wa_orders(id), referencia wa_orders(' || COALESCE(v_ref_column, 'NULL') || ')';
  ASSERT v_confdeltype = 'n', 'FAIL: crm_payments.order_id debería ser ON DELETE SET NULL (n), es ''' || COALESCE(v_confdeltype::text, 'NULL') || '''';
  RAISE NOTICE 'OK: crm_payments.order_id tiene FK -> wa_orders(id) ON DELETE SET NULL';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 3: insertar pago con order_id; borrar el pedido deja order_id = NULL;
-- el flujo no afecta quote_id ni void_cash_session_id
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz_a uuid;
  v_order_id uuid;
  v_quote_id uuid;
  v_session_id uuid;
  v_payment_id uuid;
  v_order_id_after uuid;
  v_quote_id_after uuid;
  v_void_session_after uuid;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000d1';

  INSERT INTO public.wa_orders (business_id, customer_name, total_amount)
  VALUES (v_biz_a, 'Cliente de prueba', 5000)
  RETURNING id INTO v_order_id;

  -- Fixtures de quote_id y void_cash_session_id (restauradas por separado en
  -- 20260809110000) para probar que este flujo no las toca.
  INSERT INTO public.crm_quotes (business_id, quote_number)
  VALUES (v_biz_a, 1)
  RETURNING id INTO v_quote_id;

  INSERT INTO public.crm_cash_sessions (business_id, date)
  VALUES (v_biz_a, CURRENT_DATE)
  RETURNING id INTO v_session_id;

  INSERT INTO public.crm_payments (business_id, amount, payment_method, order_id, quote_id, void_cash_session_id)
  VALUES (v_biz_a, 5000, 'cash', v_order_id, v_quote_id, v_session_id)
  RETURNING id INTO v_payment_id;

  ASSERT v_payment_id IS NOT NULL, 'FAIL: no se pudo insertar un crm_payments con order_id';
  RAISE NOTICE 'OK: crm_payments acepta un INSERT con order_id (simula registerOrderPayment())';

  -- Borrar el pedido: order_id debe quedar NULL, quote_id y
  -- void_cash_session_id NO deben verse afectados (son columnas
  -- independientes, sin relación con wa_orders).
  DELETE FROM public.wa_orders WHERE id = v_order_id;

  SELECT order_id, quote_id, void_cash_session_id
  INTO v_order_id_after, v_quote_id_after, v_void_session_after
  FROM public.crm_payments WHERE id = v_payment_id;

  ASSERT v_order_id_after IS NULL,
    'FAIL: crm_payments.order_id debería quedar NULL tras borrar el pedido referenciado (ON DELETE SET NULL)';
  RAISE NOTICE 'OK: crm_payments.order_id → ON DELETE SET NULL confirmado (borrar wa_orders deja order_id = NULL)';

  ASSERT v_quote_id_after = v_quote_id,
    'FAIL: borrar el pedido afectó quote_id (era ' || v_quote_id || ', quedó ' || COALESCE(v_quote_id_after::text, 'NULL') || ') — no debería tener ninguna relación con wa_orders';
  ASSERT v_void_session_after = v_session_id,
    'FAIL: borrar el pedido afectó void_cash_session_id (era ' || v_session_id || ', quedó ' || COALESCE(v_void_session_after::text, 'NULL') || ') — no debería tener ninguna relación con wa_orders';
  RAISE NOTICE 'OK: quote_id y void_cash_session_id no se ven afectados al borrar el pedido — sin relación cruzada con order_id';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 4: ningún índice nuevo sobre order_id (decisión documentada en la
-- migración: nunca existió históricamente y ningún flujo actual lo necesita)
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_idx_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'crm_payments' AND indexdef ILIKE '%(order_id)%'
  ) INTO v_idx_exists;
  ASSERT NOT v_idx_exists,
    'FAIL: se esperaba que NO existiera ningún índice sobre crm_payments.order_id (decisión documentada en la migración), pero existe uno';
  RAISE NOTICE 'OK: no se creó ningún índice sobre order_id, consistente con la decisión documentada (nunca existió históricamente, sin uso de lectura actual)';
END $$;

-- Revertir todo — este script nunca deja datos de prueba en la base.
ROLLBACK;
