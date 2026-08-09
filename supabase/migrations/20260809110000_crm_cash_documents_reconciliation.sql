-- ============================================================
-- Reconciliación de drift remoto confirmado (CRM caja / documentos),
-- capturado por introspección de solo lectura del esquema real de
-- producción (dump `public` vía `supabase db dump --linked --schema
-- public`, tomado ANTES de cualquier `migration repair`), comparado
-- contra el historial local conocido hasta
-- 20260620220000_crm_payments_phase1_stabilization.sql +
-- 20260717120000_crm_invoice_atomic_documents.sql (recuperado
-- verbatim desde git, commit cdbf992866990deb524befeea29cd3b9ac705668).
--
-- Las 7 versiones huérfanas 20260621000001..20260621000007 NO se
-- reconstruyen ni se les asigna este archivo -- su SQL original no
-- existe en ningún punto del historial git (búsqueda exhaustiva:
-- refs alcanzables, grafo completo de objetos, commits dangling).
-- Este archivo NO reclama ser el contenido original de ninguna de
-- esas versiones: reproduce únicamente el efecto neto de esquema
-- que hoy existe en producción y que ningún archivo local reproduce,
-- confirmado objeto por objeto contra el dump.
--
-- NO duplica 20260808110000_crm_payments_reconciliation.sql: ese
-- archivo ya cubre payment_number, updated_at, sus función/trigger,
-- policies owner_*/admin_all y el hardening de GRANT/REVOKE de
-- crm_payments. Nada de eso se reimplementa acá.
--
-- FUERA DE ALCANCE A PROPÓSITO -- bloque separado, requiere decisión
-- del usuario:
--   - crm_payments.order_id vs crm_payments.quote_id. Producción no
--     tiene order_id (sí lo tiene crm_invoices, columna distinta) y
--     sí tiene quote_id. src/services/crmService.js.registerOrderPayment()
--     sigue insertando order_id incondicionalmente. Ver análisis
--     aparte entregado junto con esta migración -- no se toca aquí.
--
-- Objetos reproducidos en este archivo, confirmados en el dump:
--   1. crm_payments.amount: NUMERIC(10,2) -> NUMERIC(12,2) (ensanchado
--      en producción; ningún archivo local lo hizo).
--   2. crm_payments.quote_id (uuid, FK -> crm_quotes(id) ON DELETE SET
--      NULL) + índice idx_crm_payments_quote_id. No tiene lectura ni
--      escritura en src/ hoy (columna huérfana confirmada por grep,
--      no se infiere su propósito original).
--   3. crm_payments.void_cash_session_id (uuid, FK -> crm_cash_sessions(id))
--      + índice parcial idx_crm_payments_void_session. Tampoco tiene
--      uso en src/ hoy.
--   4. Índices confirmados en producción sobre columnas base de
--      crm_payments que ninguna migración local creó nunca:
--      idx_crm_payments_payment_date, idx_crm_payments_payment_method,
--      idx_crm_payments_payment_status.
--   5. crm_cash_sessions: expected_cash, counted_cash, cash_difference
--      (numeric(12,2)), closing_notes (text), closed_by (uuid, FK ->
--      auth.users(id)) -- con los mismos COMMENT ON COLUMN que trae
--      producción. src/services/crmService.js.closeCashSession() hoy
--      solo escribe status/closed_at: estas 5 columnas están listas
--      en el esquema pero sin lógica de app que las use todavía
--      (feature de cierre con arqueo, aparentemente sin terminar).
--   6. crm_cash_movements.reversal_payment_id (uuid, FK ->
--      crm_payments(id)) + índice parcial idx_crm_cash_movements_reversal,
--      y ampliación del CHECK de category para incluir
--      'payment_reversal' (el resto de valores permitidos no cambia).
--      Sin uso en src/ hoy tampoco.
--   7. crm_document_changes (tabla completa) -- log de auditoría de
--      cambios de campo en facturas/presupuestos. Sin trigger ni
--      función en producción que la alimente, y sin ninguna referencia
--      en src/: confirmado schema-only, ninguna feature la escribe
--      todavía.
--   8. crm_purchase_invoices (tabla completa) -- encabezado de compras
--      a proveedor. A diferencia de crm_document_changes, ESTA SÍ está
--      en uso activo: src/services/crmService.js (getPurchaseInvoices,
--      createPurchaseInvoice, deletePurchaseInvoice) la lee/escribe/
--      borra hoy, y el propio archivo trae desde hace tiempo un
--      comentario "Requiere migración en Supabase Dashboard" con el
--      DDL original -- evidencia directa de que esta tabla se creó a
--      mano vía SQL Editor y nunca se versionó, exactamente el patrón
--      que produjo el drift de los 7 huérfanos.
--
-- GRANTS: crm_document_changes y crm_purchase_invoices son tablas
-- nuevas para este archivo, así que -- a diferencia de las columnas
-- nuevas de tablas ya existentes, que heredan el GRANT de tabla ya
-- otorgado por migraciones previas -- necesitan GRANT propio para que
-- `authenticated` pueda usarlas. El shadow local de `db reset --local`
-- NO replica el GRANT implícito que la plataforma hospedada de
-- Supabase aplica sola a tablas nuevas (mismo fenómeno ya documentado
-- en 20260808100000/20260808110000/20260808120000): sin este GRANT
-- explícito, `db reset --local` falla con "permission denied" aunque
-- producción funcione por el default implícito de plataforma. Se
-- otorga el mínimo confirmado por uso real de código (no el
-- "ALL a anon/authenticated/service_role" que trae el dump, que ya
-- fue identificado en el análisis de drift como boilerplate genérico
-- de plataforma sobre TODAS las tablas, no algo específico de estas
-- dos) -- exactamente el mismo criterio que
-- 20260808110000_crm_payments_reconciliation.sql aplicó a crm_payments.
-- No se toca `anon` en ninguna de las dos tablas: RLS ya las deja en
-- cero filas (ninguna policy es TO anon ni PUBLIC-sin-auth.uid() útil)
-- y esa decisión de hardening más amplia queda fuera de alcance acá,
-- igual que se dejó fuera en 20260808110000.
--
-- IDEMPOTENCIA: ADD COLUMN / CREATE TABLE / CREATE INDEX usan
-- IF NOT EXISTS; el CHECK de category se DROPea (IF EXISTS) y se
-- vuelve a crear con el mismo nombre; policies vía DROP POLICY IF
-- EXISTS + CREATE POLICY. Todo el archivo es reproducible sin efectos
-- secundarios en una segunda corrida, y aplicado contra producción
-- (que ya tiene todo esto) es un no-op total.
-- ============================================================

