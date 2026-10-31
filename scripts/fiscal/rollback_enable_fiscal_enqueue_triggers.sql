-- Rollback de 20261031130000_disable_fiscal_enqueue_triggers.sql.
-- Restaura el estado original (origin 'O'). Idempotente.
-- NO ejecutar sin aprobación: reactiva el encolado de emisiones DTE 39.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
             WHERE c.relname = 'crm_invoices' AND t.tgname = 'crm_invoice_paid_pos_dte39_enqueue' AND NOT t.tgisinternal) THEN
    ALTER TABLE public.crm_invoices ENABLE TRIGGER crm_invoice_paid_pos_dte39_enqueue;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
             WHERE c.relname = 'crm_pos_point_operations' AND t.tgname = 'trg_enqueue_point_fiscal_pilot' AND NOT t.tgisinternal) THEN
    ALTER TABLE public.crm_pos_point_operations ENABLE TRIGGER trg_enqueue_point_fiscal_pilot;
  END IF;
END $$;
