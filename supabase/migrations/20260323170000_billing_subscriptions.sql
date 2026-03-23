CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subscription_id TEXT NULL,
  plan_slug TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  amount NUMERIC(12, 2) NULL,
  interval_unit TEXT NOT NULL DEFAULT 'month',
  status TEXT NOT NULL,
  provider_status TEXT NULL,
  trial_ends_at TIMESTAMPTZ NULL,
  starts_at TIMESTAMPTZ NULL,
  current_period_starts_at TIMESTAMPTZ NULL,
  current_period_ends_at TIMESTAMPTZ NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_business_id_uq
  ON public.billing_subscriptions(business_id);

CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_provider_subscription_uq
  ON public.billing_subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_subscriptions_status_idx
  ON public.billing_subscriptions(status);

CREATE INDEX IF NOT EXISTS billing_subscriptions_provider_idx
  ON public.billing_subscriptions(provider);

CREATE INDEX IF NOT EXISTS billing_subscriptions_trial_ends_at_idx
  ON public.billing_subscriptions(trial_ends_at);

COMMENT ON TABLE public.billing_subscriptions IS
  'Estado normalizado de suscripciones para billing multi-provider (PayPal, dLocal, etc.).';

COMMENT ON COLUMN public.billing_subscriptions.status IS
  'Estado interno normalizado: trial_without_subscription | trial_with_subscription | pending_approval | scheduled | active | past_due | cancelled | expired';

COMMENT ON COLUMN public.billing_subscriptions.provider_status IS
  'Estado crudo reportado por el proveedor (ej. APPROVAL_PENDING en PayPal).';

NOTIFY pgrst, 'reload schema';
