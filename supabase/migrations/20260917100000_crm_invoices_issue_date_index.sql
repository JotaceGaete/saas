-- REPORTES-PERIODO-1 — índice faltante para consultas por rango de fecha.
--
-- Auditoría (ver PR de REPORTES-PERIODO-1): crm_invoices tiene índices en
-- business_id, customer_id, status y created_at (20260530100000_crm_module.sql)
-- pero NUNCA tuvo un índice que cubra issue_date -- ni siquiera para el caso
-- de un solo día (getDailySummary ya hace `.eq('issue_date', date)` sin
-- índice de soporte, mitigado hasta ahora solo por el volumen bajo por
-- negocio). getPeriodSummary (REPORTES-PERIODO-1) agrega, para el mismo
-- patrón, `.gte('issue_date', from).lte('issue_date', to)` sobre rangos de
-- 1-90 días -- sin índice, cada consulta de período es un seq scan completo
-- de crm_invoices para el negocio. Se agrega el índice compuesto real que
-- ambos patrones necesitan (business_id primero: toda consulta ya filtra por
-- negocio; issue_date segundo: es el predicado de rango).
--
-- No se agrega ningún otro índice "por si acaso" -- payment_date
-- (idx_crm_payments_business_date), movement_date
-- (idx_crm_cash_movements_business_date) y crm_cash_sessions.date
-- (idx_crm_cash_sessions_business_date) ya están cubiertos desde antes.
-- crm_stock_movements solo tiene business_id/product_id/created_at por
-- separado (sin compuesto) -- se deja fuera de esta migración porque
-- getDailySummary ya usa exactamente el mismo patrón de consulta hoy (un
-- rango de created_at de 1 día) sin que se haya demostrado un problema real
-- de rendimiento; no se justifica un índice especulativo para este ticket.

CREATE INDEX IF NOT EXISTS idx_crm_invoices_business_issue_date
  ON public.crm_invoices (business_id, issue_date);
