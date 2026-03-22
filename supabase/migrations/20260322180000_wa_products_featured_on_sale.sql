-- Badges en catálogo público: destacado / oferta (el editor ya envía featured en algunos entornos).
ALTER TABLE public.wa_products ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.wa_products ADD COLUMN IF NOT EXISTS on_sale BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.wa_products.featured IS 'Destacado (badge Más vendido en catálogo).';
COMMENT ON COLUMN public.wa_products.on_sale IS 'En oferta (badge Oferta en catálogo).';
