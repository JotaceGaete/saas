-- Documenta/versiona en el repo un fix aplicado manualmente en producción:
-- crm_quotes_status_check estaba desalineado con los 4 valores de status
-- que el frontend y el resto del schema (crm_quotes.status TEXT NOT NULL
-- DEFAULT 'borrador') siempre asumieron -- eso hacía que transiciones
-- válidas (p. ej. 'enviado') fueran rechazadas por el constraint en
-- producción, y como handleStatus en CrmQuotes.jsx no revisaba el error
-- (ver fix aparte de "Marcar enviado"), el fallo pasaba desapercibido en
-- la UI.
--
-- Esta migración es idempotente respecto del estado actual: DROP
-- CONSTRAINT IF EXISTS + ADD CONSTRAINT deja el mismo resultado sin
-- importar si crm_quotes_status_check ya existía, no existía, o tenía una
-- definición distinta. No modifica filas existentes, no toca RLS.

ALTER TABLE public.crm_quotes
  DROP CONSTRAINT IF EXISTS crm_quotes_status_check;

ALTER TABLE public.crm_quotes
  ADD CONSTRAINT crm_quotes_status_check
  CHECK (status IN ('borrador','enviado','aceptado','rechazado'));
