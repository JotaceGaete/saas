-- Add Open Graph image URL column to wa_businesses
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS og_image_url TEXT;

