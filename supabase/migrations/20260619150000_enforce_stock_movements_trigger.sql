-- ============================================================
-- Stock movements: trigger AFTER INSERT que actualiza
-- wa_products.stock_actual de forma atómica.
--
-- Antes: registerStockMovement() en JS hacía:
--   1. INSERT en crm_stock_movements
--   2. SELECT stock_actual  (lectura separada)
--   3. UPDATE wa_products   (escritura separada)
-- → Race condition entre lectura y escritura + bypass vía API.
--
-- Ahora: el trigger aplica el delta en la misma transacción
-- que el INSERT, de forma atómica e imposible de bypasear.
-- El bloque JS de UPDATE fue eliminado de crmService.js.
--
-- Lógica de delta:
--   entrada → stock_actual + quantity  (mín 0)
--   salida  → stock_actual - quantity  (mín 0)
--   ajuste  → quantity                 (valor absoluto, mín 0)
-- ============================================================

CREATE OR REPLACE FUNCTION public.crm_apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_actual INTEGER;
  v_new_stock    INTEGER;
BEGIN
  -- Validar product_id
  IF NEW.product_id IS NULL THEN
    RAISE EXCEPTION 'crm_stock_movements: product_id no puede ser NULL'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Leer stock actual y verificar que el producto pertenece al mismo negocio
  SELECT stock_actual
    INTO v_stock_actual
    FROM public.wa_products
   WHERE id          = NEW.product_id
     AND business_id = NEW.business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no encontrado o no pertenece al negocio %',
      NEW.product_id, NEW.business_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Calcular nuevo stock según tipo de movimiento
  IF NEW.type = 'ajuste' THEN
    v_new_stock := GREATEST(0, NEW.quantity);
  ELSIF NEW.type = 'entrada' THEN
    v_new_stock := GREATEST(0, COALESCE(v_stock_actual, 0) + NEW.quantity);
  ELSIF NEW.type = 'salida' THEN
    v_new_stock := GREATEST(0, COALESCE(v_stock_actual, 0) - NEW.quantity);
  ELSE
    -- Tipo no reconocido: no tocar stock, dejar que el CHECK constraint falle
    RETURN NEW;
  END IF;

  -- Aplicar
  UPDATE public.wa_products
     SET stock_actual = v_new_stock
   WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_crm_apply_stock_movement ON public.crm_stock_movements;

CREATE TRIGGER trg_crm_apply_stock_movement
  AFTER INSERT
  ON public.crm_stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_apply_stock_movement();
