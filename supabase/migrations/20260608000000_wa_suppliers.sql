-- ============================================================
-- wa_suppliers + wa_supplier_debts: módulo de proveedores
-- ============================================================

-- 1. Tabla wa_suppliers

CREATE TABLE IF NOT EXISTS public.wa_suppliers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_suppliers_business_id ON public.wa_suppliers(business_id);

DROP TRIGGER IF EXISTS wa_suppliers_updated_at ON public.wa_suppliers;
CREATE TRIGGER wa_suppliers_updated_at
  BEFORE UPDATE ON public.wa_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- 2. Tabla wa_supplier_debts

CREATE TABLE IF NOT EXISTS public.wa_supplier_debts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.wa_suppliers(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  due_date    DATE,
  paid_at     TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_supplier_debts_business_id  ON public.wa_supplier_debts(business_id);
CREATE INDEX IF NOT EXISTS idx_wa_supplier_debts_supplier_id  ON public.wa_supplier_debts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_wa_supplier_debts_status       ON public.wa_supplier_debts(status);

DROP TRIGGER IF EXISTS wa_supplier_debts_updated_at ON public.wa_supplier_debts;
CREATE TRIGGER wa_supplier_debts_updated_at
  BEFORE UPDATE ON public.wa_supplier_debts
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- 3. RLS: wa_suppliers

ALTER TABLE public.wa_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_suppliers_owner_select" ON public.wa_suppliers;
DROP POLICY IF EXISTS "wa_suppliers_owner_insert" ON public.wa_suppliers;
DROP POLICY IF EXISTS "wa_suppliers_owner_update" ON public.wa_suppliers;
DROP POLICY IF EXISTS "wa_suppliers_owner_delete" ON public.wa_suppliers;

CREATE POLICY "wa_suppliers_owner_select"
ON public.wa_suppliers FOR SELECT TO authenticated
USING (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

CREATE POLICY "wa_suppliers_owner_insert"
ON public.wa_suppliers FOR INSERT TO authenticated
WITH CHECK (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

CREATE POLICY "wa_suppliers_owner_update"
ON public.wa_suppliers FOR UPDATE TO authenticated
USING (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
))
WITH CHECK (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

CREATE POLICY "wa_suppliers_owner_delete"
ON public.wa_suppliers FOR DELETE TO authenticated
USING (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

-- 4. RLS: wa_supplier_debts

ALTER TABLE public.wa_supplier_debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_supplier_debts_owner_select" ON public.wa_supplier_debts;
DROP POLICY IF EXISTS "wa_supplier_debts_owner_insert" ON public.wa_supplier_debts;
DROP POLICY IF EXISTS "wa_supplier_debts_owner_update" ON public.wa_supplier_debts;
DROP POLICY IF EXISTS "wa_supplier_debts_owner_delete" ON public.wa_supplier_debts;

CREATE POLICY "wa_supplier_debts_owner_select"
ON public.wa_supplier_debts FOR SELECT TO authenticated
USING (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

CREATE POLICY "wa_supplier_debts_owner_insert"
ON public.wa_supplier_debts FOR INSERT TO authenticated
WITH CHECK (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

CREATE POLICY "wa_supplier_debts_owner_update"
ON public.wa_supplier_debts FOR UPDATE TO authenticated
USING (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
))
WITH CHECK (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

CREATE POLICY "wa_supplier_debts_owner_delete"
ON public.wa_supplier_debts FOR DELETE TO authenticated
USING (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));
