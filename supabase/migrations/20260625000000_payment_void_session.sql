-- ============================================================
-- Extensión de anulación de pagos:
--   crm_payments.void_cash_session_id  — sesión de caja donde se procesó la anulación
--   crm_cash_movements.reversal_payment_id — vincula un movimiento de reverso al pago original
--
-- Regla de negocio:
--   Si la caja original está abierta al momento de anular, void_cash_session_id = esa misma caja.
--   Si la caja original está cerrada, se crea un movimiento negativo en la caja abierta actual
--   y void_cash_session_id apunta a esa caja corriente.
-- ============================================================

ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS void_cash_session_id uuid REFERENCES public.crm_cash_sessions(id);

ALTER TABLE public.crm_cash_movements
  ADD COLUMN IF NOT EXISTS reversal_payment_id uuid REFERENCES public.crm_payments(id);

CREATE INDEX IF NOT EXISTS idx_crm_payments_void_session
  ON public.crm_payments (void_cash_session_id)
  WHERE void_cash_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_cash_movements_reversal
  ON public.crm_cash_movements (reversal_payment_id)
  WHERE reversal_payment_id IS NOT NULL;
