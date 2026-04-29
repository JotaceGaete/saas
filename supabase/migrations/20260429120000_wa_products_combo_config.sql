-- Add combo_config column to wa_products
-- Idempotent: uses IF NOT EXISTS.
ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS combo_config jsonb DEFAULT NULL;
