-- ISOLATED PILOT ONLY. Apply after 014 and 016.
-- Single-use, expiring authorizations. Still requires trusted transactional
-- CRM source validation and a digest recheck before real issuance.
BEGIN;
ALTER TABLE fiscal.reservation_authorizations
 ADD COLUMN IF NOT EXISTS expires_at timestamptz,
 ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
CREATE OR REPLACE FUNCTION fiscal.assert_reservation_authorized(
 p_business_id text,p_sale_id text,p_issuer_rut text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_id text;
BEGIN
 SELECT sale_id INTO v_id FROM fiscal.reservation_authorizations
 WHERE business_id=p_business_id AND sale_id=p_sale_id
  AND issuer_rut=p_issuer_rut AND document_type=39
  AND approved IS TRUE AND sale_digest IS NOT NULL
  AND expires_at IS NOT NULL AND expires_at>clock_timestamp()
  AND consumed_at IS NULL
 FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='Fiscal reservation not authorized';
 END IF;
 UPDATE fiscal.reservation_authorizations SET consumed_at=clock_timestamp(),
  approved=false
 WHERE business_id=p_business_id AND sale_id=p_sale_id AND document_type=39
  AND issuer_rut=p_issuer_rut AND consumed_at IS NULL;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='Fiscal authorization already consumed';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION fiscal.assert_reservation_authorized(text,text,text)
 FROM PUBLIC,anon,authenticated;
COMMIT;
