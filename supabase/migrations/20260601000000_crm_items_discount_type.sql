-- Add discount_type to crm_quote_items and crm_invoice_items.
-- Existing rows default to 'percentage' so all prior documents keep working.
-- discount_pct column is reused as the numeric value (% or fixed amount).

ALTER TABLE crm_quote_items
  ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'percentage'
    CHECK (discount_type IN ('percentage', 'fixed'));

ALTER TABLE crm_invoice_items
  ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'percentage'
    CHECK (discount_type IN ('percentage', 'fixed'));
