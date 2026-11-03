DO $$
DECLARE
  v_state "char";
BEGIN
  -- 1) crm_invoices -> fiscal.enqueue_paid_pos_dte39()
  SELECT t.tgenabled INTO v_state
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'crm_invoices'
     AND t.tgname = 'crm_invoice_paid_pos_dte39_enqueue' AND NOT t.tgisinternal;
  IF v_state IS NOT NULL AND v_state <> 'D' THEN
    ALTER TABLE public.crm_invoices DISABLE TRIGGER crm_invoice_paid_pos_dte39_enqueue;
  END IF;

  -- 2) crm_pos_point_operations -> public.crm_enqueue_point_fiscal_pilot()
  SELECT t.tgenabled INTO v_state
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'crm_pos_point_operations'
     AND t.tgname = 'trg_enqueue_point_fiscal_pilot' AND NOT t.tgisinternal;
  IF v_state IS NOT NULL AND v_state <> 'D' THEN
    ALTER TABLE public.crm_pos_point_operations DISABLE TRIGGER trg_enqueue_point_fiscal_pilot;
  END IF;

  -- 3) Verificación: ningún trigger de encolado fiscal puede quedar activo.
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE NOT t.tgisinternal
       AND t.tgname IN ('crm_invoice_paid_pos_dte39_enqueue', 'trg_enqueue_point_fiscal_pilot')
       AND t.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'fiscal enqueue trigger still enabled after migration';
  END IF;
END $$;