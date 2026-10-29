-- ISOLATED PILOT ONLY. Apply after 026 and 028.
-- Gate both first reservation and idempotent retrieval by private issuer access.
BEGIN;
CREATE OR REPLACE FUNCTION fiscal.assert_reservation_authorized(
 p_business_id text,p_sale_id text,p_issuer_rut text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_approved_digest text; v_current_digest text;
BEGIN
 PERFORM fiscal.assert_private_issuer_access(p_business_id,p_issuer_rut);
 SELECT sale_digest INTO v_approved_digest
 FROM fiscal.reservation_authorizations
 WHERE business_id=p_business_id AND sale_id=p_sale_id
 AND issuer_rut=p_issuer_rut AND document_type=39
 AND approved IS TRUE AND sale_digest IS NOT NULL
 AND expires_at IS NOT NULL AND expires_at>clock_timestamp()
 AND consumed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='Fiscal reservation not authorized';
 END IF;
 v_current_digest:=fiscal.compute_live_crm_digest(p_business_id,p_sale_id);
 IF v_current_digest IS DISTINCT FROM v_approved_digest THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='Live CRM data changed since approval';
 END IF;
 UPDATE fiscal.reservation_authorizations
 SET consumed_at=clock_timestamp(),approved=false
 WHERE business_id=p_business_id AND sale_id=p_sale_id
 AND issuer_rut=p_issuer_rut AND document_type=39 AND consumed_at IS NULL;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='Fiscal authorization already consumed';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION fiscal.assert_reservation_authorized(text,text,text)
 FROM PUBLIC,anon,authenticated;
-- Existing reservations must also fail closed if the business is revoked.
-- Preserve the reservation algorithm and insert access check before the
-- existing operation lookup, without consuming a second approval.
COMMIT;
