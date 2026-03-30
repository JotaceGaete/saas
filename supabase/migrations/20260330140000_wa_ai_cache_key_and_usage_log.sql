-- Evolución: cache por (business_id, cache_key) con provider+model en la clave; product_id opcional.
-- Registro de uso IA: wa_ai_usage_log

-- 1) Cache: cache_key, product_id opcional
ALTER TABLE public.wa_ai_product_description_cache
  ADD COLUMN IF NOT EXISTS cache_key TEXT;

UPDATE public.wa_ai_product_description_cache
SET cache_key = md5(concat_ws('|', business_id::text, coalesce(input_hash, ''), 'legacy'))
WHERE cache_key IS NULL OR trim(cache_key) = '';

ALTER TABLE public.wa_ai_product_description_cache
  ALTER COLUMN cache_key SET NOT NULL;

ALTER TABLE public.wa_ai_product_description_cache
  ALTER COLUMN product_id DROP NOT NULL;

DROP INDEX IF EXISTS ux_wa_ai_product_desc_cache_product_input;

CREATE UNIQUE INDEX IF NOT EXISTS ux_wa_ai_product_desc_cache_business_cache_key
  ON public.wa_ai_product_description_cache (business_id, cache_key);

CREATE INDEX IF NOT EXISTS idx_wa_ai_product_desc_cache_input_hash
  ON public.wa_ai_product_description_cache (business_id, input_hash);

COMMENT ON COLUMN public.wa_ai_product_description_cache.cache_key IS
  'SHA-256 hex: negocio + texto + productName + maxLen + provider + model (entrada canónica de cache).';

-- 2) Uso de IA
CREATE TABLE IF NOT EXISTS public.wa_ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  feature TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  cached BOOLEAN NOT NULL DEFAULT FALSE,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  usage_metadata JSONB,
  product_id UUID REFERENCES public.wa_products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_ai_usage_log_business_created
  ON public.wa_ai_usage_log (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_ai_usage_log_user_created
  ON public.wa_ai_usage_log (user_id, created_at DESC);

COMMENT ON TABLE public.wa_ai_usage_log IS
  'Eventos de uso de IA (feature, proveedor, modelo, cache hit, tokens si hay metadata).';

ALTER TABLE public.wa_ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_ai_usage_log_owner_select" ON public.wa_ai_usage_log;
CREATE POLICY "wa_ai_usage_log_owner_select"
  ON public.wa_ai_usage_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.wa_businesses b
      WHERE b.id = wa_ai_usage_log.business_id
        AND b.user_id = auth.uid()
    )
  );
