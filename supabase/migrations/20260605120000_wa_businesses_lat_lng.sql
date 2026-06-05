-- Add latitude/longitude columns to wa_businesses for accurate map display
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng  DOUBLE PRECISION;