-- ── 1. crm_payments.amount: ensanchar a NUMERIC(12,2) ──────────────────────────
-- No-op si ya es numeric(12,2) (segunda corrida, o ya aplicado en remoto).
ALTER TABLE public.crm_payments
  ALTER COLUMN amount TYPE NUMERIC(12,2);

-- ── 2. crm_payments.quote_id ─────────────────────────────────────────────────
ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.crm_quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_payments_quote_id
  ON public.crm_payments (quote_id);

-- ── 3. crm_payments.void_cash_session_id ─────────────────────────────────────
ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS void_cash_session_id UUID REFERENCES public.crm_cash_sessions(id);

CREATE INDEX IF NOT EXISTS idx_crm_payments_void_session
  ON public.crm_payments (void_cash_session_id)
  WHERE void_cash_session_id IS NOT NULL;

-- ── 4. Índices de crm_payments confirmados en producción, nunca creados localmente ──
CREATE INDEX IF NOT EXISTS idx_crm_payments_payment_date
  ON public.crm_payments (payment_date);

CREATE INDEX IF NOT EXISTS idx_crm_payments_payment_method
  ON public.crm_payments (payment_method);

CREATE INDEX IF NOT EXISTS idx_crm_payments_payment_status
  ON public.crm_payments (payment_status);

