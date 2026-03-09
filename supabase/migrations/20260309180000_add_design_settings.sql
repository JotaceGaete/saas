-- Add design_settings JSONB column to wa_businesses
ALTER TABLE public.wa_businesses
ADD COLUMN IF NOT EXISTS design_settings JSONB DEFAULT NULL;
