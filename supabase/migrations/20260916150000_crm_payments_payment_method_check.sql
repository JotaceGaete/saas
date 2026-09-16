-- ============================================================
-- HOTFIX TPV-PAYMENT-METHODS-2 — crm_payments_payment_method_check
--
-- Smoke test real en producción, DESPUÉS de aplicar PR #70
-- (20260916100000_crm_pos_payment_methods.sql): una venta TPV con
-- debit_card ahora SÍ pasa la validación de crm_create_pos_sale, pero el
-- INSERT en crm_payments falla igual:
--
--   SQLSTATE 23514
--   new row for relation "crm_payments" violates check constraint
--   "crm_payments_payment_method_check"
--
-- CAUSA RAÍZ CONFIRMADA (dump read-only de producción): existe en
-- producción un CHECK constraint real sobre crm_payments.payment_method
-- que NUNCA fue creado por ninguna migración de este repo:
--
--   CONSTRAINT "crm_payments_payment_method_check"
--   CHECK (payment_method = ANY (ARRAY['cash','bank_transfer','card','check','other']))
--
-- Confirmado por grep exhaustivo: `grep -rn "payment_method_check"
-- supabase/migrations/*.sql` no devuelve NINGÚN resultado en todo el
-- historial de este repo, antes de este archivo. Tampoco existen en
-- ningún archivo versionado "crm_payments_amount_positive" ni
-- "crm_payments_payment_status_check" (las otras dos CHECK que también
-- reportó el dump de producción) -- las tres constraints de crm_payments
-- existen en producción sin ningún rastro en control de versiones.
--
-- SCHEMA DRIFT -- origen no determinable con la evidencia disponible.
-- La migración más reciente que hizo una reconciliación de drift
-- específicamente sobre crm_payments contra un dump real de producción
-- (20260809110000_crm_cash_documents_reconciliation.sql, 2026-08-09)
-- reprodujo otros cambios confirmados de esta misma tabla en esa fecha
-- (el ensanchado de crm_payments.amount de NUMERIC(10,2) a NUMERIC(12,2))
-- pero NO menciona ni reproduce ninguna de estas tres CHECK constraints.
-- Esto sugiere que se agregaron a producción DESPUÉS de esa fecha, por
-- una vía no versionada (consistente con el patrón ya documentado varias
-- veces en este repo de cambios de esquema aplicados a mano vía el SQL
-- Editor de Supabase y nunca capturados en una migración -- ver también
-- los 7 huérfanos 20260621000001..20260621000007 y crm_purchase_invoices
-- en esa misma migración de reconciliación) -- pero esto es una hipótesis
-- razonable, no un hecho confirmado: no hay evidencia en git que pruebe
-- CUÁNDO ni CÓMO se creó exactamente. No se inventa una causa más
-- específica que la que la evidencia permite.
--
-- Como consecuencia directa de este drift, además, la migración
-- 20260915180000_crm_cash_session_reconciliations.sql (PR #69, ya
-- aplicada) documenta en un comentario: "crm_payments.payment_method es
-- TEXT libre, sin CHECK en la BD" -- afirmación FALSA para producción
-- (aunque cierta para una base reconstruida solo desde las migraciones
-- versionadas, que es justamente por lo que los 13 escenarios de
-- verify_crm_pos_payment_methods.sql pasaron en local sin detectar este
-- problema). No se edita esa migración histórica ya aplicada -- se deja
-- constancia acá, y en el PR.
--
-- ALCANCE DE ESTE HOTFIX -- exclusivamente:
--   1. DROP CONSTRAINT IF EXISTS crm_payments_payment_method_check
--      (seguro en ambos estados: en producción la elimina para
--      reemplazarla; en una base local reconstruida donde no existe,
--      es un no-op).
--   2. ADD CONSTRAINT crm_payments_payment_method_check con
--      EXACTAMENTE los 8 valores ya validados por crm_create_pos_sale
--      (PR #70) y por crm_close_cash_session (PR #69): cash, card,
--      debit_card, credit_card, bank_transfer, mercado_pago, check,
--      other. 'card' se conserva (pagos históricos reales). 'credit'
--      (cuenta corriente en este esquema, semántica DISTINTA de
--      credit_card = tarjeta de crédito) NO se agrega -- ningún flujo
--      de la app inserta jamás 'credit' en crm_payments.payment_method
--      (el saldo pendiente de una venta a crédito vive en
--      crm_invoices.status, nunca como una fila de pago con ese medio).
--
-- Es seguro contra datos ya existentes: el vocabulario ANTERIOR de la
-- constraint de producción (cash/bank_transfer/card/check/other) es un
-- SUBCONJUNTO estricto del vocabulario nuevo -- cualquier fila que ya
-- pasaba el CHECK viejo pasa automáticamente el nuevo, sin excepción.
-- No hay UPDATE ni reclasificación de ninguna fila existente: un pago
-- histórico con payment_method='card' sigue siendo 'card' para siempre.
--
-- NO se toca: crm_payments_amount_positive, crm_payments_payment_status_check,
-- ninguna foreign key, ningún índice único, RLS, GRANT, ni
-- crm_create_pos_sale (ya audita y persiste exactamente estos 8 valores
-- desde PR #70 -- no se detectó ninguna inconsistencia real que
-- justifique tocarla de nuevo acá).
-- ============================================================

ALTER TABLE public.crm_payments
  DROP CONSTRAINT IF EXISTS crm_payments_payment_method_check;

ALTER TABLE public.crm_payments
  ADD CONSTRAINT crm_payments_payment_method_check
  CHECK (payment_method = ANY (ARRAY[
    'cash'::text,
    'card'::text,
    'debit_card'::text,
    'credit_card'::text,
    'bank_transfer'::text,
    'mercado_pago'::text,
    'check'::text,
    'other'::text
  ]));

COMMENT ON CONSTRAINT crm_payments_payment_method_check ON public.crm_payments IS
  'TPV-PAYMENT-METHODS-2: vocabulario alineado con crm_create_pos_sale (PR #70) y '
  'crm_close_cash_session (PR #69). card se conserva por compatibilidad histórica. '
  'credit (cuenta corriente) deliberadamente excluido -- no es tarjeta de crédito '
  '(eso es credit_card) y ningún flujo de la app lo inserta como payment_method.';

NOTIFY pgrst, 'reload schema';
