-- Add optional images array (URLs) to wa_products for multi-image support.
-- image_url remains the "main" image (first in list / backward compat).

ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.wa_products.images IS 'Array of image URLs; first should match image_url for main display';
