-- Migration: add document_title_type to wa_businesses
-- Determines how quote/budget documents are labeled per business.
-- Values: 'presupuesto' (AR/UY/VE) | 'cotizacion' (default, rest of LATAM)

ALTER TABLE wa_businesses
  ADD COLUMN IF NOT EXISTS document_title_type TEXT NOT NULL DEFAULT 'cotizacion';

-- Constraint: only two valid values for now (proforma/estimado reserved for future)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wa_businesses_document_title_type_check'
  ) THEN
    ALTER TABLE wa_businesses
      ADD CONSTRAINT wa_businesses_document_title_type_check
      CHECK (document_title_type IN ('presupuesto', 'cotizacion'));
  END IF;
END $$;

-- Backfill: AR, UY, VE → 'presupuesto'; all others stay at default 'cotizacion'
-- Priority: country_code (ISO) > country text name
UPDATE wa_businesses
SET document_title_type = 'presupuesto'
WHERE
  -- Explicit ISO country code
  UPPER(TRIM(COALESCE(country_code, ''))) IN ('AR', 'UY', 'VE')
  OR (
    -- No ISO code → try text country field
    (country_code IS NULL OR TRIM(country_code) = '')
    AND UPPER(TRIM(COALESCE(country, ''))) IN (
      'AR', 'UY', 'VE',
      'ARGENTINA', 'URUGUAY', 'VENEZUELA'
    )
  );
