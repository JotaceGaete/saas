-- Store the Vercel-returned DNS configuration per domain.
-- Populated by the manage-custom-domain edge function after add/verify.
ALTER TABLE public.business_domains
  ADD COLUMN IF NOT EXISTS vercel_config JSONB;
