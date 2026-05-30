-- ============================================================
-- CRM Payments: registro de pagos e ingresos vinculados a notas de venta
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  order_id         UUID REFERENCES public.wa_orders(id) ON DELETE SET NULL,
  invoice_id       UUID REFERENCES public.crm_invoices(id) ON DELETE SET NULL,
  customer_id      UUID REFERENCES public.wa_customers(id) ON DELETE SET NULL,
  amount           NUMERIC(10,2) NOT NULL,
  payment_method   TEXT NOT NULL,
  reference_number TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_crm_payments_business_id  ON public.crm_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_crm_payments_invoice_id   ON public.crm_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_crm_payments_customer_id  ON public.crm_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_payments_created_at   ON public.crm_payments(created_at);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.crm_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_payments_select" ON public.crm_payments;
CREATE POLICY "crm_payments_select"
ON public.crm_payments FOR SELECT TO authenticated
USING (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

DROP POLICY IF EXISTS "crm_payments_insert" ON public.crm_payments;
CREATE POLICY "crm_payments_insert"
ON public.crm_payments FOR INSERT TO authenticated
WITH CHECK (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

DROP POLICY IF EXISTS "crm_payments_update" ON public.crm_payments;
CREATE POLICY "crm_payments_update"
ON public.crm_payments FOR UPDATE TO authenticated
USING  (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "crm_payments_delete" ON public.crm_payments;
CREATE POLICY "crm_payments_delete"
ON public.crm_payments FOR DELETE TO authenticated
USING (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));
