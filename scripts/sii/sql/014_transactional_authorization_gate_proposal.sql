-- ISOLATED PILOT ONLY. Optional hardening for the reservation function.
-- This proposal adds a DB-enforced, deny-by-default gate. No grant is made to
-- client roles, and no trusted sale snapshots are inserted by this script.
-- A future server-side transaction must lock and validate the actual CRM sale,
-- received payments, and verified tax mappings before creating an approval.
BEGIN;
CREATE TABLE IF NOT EXISTS fiscal.reservation_authorizations (
 business_id text NOT NULL,
 sale_id text NOT NULL,
 issuer_rut text NOT NULL,
 document_type smallint NOT NULL DEFAULT 39 CHECK(document_type=39),
 approved boolean NOT NULL DEFAULT false,
 approved_at timestamptz,
 sale_digest text CHECK(sale_digest ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(business_id,sale_id,document_type),
 CHECK(NOT approved OR (approved_at IS NOT NULL AND sale_digest IS NOT NULL))
);
ALTER TABLE fiscal.reservation_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal.reservation_authorizations FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION fiscal.assert_reservation_authorized(
 p_business_id text,p_sale_id text,p_issuer_rut text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 -- Explicit row lock serializes revocation and reservation. This alone is
 -- insufficient: caller must lock source sale/payment/tax rows in same tx.
 PERFORM 1 FROM fiscal.reservation_authorizations
 WHERE business_id=p_business_id AND sale_id=p_sale_id
 AND issuer_rut=p_issuer_rut AND document_type=39
 AND approved IS TRUE AND sale_digest IS NOT NULL
 FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION USING ERRCODE='PZ403', MESSAGE='Fiscal reservation not authorized';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION fiscal.assert_reservation_authorized(text,text,text)
 FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION fiscal.assert_reservation_authorized(text,text,text) IS
 'Deny-by-default proposal; NOT sufficient alone to authorize CAF issuance. Requires transactional source-row verification and trusted approval lifecycle.';
COMMIT;
