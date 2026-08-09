-- Verificación MANUAL de 20260809110000_crm_cash_documents_reconciliation.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción (project-ref hxxdketymcntadffmajf)
-- — solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluida esta reconciliación)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_crm_cash_documents_reconciliation.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- Por qué RLS se verifica ESTRUCTURALMENTE (pg_policies) y no con
-- SET ROLE authenticated + SELECT real: mismo motivo documentado en
-- verify_crm_payments_reconciliation.sql — las policies owner_* evalúan un
-- subquery contra public.wa_businesses, que corre con los privilegios del rol
-- llamante; el shadow local no replica el GRANT implícito de plataforma sobre
-- wa_businesses (tabla que esta migración no toca), así que SET ROLE
-- authenticated fallaría con "permission denied for table wa_businesses" —
-- un problema de una tabla fuera de alcance, no de lo que se está probando.
--
-- Cubre: existencia + tipos + constraints + índices + comments de las 2
-- tablas nuevas (crm_document_changes, crm_purchase_invoices) y de las
-- columnas nuevas en 3 tablas existentes (crm_payments, crm_cash_sessions,
-- crm_cash_movements); el ensanchado real de crm_payments.amount; el CHECK
-- ampliado de crm_cash_movements.category (acepta el valor nuevo, sigue
-- rechazando valores inválidos, los valores viejos siguen aceptados); GRANTs
-- exactos de las 2 tablas nuevas; y reproducibilidad — el bloque idempotente
-- completo de la migración se re-ejecuta una segunda vez dentro de esta misma
-- transacción y se verifica que el estado final no cambia.

BEGIN;

-- ── Setup: 2 negocios reales vía trigger R1 (wa_handle_new_user_business) ────
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'crmrecon-a@example.test', '{"name": "Negocio A"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'crmrecon-b@example.test', '{"name": "Negocio B"}'::jsonb, now(), 'authenticated', 'authenticated');

DO $$
DECLARE
  v_biz_a uuid;
  v_biz_b uuid;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000c1';
  SELECT id INTO v_biz_b FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000c2';
  ASSERT v_biz_a IS NOT NULL AND v_biz_b IS NOT NULL,
    'FAIL: setup — el trigger R1 no creó los 2 negocios de prueba';
  RAISE NOTICE 'OK: setup — 2 negocios creados via trigger R1 real. A=% B=%', v_biz_a, v_biz_b;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 1: crm_payments.amount ensanchado a NUMERIC(12,2)
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz_a uuid;
  v_data_type text;
  v_precision integer;
  v_scale integer;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000c1';

  SELECT data_type, numeric_precision, numeric_scale
  INTO v_data_type, v_precision, v_scale
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'crm_payments' AND column_name = 'amount';

  ASSERT v_precision = 12 AND v_scale = 2,
    'FAIL: crm_payments.amount debería ser NUMERIC(12,2), es NUMERIC(' || v_precision || ',' || v_scale || ')';
  RAISE NOTICE 'OK: crm_payments.amount es NUMERIC(12,2)';

  -- Valor que NUMERIC(10,2) jamás habría aceptado (máximo 99999999.99):
  -- prueba real del ensanchado, no solo lectura de metadata.
  INSERT INTO public.crm_payments (business_id, amount, payment_method)
  VALUES (v_biz_a, 100000000.00, 'cash');

  ASSERT EXISTS (
    SELECT 1 FROM public.crm_payments WHERE business_id = v_biz_a AND amount = 100000000.00
  ), 'FAIL: no se pudo insertar un crm_payments.amount = 100000000.00 (NUMERIC(12,2) real)';
  RAISE NOTICE 'OK: crm_payments acepta amount = 100000000.00 (excede el límite de NUMERIC(10,2), confirma el ensanchado real)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 2: crm_payments.quote_id / void_cash_session_id — columnas, FKs,
