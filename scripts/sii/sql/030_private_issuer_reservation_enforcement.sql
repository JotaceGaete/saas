-- ISOLATED PILOT ONLY: apply after 029. Private issuer allowlist enforced on retries. Existing reservations are idempotent;
-- new reservations require live CRM digest authorization. Do not deploy.
-- A draft operation is inserted and locked before authorization; a denied
-- authorization rolls back the insert as part of the same transaction.
-- Hardening: all invocations of the existing reservation function must pass
-- the private authorization gate before any operation/CAF mutation.
-- NOTE: an approved row is NOT yet sufficient evidence of a locked, current
-- CRM sale/payment/tax snapshot. Do not deploy or enable CAFs in production.
BEGIN;
CREATE OR REPLACE FUNCTION fiscal.reserve_boleta39(
  p_business_id text,p_sale_id text,p_issuer_rut text
) RETURNS TABLE(operation_id bigint,reserved_folio bigint,operation_version bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 v_op fiscal.issuance_operations%ROWTYPE;
 v_caf fiscal.caf_ranges%ROWTYPE;
BEGIN
 PERFORM fiscal.assert_private_issuer_access(p_business_id,p_issuer_rut);
 IF p_business_id IS NULL OR p_sale_id IS NULL OR p_issuer_rut IS NULL THEN
  RAISE EXCEPTION 'Missing fiscal identifiers';
 END IF;
 INSERT INTO fiscal.issuance_operations(business_id,sale_id,issuer_rut,document_type)
 VALUES(p_business_id,p_sale_id,p_issuer_rut,39)
 ON CONFLICT(business_id,sale_id,document_type) DO NOTHING;
 SELECT * INTO v_op FROM fiscal.issuance_operations
 WHERE business_id=p_business_id AND sale_id=p_sale_id AND document_type=39 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fiscal operation unavailable'; END IF;
 IF v_op.issuer_rut<>p_issuer_rut THEN RAISE EXCEPTION 'Issuer mismatch'; END IF;
 IF v_op.folio IS NOT NULL THEN
  IF v_op.status='cancelled' THEN RAISE EXCEPTION 'Cancelled operation cannot be retried'; END IF;
  RETURN QUERY SELECT v_op.id,v_op.folio,v_op.version;
  RETURN;
 END IF;
 PERFORM fiscal.assert_reservation_authorized(p_business_id,p_sale_id,p_issuer_rut);
 IF v_op.status<>'draft' THEN RAISE EXCEPTION 'Operation is not a draft'; END IF;
 SELECT * INTO v_caf FROM fiscal.caf_ranges
 WHERE issuer_rut=p_issuer_rut AND document_type=39 AND active AND next_folio<=last_folio
 ORDER BY first_folio,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM fiscal.caf_ranges
    WHERE issuer_rut=p_issuer_rut AND document_type=39 AND active AND next_folio<=last_folio)
  THEN RAISE EXCEPTION USING ERRCODE='PZ101',MESSAGE='CAF range temporarily locked';
  END IF;
  RAISE EXCEPTION 'No active CAF folios available';
 END IF;
 UPDATE fiscal.caf_ranges SET next_folio=next_folio+1 WHERE id=v_caf.id;
 UPDATE fiscal.issuance_operations SET folio=v_caf.next_folio,status='reserved',
  version=version+1,updated_at=now() WHERE id=v_op.id;
 RETURN QUERY SELECT v_op.id,v_caf.next_folio,v_op.version+1;
END;
$$;
REVOKE ALL ON FUNCTION fiscal.reserve_boleta39(text,text,text) FROM PUBLIC,anon,authenticated;
COMMIT;
