-- ============================================================
-- crm_payments: ensure void columns exist (defensive, additive)
--
-- This migration is a safety net for environments where
-- 20260620100000_crm_payments_void.sql was not applied before
-- 20260620220000_crm_payments_phase1_stabilization.sql.
--
-- All statements are idempotent. No data is modified.
-- ============================================================

ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by   uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_reason text;

-- Partial index for auditing voided payments (only if voided_at exists)
CREATE INDEX IF NOT EXISTS idx_crm_payments_voided_at
  ON public.crm_payments (voided_at)
  WHERE voided_at IS NOT NULL;

-- Partial indexes used by payment summary queries
-- (these may have failed in stabilization if voided_at was missing)
CREATE INDEX IF NOT EXISTS idx_crm_payments_active_invoice
  ON public.crm_payments (invoice_id)
  WHERE payment_status = 'received' AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_payments_active_customer
  ON public.crm_payments (business_id, customer_id)
  WHERE payment_status = 'received' AND voided_at IS NULL;
