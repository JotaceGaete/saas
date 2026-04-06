-- Redes sociales del negocio: Instagram, TikTok, Facebook.
-- Se almacenan como URLs completas (normalizadas desde el servicio).
-- Nullable: solo se muestran en el catálogo si están configuradas.

ALTER TABLE wa_businesses
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_url    TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url  TEXT;

COMMENT ON COLUMN wa_businesses.instagram_url IS 'URL de Instagram del negocio (ej: https://instagram.com/minegocio)';
COMMENT ON COLUMN wa_businesses.tiktok_url    IS 'URL de TikTok del negocio (ej: https://tiktok.com/@minegocio)';
COMMENT ON COLUMN wa_businesses.facebook_url  IS 'URL de Facebook del negocio (ej: https://facebook.com/minegocio)';