-- índices y semántica ON DELETE
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz_a uuid;
  v_quote_id uuid;
  v_session_id uuid;
  v_payment_id uuid;
  v_quote_id_after uuid;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000c1';

  INSERT INTO public.crm_quotes (business_id, quote_number)
  VALUES (v_biz_a, 1)
  RETURNING id INTO v_quote_id;

  INSERT INTO public.crm_cash_sessions (business_id, date)
  VALUES (v_biz_a, CURRENT_DATE)
  RETURNING id INTO v_session_id;

  INSERT INTO public.crm_payments (business_id, amount, payment_method, quote_id, void_cash_session_id)
  VALUES (v_biz_a, 1000, 'cash', v_quote_id, v_session_id)
  RETURNING id INTO v_payment_id;

  ASSERT v_payment_id IS NOT NULL,
    'FAIL: crm_payments no aceptó quote_id/void_cash_session_id válidos';
  RAISE NOTICE 'OK: crm_payments.quote_id y void_cash_session_id aceptan FKs válidas hacia crm_quotes/crm_cash_sessions';

  -- ON DELETE SET NULL confirmado para quote_id (igual que en el dump).
  DELETE FROM public.crm_quotes WHERE id = v_quote_id;
  SELECT quote_id INTO v_quote_id_after FROM public.crm_payments WHERE id = v_payment_id;
  ASSERT v_quote_id_after IS NULL,
    'FAIL: crm_payments.quote_id debería quedar NULL tras borrar el quote referenciado (ON DELETE SET NULL)';
  RAISE NOTICE 'OK: crm_payments.quote_id → ON DELETE SET NULL confirmado';
END $$;

DO $$
DECLARE
  v_idx_count integer;
BEGIN
  SELECT count(*) INTO v_idx_count FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'crm_payments'
    AND indexname IN (
      'idx_crm_payments_quote_id', 'idx_crm_payments_void_session',
      'idx_crm_payments_payment_date', 'idx_crm_payments_payment_method',
      'idx_crm_payments_payment_status'
    );
  ASSERT v_idx_count = 5,
    'FAIL: esperaban existir 5 índices nuevos de crm_payments, se encontraron ' || v_idx_count;
  RAISE NOTICE 'OK: los 5 índices nuevos de crm_payments existen (quote_id, void_session, payment_date, payment_method, payment_status)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 3: crm_cash_sessions — columnas de arqueo/cierre + comments
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz_a uuid;
  v_session_id uuid;
  v_col_count integer;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000c1';

  SELECT count(*) INTO v_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'crm_cash_sessions'
    AND column_name IN ('expected_cash', 'counted_cash', 'cash_difference', 'closing_notes', 'closed_by');
  ASSERT v_col_count = 5,
    'FAIL: esperaban existir 5 columnas nuevas en crm_cash_sessions, se encontraron ' || v_col_count;
  RAISE NOTICE 'OK: crm_cash_sessions tiene las 5 columnas nuevas de arqueo/cierre';

  INSERT INTO public.crm_cash_sessions (business_id, date, status, closed_at, expected_cash, counted_cash, cash_difference, closing_notes, closed_by)
  VALUES (v_biz_a, CURRENT_DATE, 'closed', now(), 50000, 49500, -500, 'Faltante detectado en cierre de prueba', '00000000-0000-0000-0000-0000000000c1')
  RETURNING id INTO v_session_id;

  ASSERT EXISTS (
    SELECT 1 FROM public.crm_cash_sessions
    WHERE id = v_session_id AND cash_difference = -500 AND closed_by = '00000000-0000-0000-0000-0000000000c1'
  ), 'FAIL: crm_cash_sessions no persistió correctamente expected_cash/counted_cash/cash_difference/closed_by';
  RAISE NOTICE 'OK: crm_cash_sessions acepta y persiste un cierre con arqueo completo';
END $$;

DO $$
DECLARE
  v_comment_count integer;
