-- Read-only preflight. Expected: all assertions true.
SELECT
  to_regprocedure('public.crm_create_pos_sale(uuid,text,jsonb,date,uuid,numeric,jsonb,text,text)') IS NOT NULL AS pos_sale_rpc_exists,
  to_regprocedure('public.crm_apply_stock_movement()') IS NOT NULL AS stock_trigger_function_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_payments' AND column_name='voided_at') AS void_tracking_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_pos_point_operations' AND column_name='crm_invoice_id') AS point_invoice_link_exists;
-- After applying migration in a test environment:
-- 1. Authenticated owner cancels a POS sale without Point payment:
--    invoice=anulada, active payments=0, stock entrada matches original salida.
-- 2. Repeating same RPC returns already_cancelled=true, no extra entrada.
-- 3. Non-owner and anonymous callers are rejected.
-- 4. A processed Point sale returns POINT_REFUND_REQUIRED and changes nothing.
-- 5. Direct UPDATE of crm_payments.voided_at for a processed Point sale
--    raises POINT_REFUND_REQUIRED from the trigger.
-- 6. CRM invoices (source <> pos) cannot be cancelled by this RPC.
-- 7. A rollback of a failing transaction leaves invoice, payments, stock unchanged.
-- 8. A payment-only void does not imply cancellation or stock reversal.
-- NOTE: tests 1-8 require isolated seeded data and must not be run against
-- production invoices or live Mercado Pago orders.
