-- ISOLATED PILOT ONLY. PostgreSQL 16 / pgcrypto required.
-- Compute a deterministic digest from LIVE CRM rows under row locks.
-- Not yet wired to CAF reservation: locking existing rows does NOT prevent
-- concurrent INSERTs of new payments/items unless all writers share a lock.
-- The schema/field assumptions must be reviewed against Walinka production.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE OR REPLACE FUNCTION fiscal.compute_live_crm_digest(
 p_business_id text,p_sale_id text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 v_sale jsonb;
 v_items jsonb;
 v_payments jsonb;
 v_taxes jsonb;
 v_total numeric;
 v_paid numeric;
 v_count bigint;
BEGIN
 -- Lock parent first. All CRM writers must eventually acquire the same
 -- parent lock before adding/changing children to eliminate phantoms.
 SELECT to_jsonb(s),s.total INTO v_sale,v_total
 FROM public.crm_invoices s
 WHERE s.id::text=p_sale_id AND s.business_id::text=p_business_id
   AND s.status='pagada' AND s.paid_at IS NOT NULL
 FOR UPDATE;
 IF v_sale IS NULL OR v_total IS NULL OR v_total<=0 OR v_total<>trunc(v_total) THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='Fiscal sale not eligible';
 END IF;
 -- Lock child rows in stable order before aggregating.
 PERFORM 1 FROM public.crm_invoice_items i
 WHERE i.invoice_id::text=p_sale_id ORDER BY i.id FOR UPDATE;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb),count(*)
 INTO v_items,v_count FROM public.crm_invoice_items i
 WHERE i.invoice_id::text=p_sale_id;
 IF v_count=0 THEN RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='No sale lines'; END IF;
 PERFORM 1 FROM public.crm_payments p
 WHERE p.invoice_id::text=p_sale_id ORDER BY p.id FOR UPDATE;
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb),
        coalesce(sum(p.amount),0),count(*)
 INTO v_payments,v_paid,v_count
 FROM public.crm_payments p WHERE p.invoice_id::text=p_sale_id
 AND p.payment_status='received' AND p.voided_at IS NULL
 AND p.payment_method IN ('cash','card','debit_card','credit_card',
                         'mercado_pago','bank_transfer','check','other');
 IF v_count=0 OR v_paid<>v_total THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='Fiscal payments do not reconcile';
 END IF;
 -- Reject any other payment rows; even a pending payment is not silently
 -- excluded from the fiscal snapshot.
 IF EXISTS(SELECT 1 FROM public.crm_payments p WHERE p.invoice_id::text=p_sale_id
 AND (p.payment_status IS DISTINCT FROM 'received'
   OR p.voided_at IS NOT NULL
   OR p.payment_method NOT IN ('cash','card','debit_card','credit_card',
      'mercado_pago','bank_transfer','check','other'))) THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='Unreconciled payment state';
 END IF;
 PERFORM 1 FROM fiscal.verified_line_taxes t
 WHERE t.business_id=p_business_id AND t.invoice_id=p_sale_id
 ORDER BY t.invoice_item_id FOR UPDATE;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.invoice_item_id),'[]'::jsonb),
        count(*) INTO v_taxes,v_count
 FROM fiscal.verified_line_taxes t
 WHERE t.business_id=p_business_id AND t.invoice_id=p_sale_id
 AND t.verified IS TRUE AND t.category='IVA_AFECTO_19';
 IF v_count<>(SELECT count(*) FROM public.crm_invoice_items i
               WHERE i.invoice_id::text=p_sale_id)
 OR EXISTS(SELECT 1 FROM public.crm_invoice_items i
   WHERE i.invoice_id::text=p_sale_id AND NOT EXISTS(
    SELECT 1 FROM fiscal.verified_line_taxes t
    WHERE t.business_id=p_business_id AND t.invoice_id=p_sale_id
      AND t.invoice_item_id=i.id::text AND t.verified IS TRUE
      AND t.category='IVA_AFECTO_19')) THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='Tax mapping incomplete';
 END IF;
 RETURN encode(public.digest(pg_catalog.convert_to(
  jsonb_build_object('v',1,'business',p_business_id,'sale',v_sale,
   'items',v_items,'payments',v_payments,'taxes',v_taxes)::text,'UTF8'),'sha256'),'hex');
END;
$$;
REVOKE ALL ON FUNCTION fiscal.compute_live_crm_digest(text,text)
 FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION fiscal.compute_live_crm_digest(text,text) IS
 'Pilot-only live row digest. Not safe for real issuance until all CRM writers lock the parent and schema and VAT rounding are reviewed.';
COMMIT;