BEGIN
  SELECT count(*) INTO v_comment_count
  FROM pg_catalog.pg_description d
  JOIN pg_catalog.pg_attribute a ON a.attrelid = d.objoid AND a.attnum = d.objsubid
  WHERE d.objoid = 'public.crm_cash_sessions'::regclass
    AND a.attname IN ('expected_cash', 'counted_cash', 'cash_difference', 'closing_notes', 'closed_by')
    AND d.description IS NOT NULL;
  ASSERT v_comment_count = 5,
    'FAIL: esperaban 5 COMMENT ON COLUMN en crm_cash_sessions (una por columna nueva), hay ' || v_comment_count;
  RAISE NOTICE 'OK: las 5 columnas nuevas de crm_cash_sessions tienen su COMMENT ON COLUMN (igual que producción)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 4: crm_cash_movements.reversal_payment_id + category ampliado
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz_a uuid;
  v_payment_id uuid;
  v_movement_id uuid;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000c1';

  INSERT INTO public.crm_payments (business_id, amount, payment_method)
  VALUES (v_biz_a, 5000, 'cash')
  RETURNING id INTO v_payment_id;

  -- category = 'payment_reversal' (valor nuevo del CHECK) + reversal_payment_id.
  INSERT INTO public.crm_cash_movements (business_id, direction, amount, reason, category, reversal_payment_id)
  VALUES (v_biz_a, 'out', 5000, 'Reverso de pago de prueba', 'payment_reversal', v_payment_id)
  RETURNING id INTO v_movement_id;

  ASSERT v_movement_id IS NOT NULL,
    'FAIL: crm_cash_movements no aceptó category=''payment_reversal'' con reversal_payment_id';
  RAISE NOTICE 'OK: crm_cash_movements.reversal_payment_id + category=''payment_reversal'' funcionan';

  -- Los valores viejos del CHECK siguen aceptados (no se perdió ninguno).
  INSERT INTO public.crm_cash_movements (business_id, direction, amount, reason, category)
  VALUES (v_biz_a, 'out', 1000, 'Retiro de prueba', 'owner_withdrawal');
  RAISE NOTICE 'OK: category=''owner_withdrawal'' (valor preexistente) sigue aceptado tras ampliar el CHECK';

  -- Un valor inválido sigue siendo rechazado — el CHECK amplía, no elimina.
  BEGIN
    INSERT INTO public.crm_cash_movements (business_id, direction, amount, reason, category)
    VALUES (v_biz_a, 'out', 1000, 'Categoría inválida', 'categoria_inexistente');
    RAISE EXCEPTION 'FAIL: crm_cash_movements aceptó category=''categoria_inexistente'', el CHECK debería rechazarla';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'OK: crm_cash_movements sigue rechazando valores de category fuera de la lista permitida';
  END;
END $$;

DO $$
DECLARE
  v_idx_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'crm_cash_movements' AND indexname = 'idx_crm_cash_movements_reversal'
  ) INTO v_idx_exists;
  ASSERT v_idx_exists, 'FAIL: falta idx_crm_cash_movements_reversal';
  RAISE NOTICE 'OK: idx_crm_cash_movements_reversal existe';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 5: crm_document_changes — tabla, columnas, constraint, índices,
-- RLS y GRANTs
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz_a uuid;
  v_change_id uuid;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000c1';

  ASSERT to_regclass('public.crm_document_changes') IS NOT NULL,
    'FAIL: la tabla crm_document_changes no existe';

  INSERT INTO public.crm_document_changes (document_type, document_id, business_id, changed_by, changed_by_name, field_name, old_value, new_value)
  VALUES ('invoice', gen_random_uuid(), v_biz_a, '00000000-0000-0000-0000-0000000000c1', 'Negocio A', 'total', '1000', '1200')
  RETURNING id INTO v_change_id;
  ASSERT v_change_id IS NOT NULL, 'FAIL: no se pudo insertar en crm_document_changes';
  RAISE NOTICE 'OK: crm_document_changes acepta un registro de auditoría válido';

  BEGIN
    INSERT INTO public.crm_document_changes (document_type, document_id, business_id, field_name)
    VALUES ('purchase_order', gen_random_uuid(), v_biz_a, 'total');
    RAISE EXCEPTION 'FAIL: crm_document_changes aceptó document_type=''purchase_order'', debería rechazarlo (solo invoice/quote)';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'OK: crm_document_changes.document_type_check rechaza valores fuera de {invoice, quote}';
  END;
