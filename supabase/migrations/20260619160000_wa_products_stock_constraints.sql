-- ============================================================
-- wa_products: constraints y comentarios para columnas de stock
--
-- NULL es semántico: significa "sin control de stock activado".
-- Toda la UI (CrmStock.jsx) trata NULL como estado válido y
-- lo muestra como "Sin control". NO se hace backfill ni DEFAULT 0.
--
-- Esta migración solo agrega:
--   1. CHECK que impide valores negativos (NULL sigue permitido)
--   2. COMMENT que documenta la semántica de NULL
-- ============================================================

ALTER TABLE public.wa_products
  ADD CONSTRAINT chk_wa_products_stock_actual_non_negative
    CHECK (stock_actual IS NULL OR stock_actual >= 0),
  ADD CONSTRAINT chk_wa_products_stock_minimo_non_negative
    CHECK (stock_minimo IS NULL OR stock_minimo >= 0);

COMMENT ON COLUMN public.wa_products.stock_actual IS
  'Unidades en stock. NULL = sin control de stock activado para este producto (estado inicial). 0 = control activo, actualmente agotado.';

COMMENT ON COLUMN public.wa_products.stock_minimo IS
  'Umbral de alerta de stock bajo. NULL = sin mínimo configurado (no genera alertas). El trigger crm_apply_stock_movement() respeta COALESCE(stock_actual, 0) al aplicar movimientos.';
