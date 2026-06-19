-- ============================================================
-- crm_payments: columnas faltantes
--
-- La tabla fue creada con un schema incompleto. El código ya
-- escribe y lee: currency, payment_status, payment_date,
-- reference y created_by. Esta migración sincroniza el schema
-- con el código de forma idempotente.
--
-- Orden obligatorio:
--   1. Manejo seguro de reference_number → reference
--   2. ADD COLUMN IF NOT EXISTS para las columnas faltantes
--   3. Índices complementarios
-- ============================================================


-- ── 1. Manejo de reference_number ────────────────────────────────────────────

DO $$
DECLARE
  has_reference_number boolean;
  has_reference        boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'crm_payments'
      AND column_name  = 'reference_number'
  ) INTO has_reference_number;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'crm_payments'
      AND column_name  = 'reference'
  ) INTO has_reference;

  IF has_reference_number AND NOT has_reference THEN
    -- Caso A: solo existe reference_number → renombrar limpiamente
    ALTER TABLE public.crm_payments
      RENAME COLUMN reference_number TO reference;

  ELSIF has_reference_number AND has_reference THEN
    -- Caso B: existen ambas → copiar datos donde reference sea null,
    -- dejar reference_number intacta por ahora
    UPDATE public.crm_payments
    SET reference = reference_number
    WHERE reference IS NULL
      AND reference_number IS NOT NULL;
  END IF;
  -- Si solo existe reference (o ninguna): no hacer nada aquí,
  -- ADD COLUMN IF NOT EXISTS del paso 2 crea reference si falta.
END $$;


-- ── 2. Columnas faltantes (todas idempotentes) ────────────────────────────────

ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS currency       TEXT        NOT NULL DEFAULT 'CLP',
  ADD COLUMN IF NOT EXISTS payment_status TEXT        NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS payment_date   DATE,
  ADD COLUMN IF NOT EXISTS reference      TEXT,
  ADD COLUMN IF NOT EXISTS created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL;


-- ── 3. Índices complementarios ────────────────────────────────────────────────

-- Consultas de caja filtran por (business_id, payment_status)
CREATE INDEX IF NOT EXISTS idx_crm_payments_business_status
  ON public.crm_payments (business_id, payment_status);

-- Consultas de caja filtran por (business_id, payment_date)
CREATE INDEX IF NOT EXISTS idx_crm_payments_business_date
  ON public.crm_payments (business_id, payment_date);
