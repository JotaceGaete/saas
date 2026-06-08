-- Nuevos campos en crm_cost_centers para el asistente de onboarding
ALTER TABLE crm_cost_centers
  ADD COLUMN IF NOT EXISTS profit_goal NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS uses_vat BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN NOT NULL DEFAULT false;
