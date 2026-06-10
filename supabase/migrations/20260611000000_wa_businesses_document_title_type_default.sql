-- Corrige el DEFAULT legacy de wa_businesses.document_title_type.
--
-- En producción la columna se creó a mano con DEFAULT 'quote'. La migración
-- 20260531100000 hizo ADD COLUMN IF NOT EXISTS (no-op sobre la columna
-- existente), por lo que ese default sobrevivió; tras agregarse el CHECK
-- (IN ('presupuesto','cotizacion')), todo INSERT que no especificaba la
-- columna fallaba con check constraint violation al crear negocios nuevos.
--
-- Idempotente: SET DEFAULT es re-ejecutable; el UPDATE y SET NOT NULL cubren
-- bases donde la columna quedó nullable o con NULLs (el CHECK no rechaza NULL).

ALTER TABLE public.wa_businesses
  ALTER COLUMN document_title_type SET DEFAULT 'cotizacion';

UPDATE public.wa_businesses
SET document_title_type = 'cotizacion'
WHERE document_title_type IS NULL;

ALTER TABLE public.wa_businesses
  ALTER COLUMN document_title_type SET NOT NULL;
