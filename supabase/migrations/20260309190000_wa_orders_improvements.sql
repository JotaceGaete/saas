-- Add internal_notes column to wa_orders for store owner private notes
ALTER TABLE public.wa_orders
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;
