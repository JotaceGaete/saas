-- ============================================================
-- crm_quotes: impedir doble conversión a factura a nivel DB
--
-- Problema: convertQuoteToInvoice() en JS valida que
-- converted_to_invoice_id sea null, pero un INSERT directo
-- a la API puede asignar el mismo invoice_id a dos cotizaciones,
-- o convertir la misma cotización dos veces.
--
-- Solución: índice UNIQUE parcial WHERE converted_to_invoice_id
-- IS NOT NULL. Solo aplica a cotizaciones ya convertidas;
-- las no convertidas (NULL) no tienen restricción.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_quotes_converted_to_invoice
  ON public.crm_quotes (converted_to_invoice_id)
  WHERE converted_to_invoice_id IS NOT NULL;
