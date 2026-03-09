-- Add category column to wa_products
ALTER TABLE public.wa_products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL;
