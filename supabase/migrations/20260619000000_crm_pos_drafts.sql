-- Ventas suspendidas del TPV (carrito serializado, no genera factura)
CREATE TABLE IF NOT EXISTS public.crm_pos_drafts (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id     UUID         NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  customer_id     UUID         REFERENCES public.wa_customers(id) ON DELETE SET NULL,
  customer_name   TEXT,
  items           JSONB        NOT NULL DEFAULT '[]',
  discount        TEXT         NOT NULL DEFAULT '',
  notes           TEXT         NOT NULL DEFAULT '',
  payment_method  TEXT         NOT NULL DEFAULT 'cash',
  label           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_pos_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_pos_drafts" ON public.crm_pos_drafts
  FOR ALL USING (
    business_id IN (
      SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS crm_pos_drafts_business_idx
  ON public.crm_pos_drafts (business_id, created_at DESC);
