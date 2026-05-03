ALTER TABLE public.wa_products
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NULL,
ADD COLUMN IF NOT EXISTS thumbnail_path TEXT NULL;

COMMENT ON COLUMN public.wa_products.thumbnail_url IS 'URL publica del thumbnail/card image persistido del producto.';
COMMENT ON COLUMN public.wa_products.thumbnail_path IS 'Path relativo en R2 del thumbnail/card image persistido del producto.';