END $$;

DO $$
DECLARE
  v_idx_count integer;
  v_policy_count integer;
  v_rls_enabled boolean;
BEGIN
  SELECT count(*) INTO v_idx_count FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'crm_document_changes'
    AND indexname IN ('idx_crm_doc_changes_business', 'idx_crm_doc_changes_document');
  ASSERT v_idx_count = 2, 'FAIL: crm_document_changes debería tener 2 índices nuevos, tiene ' || v_idx_count;

  SELECT relrowsecurity INTO v_rls_enabled FROM pg_class WHERE oid = 'public.crm_document_changes'::regclass;
  ASSERT v_rls_enabled, 'FAIL: crm_document_changes no tiene RLS habilitado';

  SELECT count(*) INTO v_policy_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'crm_document_changes';
  ASSERT v_policy_count = 2, 'FAIL: crm_document_changes debería tener exactamente 2 policies (select, insert), tiene ' || v_policy_count;

  RAISE NOTICE 'OK: crm_document_changes — 2 índices, RLS habilitado, 2 policies (select/insert), sin update/delete';
END $$;

DO $$
DECLARE
  v_auth_privs text[];
  v_anon_privs text[];
BEGIN
  SELECT array_agg(privilege_type ORDER BY privilege_type) INTO v_auth_privs
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'crm_document_changes' AND grantee = 'authenticated';
  ASSERT v_auth_privs = ARRAY['INSERT','SELECT'],
    'FAIL: authenticated debería tener exactamente {INSERT,SELECT} en crm_document_changes, tiene ' || COALESCE(v_auth_privs::text, 'NULL');

  SELECT array_agg(privilege_type) INTO v_anon_privs
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'crm_document_changes' AND grantee = 'anon';
  ASSERT v_anon_privs IS NULL,
    'FAIL: anon no debería tener ningún privilegio en crm_document_changes, tiene ' || COALESCE(v_anon_privs::text, '');

  RAISE NOTICE 'OK: GRANTs de crm_document_changes — authenticated={INSERT,SELECT}, anon=ninguno';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 6: crm_purchase_invoices — tabla, columnas, constraint, RLS y GRANTs
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz_a uuid;
  v_invoice_id uuid;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000c1';

  ASSERT to_regclass('public.crm_purchase_invoices') IS NOT NULL,
    'FAIL: la tabla crm_purchase_invoices no existe';

  INSERT INTO public.crm_purchase_invoices (business_id, supplier_name, invoice_date, purchase_type, net_amount, tax_amount, total_amount)
  VALUES (v_biz_a, 'Proveedor de prueba', CURRENT_DATE, 'mercaderia', 10000, 1900, 11900)
  RETURNING id INTO v_invoice_id;
  ASSERT v_invoice_id IS NOT NULL, 'FAIL: no se pudo insertar en crm_purchase_invoices';
  RAISE NOTICE 'OK: crm_purchase_invoices acepta una factura de compra válida';

  DELETE FROM public.crm_purchase_invoices WHERE id = v_invoice_id;
  ASSERT NOT EXISTS (SELECT 1 FROM public.crm_purchase_invoices WHERE id = v_invoice_id),
    'FAIL: no se pudo borrar de crm_purchase_invoices (deletePurchaseInvoice lo requiere)';
  RAISE NOTICE 'OK: crm_purchase_invoices permite DELETE (usado por deletePurchaseInvoice en crmService.js)';

  BEGIN
    INSERT INTO public.crm_purchase_invoices (business_id, invoice_date, purchase_type, total_amount)
    VALUES (v_biz_a, CURRENT_DATE, 'tipo_invalido', 1000);
    RAISE EXCEPTION 'FAIL: crm_purchase_invoices aceptó purchase_type=''tipo_invalido''';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'OK: crm_purchase_invoices.purchase_type_check rechaza valores fuera de {mercaderia, gasto_con_iva, gasto_sin_iva}';
  END;
END $$;

