-- ISOLATED PILOT ONLY. Apply after 018.
-- Authorization must match a trusted, locked source snapshot. This table is
-- a temporary test boundary, NOT a replacement for live CRM row locks.
BEGIN;
CREATE TABLE IF NOT EXISTS fiscal.trusted_sale_snapshots (
 business_id text NOT NULL,
 sale_id text NOT NULL,
 issuer_rut text NOT NULL,
 sale_digest text NOT NULL CHECK(sale_digest ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(business_id,sale_id)
);
ALTER TABLE fiscal.trusted_sale_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal.trusted_sale_snapshots FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION fiscal.assert_reservation_authorized(
 p_business_id text,p_sale_id text,p_issuer_rut text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_digest text; v_current text;
BEGIN
 SELECT sale_digest INTO v_digest FROM fiscal.reservation_authorizations
 WHERE business_id=p_business_id AND sale_id=p_sale_id
  AND issuer_rut=p_issuer_rut AND document_type=39
  AND approved IS TRUE AND sale_digest IS NOT NULL
  AND expires_at IS NOT NULL AND expires_at>clock_timestamp()
  AND consumed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='Fiscal reservation not authorized';
 END IF;
 SELECT sale_digest INTO v_current FROM fiscal.trusted_sale_snapshots
 WHERE business_id=p_business_id AND sale_id=p_sale_id
  AND issuer_rut=p_issuer_rut FOR UPDATE;
 IF v_current IS NULL OR v_current<>v_digest THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='Fiscal sale snapshot changed or missing';
 END IF;
 UPDATE fiscal.reservation_authorizations SET consumed_at=clock_timestamp(),
  approved=false WHERE business_id=p_business_id AND sale_id=p_sale_id
  AND issuer_rut=p_issuer_rut AND document_type=39 AND consumed_at IS NULL;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',MESSAGE='Fiscal authorization already consumed';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION fiscal.assert_reservation_authorized(text,text,text)
 FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE fiscal.trusted_sale_snapshots IS
 'Pilot fixture only. A digest of an independently stored snapshot does NOT prove live CRM data are unchanged; production must replace this with same-transaction CRM row locking and digest calculation.';
COMMIT;
