-- Próxima fecha de cobro (SoT para UI de planes). Sincronizar con proveedor / jobs.
ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.billing_subscriptions.next_billing_date IS
  'Próxima fecha de cobro o fin de período facturado; fuente de verdad para textos de renovación en la app.';

UPDATE public.billing_subscriptions
SET next_billing_date = current_period_ends_at
WHERE next_billing_date IS NULL
  AND current_period_ends_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