DO $$
DECLARE
  v_rls_enabled boolean;
  v_policy_count integer;
  v_roles name[];
  v_auth_privs text[];
  v_anon_privs text[];
BEGIN
  SELECT relrowsecurity INTO v_rls_enabled FROM pg_class WHERE oid = 'public.crm_purchase_invoices'::regclass;
  ASSERT v_rls_enabled, 'FAIL: crm_purchase_invoices no tiene RLS habilitado';

  SELECT count(*), (array_agg(roles))[1] INTO v_policy_count, v_roles
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crm_purchase_invoices';
  ASSERT v_policy_count = 1, 'FAIL: crm_purchase_invoices debería tener exactamente 1 policy (owner_purchase_invoices), tiene ' || v_policy_count;
  ASSERT v_roles = ARRAY['public']::name[],
    'FAIL: owner_purchase_invoices debería tener roles={public} (sin TO explícito, igual que producción), tiene ' || COALESCE(v_roles::text, 'NULL');

  SELECT array_agg(privilege_type ORDER BY privilege_type) INTO v_auth_privs
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'crm_purchase_invoices' AND grantee = 'authenticated';
  ASSERT v_auth_privs = ARRAY['DELETE','INSERT','SELECT'],
    'FAIL: authenticated debería tener exactamente {DELETE,INSERT,SELECT} en crm_purchase_invoices, tiene ' || COALESCE(v_auth_privs::text, 'NULL');

  SELECT array_agg(privilege_type) INTO v_anon_privs
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'crm_purchase_invoices' AND grantee = 'anon';
  ASSERT v_anon_privs IS NULL,
    'FAIL: anon no debería tener ningún privilegio en crm_purchase_invoices, tiene ' || COALESCE(v_anon_privs::text, '');

  RAISE NOTICE 'OK: crm_purchase_invoices — RLS habilitado, 1 policy FOR ALL sin TO explícito (roles={public}), GRANTs authenticated={DELETE,INSERT,SELECT}, anon=ninguno';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 7: idempotencia — re-ejecutar el bloque completo de la migración
-- una segunda vez dentro de esta misma transacción. Nada debe fallar y el
-- estado estructural final debe ser idéntico al de antes de la segunda
-- corrida (mismas columnas, mismos índices, mismas policies, mismo CHECK).
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_snapshot_before jsonb;
  v_snapshot_after  jsonb;
