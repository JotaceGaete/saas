-- Cache de descripciones de producto generadas por IA (por producto + hash de entrada).
-- Solo el backend (service role) escribe; opcionalmente el dueño puede leer vía RLS.

CREATE TABLE IF NOT EXISTS public.wa_ai_product_description_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.wa_products(id) ON DELETE CASCADE,
  input_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  title TEXT,
  description TEXT NOT NULL,
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  call_to_action TEXT,
  hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  usage_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_wa_ai_product_desc_cache_product_input
  ON public.wa_ai_product_description_cache (product_id, input_hash);

CREATE INDEX IF NOT EXISTS idx_wa_ai_product_desc_cache_business_id
  ON public.wa_ai_product_description_cache (business_id);

COMMENT ON TABLE public.wa_ai_product_description_cache IS
  'Respuestas cacheadas de IA para descripción de producto (misma entrada = mismo resultado).';

ALTER TABLE public.wa_ai_product_description_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_ai_product_description_cache_owner_select" ON public.wa_ai_product_description_cache;
CREATE POLICY "wa_ai_product_description_cache_owner_select"
  ON public.wa_ai_product_description_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.wa_businesses b
      WHERE b.id = wa_ai_product_description_cache.business_id
        AND b.user_id = auth.uid()
    )
  );
