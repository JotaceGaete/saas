-- Soporte de video de producto.
-- video_path y video_thumbnail_path se usan para cleanup remoto (DELETE en media server).
ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS video_url             TEXT NULL,
  ADD COLUMN IF NOT EXISTS video_thumbnail_url   TEXT NULL,
  ADD COLUMN IF NOT EXISTS video_path            TEXT NULL,
  ADD COLUMN IF NOT EXISTS video_thumbnail_path  TEXT NULL;

COMMENT ON COLUMN public.wa_products.video_url            IS 'URL pública del video del producto (media server externo).';
COMMENT ON COLUMN public.wa_products.video_thumbnail_url  IS 'URL pública del thumbnail generado a partir del video.';
COMMENT ON COLUMN public.wa_products.video_path           IS 'Path relativo en el media server, necesario para borrado remoto.';
COMMENT ON COLUMN public.wa_products.video_thumbnail_path IS 'Path relativo del thumbnail en el media server, necesario para borrado remoto.';
