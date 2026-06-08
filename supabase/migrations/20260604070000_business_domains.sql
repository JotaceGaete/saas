-- business_domains: dominios personalizados para negocios Pro/Business
-- Cada negocio puede tener un único dominio propio apuntando a su catálogo.

CREATE TABLE IF NOT EXISTS public.business_domains (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid        NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  domain          text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'verifying', 'active', 'error')),
  vercel_config   jsonb       NULL,
  last_checked_at timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT business_domains_domain_unique UNIQUE (domain),
  CONSTRAINT business_domains_business_unique UNIQUE (business_id)
);

-- Solo un dominio por negocio (enforced by business_unique constraint above)
CREATE INDEX IF NOT EXISTS idx_business_domains_domain ON public.business_domains (domain);
CREATE INDEX IF NOT EXISTS idx_business_domains_business ON public.business_domains (business_id);
CREATE INDEX IF NOT EXISTS idx_business_domains_status  ON public.business_domains (status);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.set_business_domains_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_business_domains_updated_at
  BEFORE UPDATE ON public.business_domains
  FOR EACH ROW EXECUTE FUNCTION public.set_business_domains_updated_at();

-- RLS
ALTER TABLE public.business_domains ENABLE ROW LEVEL SECURITY;

-- Propietario del negocio puede leer su propio dominio
CREATE POLICY "owner_select_business_domains"
  ON public.business_domains FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
    )
  );

-- Escritura solo via service_role (Edge Functions)
-- El frontend no escribe directamente; usa la Edge Function manage-custom-domain.
