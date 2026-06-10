-- Centro de costos: tabla principal (una fila por mes/año/negocio)
CREATE TABLE IF NOT EXISTS crm_cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES wa_businesses(id) ON DELETE CASCADE,
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year SMALLINT NOT NULL CHECK (year >= 2020),
  open_days SMALLINT NOT NULL DEFAULT 22 CHECK (open_days BETWEEN 1 AND 31),
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 19,
  manual_sales_today NUMERIC(14,2),
  manual_sales_month NUMERIC(14,2),
  monthly_purchases_gross NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, month, year)
);

-- Partidas de costo
CREATE TABLE IF NOT EXISTS crm_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES wa_businesses(id) ON DELETE CASCADE,
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year SMALLINT NOT NULL CHECK (year >= 2020),
  name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed', 'variable')),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('rent','salaries','utilities','services','taxes','supplies','other')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE crm_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_cost_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_cost_centers" ON crm_cost_centers;
CREATE POLICY "owner_cost_centers" ON crm_cost_centers
  USING (business_id IN (SELECT id FROM wa_businesses WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "owner_cost_items" ON crm_cost_items;
CREATE POLICY "owner_cost_items" ON crm_cost_items
  USING (business_id IN (SELECT id FROM wa_businesses WHERE user_id = auth.uid()));

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_cost_centers_updated_at ON crm_cost_centers;
CREATE TRIGGER trg_cost_centers_updated_at
  BEFORE UPDATE ON crm_cost_centers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_cost_items_updated_at ON crm_cost_items;
CREATE TRIGGER trg_cost_items_updated_at
  BEFORE UPDATE ON crm_cost_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
