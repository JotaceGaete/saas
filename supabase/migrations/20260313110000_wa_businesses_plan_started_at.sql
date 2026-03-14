-- plan_started_at: momento en que se activó el plan de pago actual (para auditoría y soporte).
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.wa_businesses.plan_started_at IS 'Fecha/hora en que se activó el plan actual (p. ej. al confirmar pago). NULL si nunca se activó un plan de pago.';
