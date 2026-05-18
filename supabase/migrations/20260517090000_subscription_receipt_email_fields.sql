-- Recibo transaccional de suscripciones enviado por Loops.
-- wa_payments es la fuente preferida porque el recibo representa un pago concreto.
ALTER TABLE public.wa_payments
  ADD COLUMN IF NOT EXISTS receipt_email_sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS receipt_email_provider TEXT NULL,
  ADD COLUMN IF NOT EXISTS receipt_email_error TEXT NULL;

COMMENT ON COLUMN public.wa_payments.receipt_email_sent_at IS
  'Fecha en que se envió el recibo transaccional del pago de suscripción.';
COMMENT ON COLUMN public.wa_payments.receipt_email_provider IS
  'Proveedor usado para enviar el recibo transaccional, por ejemplo loops.';
COMMENT ON COLUMN public.wa_payments.receipt_email_error IS
  'Último error no sensible al intentar enviar el recibo transaccional.';

CREATE INDEX IF NOT EXISTS idx_wa_payments_receipt_email_sent_at
  ON public.wa_payments(receipt_email_sent_at)
  WHERE receipt_email_sent_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
