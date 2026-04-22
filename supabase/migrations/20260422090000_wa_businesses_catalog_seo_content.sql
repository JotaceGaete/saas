ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS seo_family_key TEXT,
  ADD COLUMN IF NOT EXISTS seo_content_override JSONB,
  ADD COLUMN IF NOT EXISTS seo_content_ai JSONB;

COMMENT ON COLUMN public.wa_businesses.seo_family_key IS
  'Override opcional de familia SEO semantica para el catalogo publico.';

COMMENT ON COLUMN public.wa_businesses.seo_content_override IS
  'Texto manual del catalogo. JSONB esperado: { visibleDescription, metaDescription, ogDescription }.';

COMMENT ON COLUMN public.wa_businesses.seo_content_ai IS
  'Texto generado por IA y persistido. JSONB esperado: { visibleDescription, metaDescription, ogDescription, model, generatedAt }.';
