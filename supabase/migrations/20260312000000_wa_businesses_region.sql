-- Add region column for Chile address (Comuna, Región, País)
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS region TEXT;

COMMENT ON COLUMN public.wa_businesses.region IS 'Región (Chile). Ej: Metropolitana, Valparaíso.';
