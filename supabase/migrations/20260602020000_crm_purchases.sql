-- Tabla de compras registradas manualmente (precursor del módulo de compras)
CREATE TABLE IF NOT EXISTS crm_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES wa_businesses(id) ON DELETE CASCADE,
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year SMALLINT NOT NULL CHECK (year >= 2020),
  supplier TEXT,
  description TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE crm_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_crm_purchases" ON crm_purchases;
CREATE POLICY "owner_crm_purchases" ON crm_purchases
  USING (business_id IN (SELECT id FROM wa_businesses WHERE user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_crm_purchases_updated_at ON crm_purchases;
CREATE TRIGGER trg_crm_purchases_updated_at
  BEFORE UPDATE ON crm_purchases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Quitar el campo manual de compras de crm_cost_centers (ya no se usa)
ALTER TABLE crm_cost_centers DROP COLUMN IF EXISTS monthly_purchases_gross;
