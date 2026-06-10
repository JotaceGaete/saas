-- Migration: add document_title_type to wa_businesses
-- Determines how quote/budget documents are labeled per business.
-- Values: 'presupuesto' (AR/UY/VE) | 'cotizacion' (default, rest of LATAM)

ALTER TABLE wa_businesses
  ADD COLUMN IF NOT EXISTS document_title_type TEXT NOT NULL DEFAULT 'cotizacion';

-- Normalizar valores legacy ANTES del CHECK. Instalaciones donde la columna se
-- creó a mano traen 'quote' (default en inglés de un borrador anterior); la app
-- siempre trató cualquier valor != 'presupuesto' como cotización, así que
-- 'quote' → 'cotizacion' no cambia comportamiento visible. Defensivo: cubre
-- cualquier valor fuera del dominio (y NULL), no solo 'quote'. El backfill por
-- país de más abajo re-deriva 'presupuesto' (AR/UY/VE) sobre estas filas.
UPDATE wa_businesses
SET document_title_type = 'cotizacion'
WHERE document_title_type IS NULL
   OR document_title_type NOT IN ('presupuesto', 'cotizacion');

-- Constraint: only two valid values for now (proforma/estimado reserved for future)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wa_businesses_document_title_type_check'
      AND conrelid = 'public.wa_businesses'::regclass
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
