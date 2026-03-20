-- Eventos de click en botones/enlaces de WhatsApp del catálogo público.
CREATE TABLE IF NOT EXISTS public.wa_catalog_whatsapp_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  path TEXT,
  source TEXT NOT NULL DEFAULT 'unknown', -- store_header | product_modal | cart_checkout | floating_button
  visitor_id TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_catalog_whatsapp_clicks_business_id
  ON public.wa_catalog_whatsapp_clicks(business_id);

CREATE INDEX IF NOT EXISTS idx_wa_catalog_whatsapp_clicks_created_at_desc
  ON public.wa_catalog_whatsapp_clicks(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_catalog_whatsapp_clicks_business_created
  ON public.wa_catalog_whatsapp_clicks(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_catalog_whatsapp_clicks_slug
  ON public.wa_catalog_whatsapp_clicks(slug);

COMMENT ON TABLE public.wa_catalog_whatsapp_clicks IS 'Clicks en acciones WhatsApp del catálogo público.';

ALTER TABLE public.wa_catalog_whatsapp_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_catalog_whatsapp_clicks_owner_select" ON public.wa_catalog_whatsapp_clicks;
CREATE POLICY "wa_catalog_whatsapp_clicks_owner_select"
  ON public.wa_catalog_whatsapp_clicks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.wa_businesses b
      WHERE b.id = wa_catalog_whatsapp_clicks.business_id
        AND b.user_id = auth.uid()
    )
  );

