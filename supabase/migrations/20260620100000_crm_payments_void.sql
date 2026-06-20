-- ============================================================
-- crm_payments: columnas de anulación de movimientos de caja
--
-- Regla: nunca eliminar registros. Los movimientos anulados
-- se excluyen de totales pero permanecen visibles en auditoría.
--
-- voided_at  — timestamp de anulación (null = vigente)
-- voided_by  — usuario que anuló (FK a auth.users)
-- void_reason — motivo de anulación (texto libre, obligatorio en UI)
-- ============================================================

ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by   uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_reason text;

-- Índice parcial: solo registros anulados — útil para auditoría
CREATE INDEX IF NOT EXISTS idx_crm_payments_voided_at
  ON public.crm_payments (voided_at)
  WHERE voided_at IS NOT NULL;
