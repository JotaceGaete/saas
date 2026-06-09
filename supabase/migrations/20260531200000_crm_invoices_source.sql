-- Add source column to crm_invoices to distinguish POS sales from CRM-created invoices
ALTER TABLE crm_invoices
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'crm'
    CHECK (source IN ('crm', 'pos'));
