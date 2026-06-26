-- Refactor de estados de crm_quotes:
-- Antes: borrador | enviado | aceptado | rechazado
-- Después: borrador | vigente | convertido | rechazado
--
-- "enviado" era un estado ficticio (sin flujo real de envío).
-- "aceptado" se reemplaza por "convertido" — consecuencia directa de la conversión.
-- "vigente" = presupuesto emitido y activo.
-- Vencido NO es un estado persistente: se calcula en el frontend desde valid_until.

-- ── 1. Migrar datos existentes ANTES de cambiar la constraint ─────────────────

-- "enviado" → "vigente" (mismo significado operativo, nombre más claro)
UPDATE public.crm_quotes
SET status = 'vigente'
WHERE status = 'enviado';

-- "aceptado" con invoice vinculada → "convertido" (estado correcto)
UPDATE public.crm_quotes
SET status = 'convertido'
WHERE status = 'aceptado' AND converted_to_invoice_id IS NOT NULL;

-- "aceptado" sin invoice (marcado manualmente, estado ficticio) → "vigente"
UPDATE public.crm_quotes
SET status = 'vigente'
WHERE status = 'aceptado' AND converted_to_invoice_id IS NULL;

-- ── 2. Actualizar CHECK constraint ────────────────────────────────────────────

ALTER TABLE public.crm_quotes
  DROP CONSTRAINT IF EXISTS crm_quotes_status_check;

ALTER TABLE public.crm_quotes
  ADD CONSTRAINT crm_quotes_status_check
  CHECK (status IN ('borrador', 'vigente', 'convertido', 'rechazado'));

-- ── 3. Columnas de auditoría para rechazo ────────────────────────────────────
-- Solo se rellenan cuando status = 'rechazado'. Inmutables post-rechazo.

ALTER TABLE public.crm_quotes
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.crm_quotes
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id);

ALTER TABLE public.crm_quotes
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

COMMENT ON COLUMN public.crm_quotes.rejection_reason
  IS 'Motivo del rechazo. Obligatorio cuando status = rechazado.';
COMMENT ON COLUMN public.crm_quotes.rejected_by
  IS 'Usuario que registró el rechazo.';
COMMENT ON COLUMN public.crm_quotes.rejected_at
  IS 'Timestamp del rechazo. Inmutable post-rechazo.';
