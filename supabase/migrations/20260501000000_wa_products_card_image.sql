-- Añade columnas para miniatura de card de catálogo (420px, liviana).
-- Safe: ADD COLUMN IF NOT EXISTS no falla si ya existen.
ALTER TABLE wa_products
  ADD COLUMN IF NOT EXISTS card_image_url  TEXT,
  ADD COLUMN IF NOT EXISTS card_image_path TEXT;

COMMENT ON COLUMN wa_products.card_image_url  IS 'URL de miniatura 420px optimizada para cards de catálogo (WebP/JPEG)';
COMMENT ON COLUMN wa_products.card_image_path IS 'Path en R2 del thumbnail de card (para limpieza futura)';
