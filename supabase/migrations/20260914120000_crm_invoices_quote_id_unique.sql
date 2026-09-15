-- QUOTE-TO-SALE-1 — impedir que un mismo presupuesto genere dos Notas de
-- Venta (crm_invoices).
--
-- Contexto: hasta ahora la única protección contra doble conversión era
-- crm_quotes_no_double_conversion.sql, que evita que DOS presupuestos
-- apunten a la MISMA nota de venta (índice único parcial sobre
-- crm_quotes.converted_to_invoice_id). Eso no evitaba el caso inverso: el
-- MISMO presupuesto generando dos crm_invoices distintas (p. ej. dos
-- pestañas abiertas, o doble click antes de que el primer guardado
-- termine) -- crm_invoices.quote_id no tenía ninguna restricción de
-- unicidad.
--
-- Solución: mismo patrón que crm_invoices_order_id_uq
-- (20260717120000_crm_invoice_atomic_documents.sql) -- índice único
-- parcial sobre quote_id, solo aplica a filas con quote_id IS NOT NULL
-- (una nota de venta creada manualmente sin origen en un presupuesto no
-- se ve afectada). No se modifica ninguna fila existente.

CREATE UNIQUE INDEX IF NOT EXISTS crm_invoices_quote_id_uq
  ON public.crm_invoices (quote_id)
  WHERE quote_id IS NOT NULL;
