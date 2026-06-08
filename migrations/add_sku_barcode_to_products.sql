-- Migration: add sku and barcode columns to wa_products
-- Run once in Supabase SQL editor

ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS sku     text,
  ADD COLUMN IF NOT EXISTS barcode text;

-- Indexes: scoped per business (no global uniqueness — different businesses may reuse codes)
CREATE INDEX IF NOT EXISTS idx_wa_products_business_sku
  ON public.wa_products (business_id, sku)
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_products_business_barcode
  ON public.wa_products (business_id, barcode)
  WHERE barcode IS NOT NULL;
