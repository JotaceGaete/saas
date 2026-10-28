-- ISOLATED PILOT ONLY. Never apply to production without schema review.
BEGIN;
CREATE TABLE IF NOT EXISTS fiscal.verified_line_taxes (
 business_id text NOT NULL CHECK (length(business_id) BETWEEN 1 AND 128),
 invoice_id text NOT NULL CHECK (length(invoice_id) BETWEEN 1 AND 128),
 invoice_item_id text NOT NULL CHECK (length(invoice_item_id) BETWEEN 1 AND 128),
 category text NOT NULL CHECK (category IN ('IVA_AFECTO_19','EXENTO','NO_AFECTO','REQUIERE_REVISION')),
 verified boolean NOT NULL DEFAULT false,
 verified_by text,
 verified_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(business_id,invoice_id,invoice_item_id),
 CONSTRAINT verified_tax_requires_evidence CHECK
  (NOT verified OR (verified_by IS NOT NULL AND length(verified_by)>0 AND verified_at IS NOT NULL))
);
ALTER TABLE fiscal.verified_line_taxes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal.verified_line_taxes FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE fiscal.verified_line_taxes IS
 'Private fiscal classification snapshot. Application must transactionally validate mapping against CRM invoice and items before any issuance.';
COMMIT;
