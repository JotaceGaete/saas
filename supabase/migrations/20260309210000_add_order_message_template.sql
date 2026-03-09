-- Add order_message_template column to wa_businesses
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS order_message_template TEXT DEFAULT NULL;
