-- CAJA-COSTOS-1 — separar "movimiento de dinero" de "nuevo costo económico".
--
-- Auditoría previa (AUDITORÍA CAJA vs COSTOS) confirmó: hoy
-- create_cash_movement_with_expense() crea un crm_cost_item variable
-- SIEMPRE que is_expense=TRUE, sin distinguir "esto es un gasto nuevo" de
-- "esto es el pago de un costo que ya está contemplado como fijo" (p. ej.
-- un adelanto de sueldo sobre un sueldo fijo ya registrado). Eso duplica
-- el costo mensual.
--
-- Esta migración NO toca create_cash_movement_with_expense() ni ninguna
-- fila existente -- solo agrega columnas nuevas (NULL por defecto) y un
-- RPC nuevo para el flujo con semántica explícita. Las llamadas legacy
-- (isExpense=true/false vía create_cash_movement_with_expense) siguen
-- funcionando exactamente igual.

-- ============================================================
-- 1. movement_purpose -- clasifica la salida, no el movimiento en sí.
--
-- NULL = movimiento histórico/legacy: no se reinterpreta, no se hace
-- backfill. El Termómetro y /crm/costos deben seguir tratando esas filas
-- exactamente como antes de esta migración.
--
-- 'transfer' queda reservado en el CHECK para un ticket futuro
-- (transferencias entre cajas/cuentas) -- NO se implementa su lógica acá.
-- ============================================================

ALTER TABLE public.crm_cash_movements
  ADD COLUMN IF NOT EXISTS movement_purpose TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_cash_movements_movement_purpose_check'
      AND conrelid = 'public.crm_cash_movements'::regclass
  ) THEN
    ALTER TABLE public.crm_cash_movements
      ADD CONSTRAINT crm_cash_movements_movement_purpose_check
      CHECK (
        movement_purpose IS NULL OR movement_purpose IN (
          'new_expense',
          'cost_payment',
          'inventory_purchase',
          'owner_withdrawal',
          'other_non_operating',
          'transfer' -- reservado, no implementado en CAJA-COSTOS-1
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.crm_cash_movements.movement_purpose IS
  'CAJA-COSTOS-1: propósito económico de la salida (distinto de category). NULL = movimiento legacy, sin reinterpretar. new_expense es el único valor que genera un crm_cost_item.';

-- ============================================================
-- 2. related_cost_item_id -- vínculo OPCIONAL a un crm_cost_item YA
-- EXISTENTE (p. ej. "esta salida es el pago del costo fijo Sueldo Juan").
--
-- Deliberadamente distinto de cost_item_id: cost_item_id significa "el
-- crm_cost_item que ESTE movimiento generó" (semántica ya establecida por
-- 20260620210000_crm_cost_items_source.sql); reutilizarlo para "costo
-- preexistente que este movimiento paga" rompería esa semántica para los
-- movimientos históricos. Son conceptos distintos, columnas distintas.
--
-- Solo tiene efecto para movement_purpose='cost_payment' (impuesto por el
-- RPC, no por este CHECK -- ver create_cash_movement_with_purpose). No
-- marca el costo como "pagado" ni implementa cuentas por pagar: es
-- puramente informativo, para explicar qué representa la salida y evitar
-- que se genere un segundo costo.
-- ============================================================

ALTER TABLE public.crm_cash_movements
  ADD COLUMN IF NOT EXISTS related_cost_item_id UUID NULL
    REFERENCES public.crm_cost_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.crm_cash_movements.related_cost_item_id IS
  'CAJA-COSTOS-1: crm_cost_item PREEXISTENTE que esta salida paga (opcional, solo para movement_purpose=cost_payment). No confundir con cost_item_id (el costo que este movimiento generó).';

CREATE INDEX IF NOT EXISTS idx_crm_cash_movements_related_cost_item_id
  ON public.crm_cash_movements (related_cost_item_id)
  WHERE related_cost_item_id IS NOT NULL;

-- No se modifica RLS: son columnas nuevas en la misma fila de
-- crm_cash_movements, ya protegida por las políticas owner-based
-- existentes (business_id IN (SELECT id FROM wa_businesses WHERE
-- user_id = auth.uid())). No hay necesidad real demostrable de una
-- política nueva.

-- ============================================================
-- 3. RPC: create_cash_movement_with_purpose
--
-- Reemplaza, para el flujo NUEVO, al par (isExpense boolean +
-- create_cash_movement_with_expense). No se extiende ese RPC existente
-- ni se cambia su comportamiento -- se deja intacto para las llamadas
-- legacy. Este RPC nuevo es atómico: si movement_purpose='new_expense',
-- crea movimiento + crm_cost_item juntos o ninguno; para cualquier otro
-- propósito soportado, crea ÚNICAMENTE el movimiento.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_cash_movement_with_purpose(
  p_business_id           UUID,
  p_session_id            UUID,
  p_direction             TEXT,
  p_amount                NUMERIC,
  p_reason                TEXT,
  p_category              TEXT,
  p_payment_method        TEXT,
  p_notes                 TEXT,
  p_created_by            UUID,
  p_movement_date         DATE,
  p_month                 SMALLINT,
  p_year                  SMALLINT,
  p_movement_purpose      TEXT,
  p_related_cost_item_id  UUID DEFAULT NULL
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
  v_creates_cost  BOOLEAN;
BEGIN
  -- Verificar que el negocio pertenece al usuario autenticado
  IF NOT EXISTS (
    SELECT 1 FROM wa_businesses
    WHERE id = p_business_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  IF p_movement_purpose NOT IN (
    'new_expense', 'cost_payment', 'inventory_purchase',
    'owner_withdrawal', 'other_non_operating'
  ) THEN
    RAISE EXCEPTION 'movement_purpose inválido para este flujo: %', p_movement_purpose;
  END IF;

  -- El costo relacionado (si se pasa) debe pertenecer al mismo negocio.
  IF p_related_cost_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM crm_cost_items
    WHERE id = p_related_cost_item_id
      AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'El costo relacionado no pertenece a este negocio';
  END IF;

  v_creates_cost := (p_movement_purpose = 'new_expense');

  INSERT INTO crm_cash_movements (
    business_id, session_id, direction, amount, reason,
    category, payment_method, notes, created_by,
    movement_date, is_expense, movement_purpose, related_cost_item_id
  ) VALUES (
    p_business_id, p_session_id, p_direction, p_amount, p_reason,
    p_category, p_payment_method, p_notes, p_created_by,
    p_movement_date, v_creates_cost, p_movement_purpose,
    CASE WHEN p_movement_purpose = 'cost_payment' THEN p_related_cost_item_id ELSE NULL END
  ) RETURNING * INTO v_movement;

  IF v_creates_cost THEN
    -- Mismo mapeo que create_cash_movement_with_expense (crm_cost_items
    -- tiene un CHECK de categoría más estricto que crm_cash_movements).
    v_cost_category := CASE p_category
      WHEN 'other_expense' THEN 'other'
      ELSE p_category
    END;

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

    UPDATE crm_cash_movements
    SET cost_item_id = v_cost_item.id
    WHERE id = v_movement.id;
  END IF;

  RETURN json_build_object(
    'movement_id',  v_movement.id,
    'cost_item_id', v_cost_item.id
  );
END;
$$;
