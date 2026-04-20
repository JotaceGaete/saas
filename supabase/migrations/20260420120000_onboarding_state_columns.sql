ALTER TABLE public.wa_businesses
ADD COLUMN IF NOT EXISTS onboarding_step text NOT NULL DEFAULT 'business_basics',
ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS activated_at timestamptz NULL;

ALTER TABLE public.wa_businesses
DROP CONSTRAINT IF EXISTS wa_businesses_onboarding_step_check;

ALTER TABLE public.wa_businesses
ADD CONSTRAINT wa_businesses_onboarding_step_check
CHECK (onboarding_step IN ('business_basics','first_product','preview','completed'));

UPDATE public.wa_businesses
SET
  onboarding_step = 'completed',
  onboarding_completed_at = COALESCE(onboarding_completed_at, updated_at, created_at, now()),
  activated_at = COALESCE(activated_at, updated_at, created_at, now())
WHERE onboarding_completed_at IS NULL;

ALTER TABLE public.billing_subscriptions
ADD COLUMN IF NOT EXISTS billing_country_code text NULL;

COMMENT ON COLUMN public.wa_businesses.onboarding_step IS
  'Estado del onboarding: business_basics | first_product | preview | completed';

COMMENT ON COLUMN public.wa_businesses.onboarding_completed_at IS
  'Fecha/hora en que el negocio completó el onboarding.';

COMMENT ON COLUMN public.wa_businesses.activated_at IS
  'Fecha/hora en que la tienda quedó lista para compartir.';

COMMENT ON COLUMN public.billing_subscriptions.billing_country_code IS
  'Snapshot del país de billing al momento de crear o actualizar la suscripción.';
