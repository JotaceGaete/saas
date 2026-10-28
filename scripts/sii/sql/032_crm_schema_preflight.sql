-- READ-ONLY CRM schema preflight. Execute manually against a safe database.
-- Does not read customer records, change schema, reserve CAF or issue DTE.
-- Return rows with status=missing; any missing requirement blocks fiscal rollout.
WITH expected(table_name,column_name) AS (
 VALUES
 ('wa_businesses','id'),('wa_businesses','user_id'),
 ('wa_businesses','country_code'),('wa_businesses','is_active'),
 ('crm_invoices','id'),('crm_invoices','business_id'),
 ('crm_invoices','status'),('crm_invoices','paid_at'),('crm_invoices','total'),
 ('crm_invoice_items','id'),('crm_invoice_items','invoice_id'),
 ('crm_invoice_items','name'),('crm_invoice_items','description'),
 ('crm_invoice_items','quantity'),('crm_invoice_items','unit_price'),
 ('crm_invoice_items','subtotal'),
 ('crm_payments','invoice_id'),('crm_payments','amount'),
 ('crm_payments','payment_method'),('crm_payments','payment_status'),
 ('crm_payments','voided_at')
)
SELECT e.table_name,e.column_name,
 CASE WHEN c.column_name IS NULL THEN 'missing' ELSE 'present' END AS status,
 c.data_type, c.udt_name, c.is_nullable
FROM expected e
LEFT JOIN information_schema.columns c
 ON c.table_schema='public'
 AND c.table_name=e.table_name AND c.column_name=e.column_name
ORDER BY e.table_name,e.column_name;

-- Candidate description columns: inspect rather than assuming the field name.
SELECT table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public'
 AND table_name IN ('crm_invoice_items','crm_invoices')
 AND (column_name ILIKE '%name%' OR column_name ILIKE '%desc%'
      OR column_name ILIKE '%title%' OR column_name ILIKE '%product%')
ORDER BY table_name,column_name;

-- Constraints and indexes needed for immutable snapshot consistency.
SELECT tc.table_name,tc.constraint_name,tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_schema='public'
 AND tc.table_name IN ('crm_invoices','crm_invoice_items','crm_payments')
ORDER BY tc.table_name,tc.constraint_type,tc.constraint_name;
