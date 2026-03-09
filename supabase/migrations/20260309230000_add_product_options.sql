-- Add product options fields to wa_products
ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS has_options BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS options_description TEXT DEFAULT NULL;
