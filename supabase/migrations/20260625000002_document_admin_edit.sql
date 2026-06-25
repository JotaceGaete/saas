-- ============================================================
-- Campos administrativos en facturas y presupuestos.
-- Estos campos son editables incluso cuando el documento está
-- bloqueado contablemente (pagado / aprobado).
--
-- purchase_order_number : N° OC del cliente
-- dispatch_instructions : instrucciones de despacho
--
-- crm_document_changes  : auditoría campo a campo de ediciones
--                         administrativas post-cierre contable.
-- ============================================================

-- ── Columnas nuevas en crm_invoices ──────────────────────────────────────────

ALTER TABLE public.crm_invoices
  ADD COLUMN IF NOT EXISTS purchase_order_number TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_instructions TEXT;

-- ── Columnas nuevas en crm_quotes ────────────────────────────────────────────

ALTER TABLE public.crm_quotes
  ADD COLUMN IF NOT EXISTS purchase_order_number TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_instructions TEXT;

-- ── Tabla de auditoría de cambios administrativos ────────────────────────────

CREATE TABLE IF NOT EXISTS public.crm_document_changes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type   TEXT        NOT NULL CHECK (document_type IN ('invoice', 'quote')),
  document_id     UUID        NOT NULL,
  business_id     UUID        NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,

  changed_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  field_name      TEXT        NOT NULL,
  old_value       TEXT,
  new_value       TEXT
);

CREATE INDEX IF NOT EXISTS idx_crm_doc_changes_document
  ON public.crm_document_changes (document_type, document_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_doc_changes_business
  ON public.crm_document_changes (business_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

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