-- ── 5. crm_cash_sessions: columnas de arqueo/cierre ──────────────────────────
ALTER TABLE public.crm_cash_sessions
  ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS counted_cash NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cash_difference NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS closing_notes TEXT,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.crm_cash_sessions.expected_cash IS
  'Efectivo esperado en caja al cierre (calculado en el momento del cierre, no recalcular)';
COMMENT ON COLUMN public.crm_cash_sessions.counted_cash IS
  'Efectivo físico contado por el cajero al cerrar';
COMMENT ON COLUMN public.crm_cash_sessions.cash_difference IS
  'counted_cash - expected_cash (positivo = sobrante, negativo = faltante)';
COMMENT ON COLUMN public.crm_cash_sessions.closing_notes IS
  'Observación obligatoria cuando cash_difference != 0';
COMMENT ON COLUMN public.crm_cash_sessions.closed_by IS
  'Usuario que realizó el cierre';

-- ── 6. crm_cash_movements.reversal_payment_id + category ampliado ───────────
ALTER TABLE public.crm_cash_movements
  ADD COLUMN IF NOT EXISTS reversal_payment_id UUID REFERENCES public.crm_payments(id);

CREATE INDEX IF NOT EXISTS idx_crm_cash_movements_reversal
  ON public.crm_cash_movements (reversal_payment_id)
  WHERE reversal_payment_id IS NOT NULL;

ALTER TABLE public.crm_cash_movements
  DROP CONSTRAINT IF EXISTS crm_cash_movements_category_check;
ALTER TABLE public.crm_cash_movements
  ADD CONSTRAINT crm_cash_movements_category_check
  CHECK (category IN (
    'owner_withdrawal', 'bank_deposit',
    'supplies', 'utilities', 'rent', 'services', 'taxes', 'salaries',
    'other_expense', 'cash_fund', 'correction', 'other', 'payment_reversal'
  ));

-- ── 7. crm_document_changes (tabla nueva, sin uso de app confirmado hoy) ─────
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

CREATE INDEX IF NOT EXISTS idx_crm_doc_changes_business
  ON public.crm_document_changes (business_id);

CREATE INDEX IF NOT EXISTS idx_crm_doc_changes_document
  ON public.crm_document_changes (document_type, document_id, changed_at DESC);

ALTER TABLE public.crm_document_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_document_changes_select" ON public.crm_document_changes;
CREATE POLICY "crm_document_changes_select"
  ON public.crm_document_changes FOR SELECT TO authenticated
  USING (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "crm_document_changes_insert" ON public.crm_document_changes;
CREATE POLICY "crm_document_changes_insert"
  ON public.crm_document_changes FOR INSERT TO authenticated
  WITH CHECK (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

-- Mínimo confirmado: producción solo tiene policies select/insert para esta
-- tabla (sin update/delete), consistente con un log de auditoría append-only.
GRANT SELECT, INSERT
  ON TABLE public.crm_document_changes
  TO authenticated;

-- ── 8. crm_purchase_invoices (tabla nueva, EN USO ACTIVO por crmService.js) ──
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
CREATE POLICY "owner_purchase_invoices"
  ON public.crm_purchase_invoices
  USING (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

-- Mínimo confirmado por uso real: getPurchaseInvoices (SELECT),
-- createPurchaseInvoice (INSERT), deletePurchaseInvoice (DELETE).
-- Ningún caller hace UPDATE hoy -- no se otorga (la policy sigue
-- permitiéndolo vía FOR ALL si en el futuro hace falta, pero eso
-- requeriría además un GRANT nuevo, no solo policy).
GRANT SELECT, INSERT, DELETE
  ON TABLE public.crm_purchase_invoices
  TO authenticated;

-- ── 9. Refrescar schema cache de PostgREST ───────────────────────────────────
NOTIFY pgrst, 'reload schema';
