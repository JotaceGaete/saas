-- ISOLATED PILOT ONLY. No production migration or access grants.
-- Fiscal issuance is opt-in per business, never derived from subscription tier.
BEGIN;
CREATE TABLE IF NOT EXISTS fiscal.issuer_access (
 business_id text PRIMARY KEY,
 issuer_rut text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 authorized_by text NOT NULL,
 authorized_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 reason text,
 CONSTRAINT issuer_access_valid CHECK (
   length(business_id)>0 AND length(issuer_rut)>0 AND length(authorized_by)>0
 )
);
ALTER TABLE fiscal.issuer_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal.issuer_access FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION fiscal.assert_private_issuer_access(
 p_business_id text,p_issuer_rut text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM fiscal.issuer_access a
  WHERE a.business_id=p_business_id AND a.issuer_rut=p_issuer_rut
    AND a.enabled IS TRUE AND a.revoked_at IS NULL
 ) THEN
  RAISE EXCEPTION USING ERRCODE='PZ403',
   MESSAGE='Fiscal issuer access is not enabled for this business';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION fiscal.assert_private_issuer_access(text,text)
 FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE fiscal.issuer_access IS
 'Private pilot allowlist. Admin-controlled and default-deny; not related to commercial plans. Each issuer must separately meet SII eligibility.';
COMMIT;
