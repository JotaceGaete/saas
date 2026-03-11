-- ============================================================
-- Reasignar pedidos huérfanos al negocio activo del usuario
-- "Huérfano" = orden cuyo business_id no existe en wa_businesses
-- Solo se ejecuta si hay exactamente UN negocio en wa_businesses
-- ============================================================

DO $$
DECLARE
  v_target_business_id UUID;
  v_business_count INT;
  v_updated INT;
BEGIN
  -- Contar cuántos negocios hay
  SELECT COUNT(*) INTO v_business_count FROM public.wa_businesses;

  IF v_business_count = 0 THEN
    RAISE NOTICE 'No hay negocios en wa_businesses. No se hace nada.';
    RETURN;
  END IF;

  IF v_business_count > 1 THEN
    -- Más de un negocio: no reasignar automáticamente para no mezclar datos
    -- Muestra los business_id huérfanos para que el admin los revise
    RAISE NOTICE 'Hay % negocios. Se listan los pedidos huérfanos:', v_business_count;
    FOR v_target_business_id IN
      SELECT DISTINCT o.business_id
      FROM public.wa_orders o
      WHERE NOT EXISTS (SELECT 1 FROM public.wa_businesses b WHERE b.id = o.business_id)
    LOOP
      RAISE NOTICE '  -> business_id huérfano: %', v_target_business_id;
    END LOOP;
    RETURN;
  END IF;

  -- Solo un negocio: reasignar todos los pedidos huérfanos a él
  SELECT id INTO v_target_business_id FROM public.wa_businesses LIMIT 1;

  UPDATE public.wa_orders
  SET business_id = v_target_business_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.wa_businesses b WHERE b.id = wa_orders.business_id
  );

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RAISE NOTICE 'Reasignados % pedido(s) al negocio %', v_updated, v_target_business_id;
END $$;

NOTIFY pgrst, 'reload schema';
