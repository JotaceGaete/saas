-- Trazabilidad del cálculo de prorrateo / cambio de plan en wa_payments
ALTER TABLE public.wa_payments
  ADD COLUMN IF NOT EXISTS metadata JSONB NULL;

COMMENT ON COLUMN public.wa_payments.metadata IS 'Datos del cálculo: currentPlanSlug, daysRemaining, creditAmount, changeType, etc.';
