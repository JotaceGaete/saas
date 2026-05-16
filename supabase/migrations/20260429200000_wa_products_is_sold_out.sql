-- Add is_sold_out to wa_products
-- Idempotent: uses IF NOT EXISTS.
-- Agotado = visible en catálogo pero no se puede pedir.

ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS is_sold_out boolean NOT NULL DEFAULT false;