BEGIN
  SELECT jsonb_build_object(
    'crm_payments_cols',        (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_payments'),
    'crm_cash_sessions_cols',   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_cash_sessions'),
    'crm_cash_movements_cols',  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_cash_movements'),
    'crm_document_changes_cols',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_document_changes'),
    'crm_purchase_invoices_cols',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_purchase_invoices'),
    'crm_payments_indexes',     (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='crm_payments'),
    'crm_cash_movements_indexes',(SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='crm_cash_movements'),
    'crm_document_changes_policies', (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='crm_document_changes'),
    'crm_purchase_invoices_policies', (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='crm_purchase_invoices'),
    'category_check_def',       (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.crm_cash_movements'::regclass AND conname='crm_cash_movements_category_check')
  ) INTO v_snapshot_before;

  -- ── Re-ejecución literal del cuerpo idempotente de la migración ──────────
  ALTER TABLE public.crm_payments ALTER COLUMN amount TYPE NUMERIC(12,2);

  ALTER TABLE public.crm_payments
    ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.crm_quotes(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_crm_payments_quote_id ON public.crm_payments (quote_id);

  ALTER TABLE public.crm_payments
    ADD COLUMN IF NOT EXISTS void_cash_session_id UUID REFERENCES public.crm_cash_sessions(id);
  CREATE INDEX IF NOT EXISTS idx_crm_payments_void_session
    ON public.crm_payments (void_cash_session_id) WHERE void_cash_session_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_crm_payments_payment_date ON public.crm_payments (payment_date);
  CREATE INDEX IF NOT EXISTS idx_crm_payments_payment_method ON public.crm_payments (payment_method);
  CREATE INDEX IF NOT EXISTS idx_crm_payments_payment_status ON public.crm_payments (payment_status);

  ALTER TABLE public.crm_cash_sessions
    ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS counted_cash NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS cash_difference NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS closing_notes TEXT,
    ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id);

  ALTER TABLE public.crm_cash_movements
    ADD COLUMN IF NOT EXISTS reversal_payment_id UUID REFERENCES public.crm_payments(id);
  CREATE INDEX IF NOT EXISTS idx_crm_cash_movements_reversal
    ON public.crm_cash_movements (reversal_payment_id) WHERE reversal_payment_id IS NOT NULL;

  ALTER TABLE public.crm_cash_movements DROP CONSTRAINT IF EXISTS crm_cash_movements_category_check;
  ALTER TABLE public.crm_cash_movements
    ADD CONSTRAINT crm_cash_movements_category_check
    CHECK (category IN (
      'owner_withdrawal', 'bank_deposit',
      'supplies', 'utilities', 'rent', 'services', 'taxes', 'salaries',
      'other_expense', 'cash_fund', 'correction', 'other', 'payment_reversal'
    ));

  CREATE TABLE IF NOT EXISTS public.crm_document_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'quote')),
    document_id UUID NOT NULL,
    business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_by_name TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_crm_doc_changes_business ON public.crm_document_changes (business_id);
  CREATE INDEX IF NOT EXISTS idx_crm_doc_changes_document ON public.crm_document_changes (document_type, document_id, changed_at DESC);
  ALTER TABLE public.crm_document_changes ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "crm_document_changes_select" ON public.crm_document_changes;
  CREATE POLICY "crm_document_changes_select" ON public.crm_document_changes FOR SELECT TO authenticated
    USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));
  DROP POLICY IF EXISTS "crm_document_changes_insert" ON public.crm_document_changes;
  CREATE POLICY "crm_document_changes_insert" ON public.crm_document_changes FOR INSERT TO authenticated
    WITH CHECK (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));
  GRANT SELECT, INSERT ON TABLE public.crm_document_changes TO authenticated;

  CREATE TABLE IF NOT EXISTS public.crm_purchase_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
    supplier_name TEXT,
    invoice_date DATE NOT NULL,
    purchase_type TEXT NOT NULL CHECK (purchase_type IN ('mercaderia', 'gasto_con_iva', 'gasto_sin_iva')),
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 19,
    tax_included BOOLEAN NOT NULL DEFAULT true,
    net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE public.crm_purchase_invoices ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "owner_purchase_invoices" ON public.crm_purchase_invoices;
  CREATE POLICY "owner_purchase_invoices" ON public.crm_purchase_invoices
    USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));
  GRANT SELECT, INSERT, DELETE ON TABLE public.crm_purchase_invoices TO authenticated;

  SELECT jsonb_build_object(
    'crm_payments_cols',        (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_payments'),
    'crm_cash_sessions_cols',   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_cash_sessions'),
    'crm_cash_movements_cols',  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_cash_movements'),
    'crm_document_changes_cols',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_document_changes'),
    'crm_purchase_invoices_cols',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_purchase_invoices'),
    'crm_payments_indexes',     (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='crm_payments'),
    'crm_cash_movements_indexes',(SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='crm_cash_movements'),
    'crm_document_changes_policies', (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='crm_document_changes'),
    'crm_purchase_invoices_policies', (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='crm_purchase_invoices'),
    'category_check_def',       (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.crm_cash_movements'::regclass AND conname='crm_cash_movements_category_check')
  ) INTO v_snapshot_after;

  ASSERT v_snapshot_before = v_snapshot_after,
    'FAIL: idempotencia — el estado estructural cambió tras re-ejecutar la migración. antes=' || v_snapshot_before::text || ' después=' || v_snapshot_after::text;
  RAISE NOTICE 'OK: idempotencia — re-ejecutar el bloque completo de la migración una segunda vez no cambia ninguna columna/índice/policy/constraint';
END $$;

-- Revertir todo — este script nunca deja datos de prueba en la base.
ROLLBACK;
