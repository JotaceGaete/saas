-- ============================================================
-- CRM payments phase 1: partial invoices, payment method hygiene
-- and cash session linkage.
--
-- This migration is intentionally additive except for replacing the
-- crm_invoices.status CHECK with the same allowed values plus 'parcial'.
-- Existing rows with the previous valid states continue to pass.
-- ============================================================

-- 1. crm_invoices.status must allow partial payments.
DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.crm_invoices'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) ILIKE '%pendiente%'
      AND pg_get_constraintdef(oid) ILIKE '%pagada%'
      AND pg_get_constraintdef(oid) ILIKE '%anulada%'
  LOOP
    EXECUTE format('ALTER TABLE public.crm_invoices DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;

  ALTER TABLE public.crm_invoices
    ADD CONSTRAINT crm_invoices_status_check
    CHECK (status IN ('pendiente', 'parcial', 'pagada', 'anulada'));
END $$;

-- 2. Link new payment rows to the cash session that received them.
ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS cash_session_id UUID
    REFERENCES public.crm_cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_payments_cash_session_id
  ON public.crm_payments (cash_session_id);

CREATE INDEX IF NOT EXISTS idx_crm_payments_business_session
  ON public.crm_payments (business_id, cash_session_id);

-- 3. Normalize historical payment_method values used by CRM/POS screens.
-- Credit/current-account values are kept as 'credit' so they can be
-- explicitly excluded from cash totals.
UPDATE public.crm_payments
SET payment_method = CASE
  WHEN lower(trim(payment_method)) IN ('cash', 'efectivo', 'contado') THEN 'cash'
  WHEN lower(trim(payment_method)) IN ('bank_transfer', 'transferencia', 'transferencia bancaria', 'transfer') THEN 'bank_transfer'
  WHEN lower(trim(payment_method)) IN ('card', 'tarjeta', 'tarjeta credito', 'tarjeta debito', 'tarjeta de credito', 'tarjeta de debito') THEN 'card'
  WHEN lower(trim(payment_method)) IN ('check', 'cheque') THEN 'check'
  WHEN lower(trim(payment_method)) IN ('credit', 'cuenta_corriente', 'cuenta corriente', 'cta cte', 'cta. cte.', 'cta_cte') THEN 'credit'
  WHEN lower(trim(payment_method)) IN ('other', 'otro', 'otros') THEN 'other'
  ELSE 'other'
END
WHERE payment_method IS NOT NULL;

-- 4. Defensive indexes for active payment calculations.
CREATE INDEX IF NOT EXISTS idx_crm_payments_active_invoice
  ON public.crm_payments (invoice_id)
  WHERE payment_status = 'received' AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_payments_active_customer
  ON public.crm_payments (business_id, customer_id)
  WHERE payment_status = 'received' AND voided_at IS NULL;
