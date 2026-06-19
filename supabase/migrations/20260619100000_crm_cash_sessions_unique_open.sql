-- ============================================================
-- Hardening: evitar sesión doble de caja abierta por negocio
--
-- Problema: openCashSession() hacía SELECT + INSERT en dos pasos,
-- dejando una ventana de race condition donde dos pestañas podían
-- crear simultáneamente dos filas con status='open' para el mismo
-- business_id.
--
-- Solución: índice único parcial WHERE status='open'.
-- PostgreSQL rechaza el segundo INSERT con error 23505 (unique_violation),
-- lo cual el servicio convierte en mensaje de usuario claro.
--
-- El índice solo aplica a filas 'open', preservando el historial
-- de sesiones 'closed' sin ninguna restricción.
-- ============================================================

-- 1. Cleanup: si ya existen sesiones duplicadas abiertas para un
--    mismo negocio (staging o producción con datos previos),
--    cerrar las más antiguas y dejar abierta solo la más reciente.
--    Sin este paso el CREATE INDEX falla con duplicate key.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY business_id
      ORDER BY opened_at DESC
    ) AS rn
  FROM public.crm_cash_sessions
  WHERE status = 'open'
)
UPDATE public.crm_cash_sessions
SET
  status    = 'closed',
  closed_at = now()
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- 2. Índice único parcial: máximo una sesión 'open' por business_id.
CREATE UNIQUE INDEX IF NOT EXISTS
  uq_crm_cash_sessions_one_open_per_business
ON public.crm_cash_sessions (business_id)
WHERE (status = 'open');
