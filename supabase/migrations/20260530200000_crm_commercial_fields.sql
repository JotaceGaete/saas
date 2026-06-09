-- Campos comerciales opcionales para presupuestos y facturas internas
ALTER TABLE public.crm_quotes
  ADD COLUMN IF NOT EXISTS payment_terms    TEXT,
  ADD COLUMN IF NOT EXISTS delivery_days    TEXT,
  ADD COLUMN IF NOT EXISTS delivery_method  TEXT,
  ADD COLUMN IF NOT EXISTS commercial_notes TEXT;

ALTER TABLE public.crm_invoices
  ADD COLUMN IF NOT EXISTS payment_terms    TEXT,
  ADD COLUMN IF NOT EXISTS delivery_days    TEXT,
  ADD COLUMN IF NOT EXISTS delivery_method  TEXT,
  ADD COLUMN IF NOT EXISTS commercial_notes TEXT;
