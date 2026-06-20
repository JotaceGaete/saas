-- ============================================================
-- crm_cost_items: columnas de trazabilidad de origen
--
-- Permite distinguir ítems creados manualmente (source='manual')
-- de los creados automáticamente desde una salida de caja
-- (source='cash_outflow'). Los ítems cash_outflow son read-only
-- en CrmCostos para evitar doble contabilización.
-- ============================================================

ALTER TABLE public.crm_cost_items
  ADD COLUMN IF NOT EXISTS source             TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'cash_outflow')),
  ADD COLUMN IF NOT EXISTS source_movement_id UUID
    REFERENCES public.crm_cash_movements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_cost_items_source
  ON public.crm_cost_items (source)
  WHERE source <> 'manual';

-- ============================================================
-- RPC: crear movimiento de caja + gasto en un solo paso atómico
--
-- Garantiza que si el movimiento se crea, el costo también
-- se crea (o ninguno). Evita estados inconsistentes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_cash_movement_with_expense(
  p_business_id     UUID,
  p_session_id      UUID,
  p_direction       TEXT,
  p_amount          NUMERIC,
  p_reason          TEXT,
  p_category        TEXT,
  p_payment_method  TEXT,
  p_notes           TEXT,
  p_created_by      UUID,
  p_movement_date   DATE,
  p_month           SMALLINT,
  p_year            SMALLINT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement      crm_cash_movements;
  v_cost_item     crm_cost_items;
  v_cost_category TEXT;
BEGIN
  -- Verificar que el negocio pertenece al usuario autenticado
  IF NOT EXISTS (
    SELECT 1 FROM wa_businesses
    WHERE id = p_business_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  -- Insertar el movimiento de caja con is_expense=TRUE
  INSERT INTO crm_cash_movements (
    business_id, session_id, direction, amount, reason,
    category, payment_method, notes, created_by,
    movement_date, is_expense
  ) VALUES (
    p_business_id, p_session_id, p_direction, p_amount, p_reason,
    p_category, p_payment_method, p_notes, p_created_by,
    p_movement_date, TRUE
  ) RETURNING * INTO v_movement;

  -- Mapear categoría: other_expense → other (crm_cost_items tiene constraint más estricto)
  v_cost_category := CASE p_category
    WHEN 'other_expense' THEN 'other'
    ELSE p_category
  END;

  -- Insertar el ítem de costo vinculado
  INSERT INTO crm_cost_items (
    business_id, month, year,
    name, amount, type, category,
    source, source_movement_id
  ) VALUES (
    p_business_id, p_month, p_year,
    p_reason, p_amount,
    'variable', v_cost_category,
    'cash_outflow', v_movement.id
  ) RETURNING * INTO v_cost_item;

  -- Cerrar el círculo: movimiento apunta al ítem de costo
  UPDATE crm_cash_movements
  SET cost_item_id = v_cost_item.id
  WHERE id = v_movement.id;

  RETURN json_build_object(
    'movement_id',  v_movement.id,
    'cost_item_id', v_cost_item.id
  );
END;
$$;
