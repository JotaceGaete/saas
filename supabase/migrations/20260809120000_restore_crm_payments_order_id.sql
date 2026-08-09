-- ============================================================
-- Restaura crm_payments.order_id — corrección separada, deliberadamente
-- NO incluida en 20260809110000_crm_cash_documents_reconciliation.sql,
-- por instrucción explícita: esto no es "documentar drift confirmado",
-- es una decisión de producto (conservar/eliminar/migrar) ya tomada
-- para este caso puntual tras el análisis de uso de código.
--
-- Contexto (análisis de código, no de dump -- producción NO tiene esta
-- columna hoy, así que no hay nada que "reproducir" desde introspección
-- acá, a diferencia de 20260809110000):
--   src/services/crmService.js:1010-1038, registerOrderPayment() --
--   llamada desde src/pages/orders/components/OrderDetailDrawer.jsx en
--   un flujo de UI activo ("registrar pago" de un pedido de catálogo) --
--   inserta order_id incondicionalmente en cada INSERT a crm_payments.
--   Sin esta columna, ese INSERT falla contra el esquema real de
--   producción. Esta migración restaura únicamente la columna para que
--   ese flujo vuelva a funcionar -- NO se toca crmService.js ni
--   OrderDetailDrawer.jsx, el objetivo es que el código EXISTENTE vuelva
--   a ser compatible con el esquema, no cambiar la app.
--
-- Definición histórica original (única mención de order_id en todo el
-- historial local de crm_payments, verificado por grep exhaustivo sobre
-- todas las migraciones de crm_payments):
--   20260530210000_crm_payments.sql línea 8:
--     order_id UUID REFERENCES public.wa_orders(id) ON DELETE SET NULL
--   Se reproduce EXACTAMENTE ese tipo y esa semántica ON DELETE.
--
-- Índice: NO se crea ninguno. Verificado explícitamente antes de
-- decidir esto:
--   1. Historia: 20260530210000_crm_payments.sql crea índices para
--      business_id, invoice_id, customer_id, created_at -- pero NUNCA
--      para order_id. Ninguna migración posterior de crm_payments
--      (missing_columns, void, phase1_stabilization) lo agregó tampoco
--      (grep exhaustivo sobre las 4, cero resultados). order_id nunca
--      tuvo índice en ningún punto del historial.
--   2. Uso actual: registerOrderPayment() solo hace INSERT de order_id,
--      nunca lo usa como filtro de lectura. crmPaymentsService.js
--      filtra crm_payments por invoice_id/id/payment_status, nunca por
--      order_id. Ningún flujo actual necesita un índice sobre esta
--      columna para resolver una consulta.
-- Ambas condiciones de la instrucción ("existía históricamente" o "es
-- necesario para el flujo actual") dan negativo -- no se crea índice.
--
-- FUERA DE ALCANCE, a propósito: quote_id y void_cash_session_id (ya
-- cubiertos en 20260809110000, no se tocan acá); las 7 huérfanas
-- 20260621000001..07 (no se reconstruyen); migration repair / db push /
-- db pull / producción (nada de eso se ejecuta desde este archivo).
--
-- IDEMPOTENCIA: ADD COLUMN IF NOT EXISTS -- no-op en una segunda
-- corrida o si esta columna existiera ya.
-- ============================================================

ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS order_id UUID
  REFERENCES public.wa_orders(id)
  ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
