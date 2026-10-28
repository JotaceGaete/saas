-- ISOLATED PILOT ONLY. Do not apply to production.
-- Trusted registry for SII 39 issuers, administered only by privileged backend.
BEGIN;
CREATE TABLE IF NOT EXISTS fiscal.verified_issuers (
  business_id text PRIMARY KEY CHECK (length(business_id) BETWEEN 1 AND 128),
  issuer_rut text NOT NULL CHECK (issuer_rut ~ '^[0-9]{1,8}-[0-9K]$'),
  document_type smallint NOT NULL DEFAULT 39 CHECK (document_type = 39),
  issuer_verified boolean NOT NULL DEFAULT false,
  fiscal_enabled boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issuer_verification_consistent CHECK (
    (issuer_verified = false AND fiscal_enabled = false)
    OR (issuer_verified = true AND verified_at IS NOT NULL AND
        verified_by IS NOT NULL AND length(verified_by) > 0)
  )
);
ALTER TABLE fiscal.verified_issuers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal.verified_issuers FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE fiscal.verified_issuers IS
  'Pilot-only trusted issuer registry; no direct client grants. Verification must be backed by SII evidence, not self-attestation.';
COMMIT;
