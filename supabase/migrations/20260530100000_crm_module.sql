-- ============================================================
-- CRM Module: clientes extendidos, presupuestos, facturas internas, stock
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extender wa_customers con campos CRM
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.wa_customers
  ADD COLUMN IF NOT EXISTS company  TEXT,
  ADD COLUMN IF NOT EXISTS rut      TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS address  TEXT,
  ADD COLUMN IF NOT EXISTS notes    TEXT;

-- Política INSERT para que el dueño cree clientes directamente desde el CRM
DROP POLICY IF EXISTS "wa_customers_owner_insert" ON public.wa_customers;
CREATE POLICY "wa_customers_owner_insert"
ON public.wa_customers FOR INSERT TO authenticated
WITH CHECK (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

-- Política DELETE para que el dueño pueda borrar sus propios clientes
DROP POLICY IF EXISTS "wa_customers_owner_delete" ON public.wa_customers;
CREATE POLICY "wa_customers_owner_delete"
ON public.wa_customers FOR DELETE TO authenticated
USING (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Extender wa_products con control de stock
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS stock_actual  INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stock_minimo  INTEGER DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. crm_quotes — Presupuestos
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_quotes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id              UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  customer_id              UUID REFERENCES public.wa_customers(id) ON DELETE SET NULL,
  quote_number             INTEGER NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'borrador'
                             CHECK (status IN ('borrador','enviado','aceptado','rechazado')),
  valid_until              DATE,
  notes                    TEXT,
  subtotal                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                    NUMERIC(12,2) NOT NULL DEFAULT 0,
  converted_to_invoice_id  UUID,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT crm_quotes_number_unique UNIQUE (business_id, quote_number)
);

CREATE INDEX IF NOT EXISTS idx_crm_quotes_business_id  ON public.crm_quotes(business_id);
CREATE INDEX IF NOT EXISTS idx_crm_quotes_customer_id  ON public.crm_quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_quotes_status       ON public.crm_quotes(status);
CREATE INDEX IF NOT EXISTS idx_crm_quotes_created_at   ON public.crm_quotes(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. crm_quote_items — Ítems de presupuesto
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_quote_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id     UUID NOT NULL REFERENCES public.crm_quotes(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES public.wa_products(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity     INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  subtotal     NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_crm_quote_items_quote_id ON public.crm_quote_items(quote_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. crm_invoices — Facturas internas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES public.wa_customers(id) ON DELETE SET NULL,
  invoice_number  INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (status IN ('pendiente','pagada','anulada')),
  issue_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  notes           TEXT,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  quote_id        UUID REFERENCES public.crm_quotes(id) ON DELETE SET NULL,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT crm_invoices_number_unique UNIQUE (business_id, invoice_number)
);

-- FK diferida para evitar dependencia circular con crm_quotes.
-- ADD CONSTRAINT no soporta IF NOT EXISTS: se verifica pg_constraint para que
-- la migración sea re-ejecutable sobre una base que ya tiene el esquema CRM.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_quotes_invoice_fk'
      AND conrelid = 'public.crm_quotes'::regclass
  ) THEN
    ALTER TABLE public.crm_quotes
      ADD CONSTRAINT crm_quotes_invoice_fk
      FOREIGN KEY (converted_to_invoice_id) REFERENCES public.crm_invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_invoices_business_id ON public.crm_invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_crm_invoices_customer_id ON public.crm_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_invoices_status      ON public.crm_invoices(status);
CREATE INDEX IF NOT EXISTS idx_crm_invoices_created_at  ON public.crm_invoices(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. crm_invoice_items — Ítems de factura
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_invoice_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES public.crm_invoices(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES public.wa_products(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity     INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  subtotal     NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_crm_invoice_items_invoice_id ON public.crm_invoice_items(invoice_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. crm_stock_movements — Historial de movimientos de stock
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_stock_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES public.wa_products(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('entrada','salida','ajuste')),
  quantity    INTEGER NOT NULL,
  notes       TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_stock_movements_business_id ON public.crm_stock_movements(business_id);
CREATE INDEX IF NOT EXISTS idx_crm_stock_movements_product_id  ON public.crm_stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_crm_stock_movements_created_at  ON public.crm_stock_movements(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Triggers updated_at
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS crm_quotes_updated_at   ON public.crm_quotes;
CREATE TRIGGER crm_quotes_updated_at
  BEFORE UPDATE ON public.crm_quotes
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

DROP TRIGGER IF EXISTS crm_invoices_updated_at ON public.crm_invoices;
CREATE TRIGGER crm_invoices_updated_at
  BEFORE UPDATE ON public.crm_invoices
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Función: próximo número correlativo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_next_quote_number(p_business_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_next INTEGER;
BEGIN
  SELECT COALESCE(MAX(quote_number), 0) + 1
  INTO v_next
  FROM public.crm_quotes
  WHERE business_id = p_business_id;
  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_next_invoice_number(p_business_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_next INTEGER;
BEGIN
  SELECT COALESCE(MAX(invoice_number), 0) + 1
  INTO v_next
  FROM public.crm_invoices
  WHERE business_id = p_business_id;
  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_next_quote_number   TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_next_invoice_number TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RLS en tablas CRM (solo dueño del negocio)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.crm_quotes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_quote_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_invoice_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stock_movements  ENABLE ROW LEVEL SECURITY;

-- crm_quotes
DROP POLICY IF EXISTS "crm_quotes_owner" ON public.crm_quotes;
CREATE POLICY "crm_quotes_owner" ON public.crm_quotes
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

-- crm_quote_items (acceso via quote)
DROP POLICY IF EXISTS "crm_quote_items_owner" ON public.crm_quote_items;
CREATE POLICY "crm_quote_items_owner" ON public.crm_quote_items
  FOR ALL TO authenticated
  USING (quote_id IN (
    SELECT q.id FROM public.crm_quotes q
    JOIN public.wa_businesses b ON b.id = q.business_id
    WHERE b.user_id = auth.uid()
  ))
  WITH CHECK (quote_id IN (
    SELECT q.id FROM public.crm_quotes q
    JOIN public.wa_businesses b ON b.id = q.business_id
    WHERE b.user_id = auth.uid()
  ));

-- crm_invoices
DROP POLICY IF EXISTS "crm_invoices_owner" ON public.crm_invoices;
CREATE POLICY "crm_invoices_owner" ON public.crm_invoices
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

-- crm_invoice_items
DROP POLICY IF EXISTS "crm_invoice_items_owner" ON public.crm_invoice_items;
CREATE POLICY "crm_invoice_items_owner" ON public.crm_invoice_items
  FOR ALL TO authenticated
  USING (invoice_id IN (
    SELECT i.id FROM public.crm_invoices i
    JOIN public.wa_businesses b ON b.id = i.business_id
    WHERE b.user_id = auth.uid()
  ))
  WITH CHECK (invoice_id IN (
    SELECT i.id FROM public.crm_invoices i
    JOIN public.wa_businesses b ON b.id = i.business_id
    WHERE b.user_id = auth.uid()
  ));

-- crm_stock_movements
DROP POLICY IF EXISTS "crm_stock_movements_owner" ON public.crm_stock_movements;
CREATE POLICY "crm_stock_movements_owner" ON public.crm_stock_movements
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));
