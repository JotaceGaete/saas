-- SEGURIDAD-WALINKA-1F — cierre de auditoría y hardening residual.
-- Cubre exclusivamente los 5 hallazgos con cambio de código confirmado
-- por la reauditoría (Fase 0): search_path, p_created_by, creator_product_media,
-- crm_payments duplicadas y grants de RPC demasiado amplios. No toca 1E
-- (checkout público) ni el hallazgo de manipulación de precios descubierto
-- ahí -- documentado en el informe como próximo ticket, no corregido acá.

-- ============================================================
-- A) SECURITY DEFINER sin search_path
-- ============================================================
--
-- Reauditoría (Fase 0): de las 92 funciones SECURITY DEFINER en public,
-- 1B ya fijó search_path en wa_admin_plan_stats, wa_admin_suspicious_businesses,
-- wa_check_order_limit, wa_check_product_limit, wa_get_plan_usage. Quedan
-- exactamente 4 sin fijar -- confirmado por consulta directa a pg_proc.proconfig,
-- no por la lista original del hallazgo. Ninguna usa SQL dinámico ni nombres
-- sin calificar de tablas propias (wa_expire_trials ya usa public.wa_businesses);
-- solo faltaba la directiva. SET search_path = public es suficiente -- ninguna
-- usa pgcrypto/pg_net.

ALTER FUNCTION public.wa_expire_trials() SET search_path = public;
ALTER FUNCTION public.wa_get_effective_plan(text, timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.wa_plan_max_orders_per_month(text) SET search_path = public;
ALTER FUNCTION public.wa_plan_max_products(text) SET search_path = public;

-- ============================================================
-- B) p_created_by en movimientos de caja
-- ============================================================
--
-- create_cash_movement_with_expense/_with_purpose validaban ownership del
-- business_id correctamente, pero insertaban created_by = p_created_by tal
-- cual lo enviara el caller -- sin validar que coincidiera con auth.uid().
-- Consumidor real: createCashMovement() en src/services/crmService.js,
-- cuyo único caller (CrmCash.jsx) nunca pasaba ese parámetro en la
-- práctica (createdBy = null), así que no era explotado por la UI actual --
-- pero la RPC en sí lo permitía si se llamaba directo. No existe ningún
-- caller service_role/backend de estas 2 RPC (auth.uid() siempre está
-- disponible y ya validado por el guard de ownership de arriba en el mismo
-- cuerpo de la función), así que created_by := auth.uid() es seguro sin
-- distinción humano/sistema. Se mantiene el parámetro p_created_by en la
-- firma (CREATE OR REPLACE no permite quitarlo sin romper la resolución de
-- overload que usa el cliente) pero se ignora su valor.

CREATE OR REPLACE FUNCTION public.create_cash_movement_with_expense(p_business_id uuid, p_session_id uuid, p_direction text, p_amount numeric, p_reason text, p_category text, p_payment_method text, p_notes text, p_created_by uuid, p_movement_date date, p_month smallint, p_year smallint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_movement      crm_cash_movements;
  v_cost_item     crm_cost_items;
  v_cost_category TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM wa_businesses
    WHERE id = p_business_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  INSERT INTO crm_cash_movements (
    business_id, session_id, direction, amount, reason,
    category, payment_method, notes, created_by,
    movement_date, is_expense
  ) VALUES (
    p_business_id, p_session_id, p_direction, p_amount, p_reason,
    p_category, p_payment_method, p_notes, auth.uid(),
    p_movement_date, TRUE
  ) RETURNING * INTO v_movement;

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

  RETURN json_build_object(
    'movement_id',  v_movement.id,
    'cost_item_id', v_cost_item.id
  );
END;
$function$;

COMMENT ON FUNCTION public.create_cash_movement_with_expense(uuid, uuid, text, numeric, text, text, text, text, uuid, date, smallint, smallint) IS
  'SEGURIDAD-WALINKA-1F (2026-09-21): created_by = auth.uid(), no el parámetro p_created_by (ignorado, se conserva en la firma solo por compatibilidad -- CREATE OR REPLACE no permite quitarlo sin romper la resolución de overload del cliente). Antes: el caller podía falsificar la autoría del movimiento.';

CREATE OR REPLACE FUNCTION public.create_cash_movement_with_purpose(p_business_id uuid, p_session_id uuid, p_direction text, p_amount numeric, p_reason text, p_category text, p_payment_method text, p_notes text, p_created_by uuid, p_movement_date date, p_month smallint, p_year smallint, p_movement_purpose text, p_related_cost_item_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_movement      crm_cash_movements;
  v_cost_item     crm_cost_items;
  v_cost_category TEXT;
  v_creates_cost  BOOLEAN;
BEGIN
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
    p_category, p_payment_method, p_notes, auth.uid(),
    p_movement_date, v_creates_cost, p_movement_purpose,
    CASE WHEN p_movement_purpose = 'cost_payment' THEN p_related_cost_item_id ELSE NULL END
  ) RETURNING * INTO v_movement;

  IF v_creates_cost THEN
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
$function$;

COMMENT ON FUNCTION public.create_cash_movement_with_purpose(uuid, uuid, text, numeric, text, text, text, text, uuid, date, smallint, smallint, text, uuid) IS
  'SEGURIDAD-WALINKA-1F (2026-09-21): created_by = auth.uid(), no el parámetro p_created_by (ignorado, se conserva en la firma solo por compatibilidad). Antes: el caller podía falsificar la autoría del movimiento.';

-- El tercer camino de creación (movimiento sin gasto: INSERT directo desde
-- el cliente, sin RPC) tenía el mismo hueco a nivel de policy -- ningún
-- WITH CHECK validaba created_by. Se cierra acá también, defensa en
-- profundidad: no afecta a las 2 RPC de arriba (SECURITY DEFINER, owner
-- postgres, RLS no se aplica al owner de la tabla).
DROP POLICY IF EXISTS "crm_cash_movements_insert" ON public.crm_cash_movements;
CREATE POLICY "crm_cash_movements_insert"
ON public.crm_cash_movements FOR INSERT TO authenticated
WITH CHECK (
  business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid())
  AND created_by = auth.uid()
);

-- ============================================================
-- C) creator_product_media: coherencia product_id <-> creator_id
-- ============================================================
--
-- creator_product_media_owner_all validaba is_creator_owner(creator_id) --
-- que el creator_id de la FILA le pertenece al caller -- pero nunca
-- comprobaba que product_id (también columna de la fila, independiente)
-- realmente perteneciera a ESE mismo creator_id. Un creator autenticado
-- podía insertar una fila con su propio creator_id pero un product_id de
-- OTRO creator. Demostrado con datos sintéticos en Postgres real (ver
-- informe). Tabla sin ningún consumidor en el repo hoy (frontend/backend/
-- Edge Functions) -- se corrige igual, por la misma razón que 1D corrigió
-- wa_businesses.bank_*: el hueco es estructural, no depende de que exista
-- un consumidor conocido. Solo se endurece WITH CHECK (validación de
-- escritura) -- USING se deja igual para que el propio creator pueda
-- seguir viendo/borrando cualquier fila suya, incluida una ya inconsistente.

DROP POLICY IF EXISTS "creator_product_media_owner_all" ON public.creator_product_media;

CREATE POLICY "creator_product_media_owner_all"
ON public.creator_product_media
FOR ALL
TO authenticated
USING (public.is_creator_owner(creator_id))
WITH CHECK (
  public.is_creator_owner(creator_id)
  AND EXISTS (
    SELECT 1
    FROM public.creator_products product
    WHERE product.id = creator_product_media.product_id
      AND product.creator_id = creator_product_media.creator_id
  )
);

-- ============================================================
-- D) crm_payments: policies duplicadas
-- ============================================================
--
-- 20260530210000_crm_payments.sql creó crm_payments_select/insert/update/delete.
-- 20260808110000_crm_payments_reconciliation.sql creó, más tarde, un
-- segundo set semánticamente IDÉNTICO (crm_payments_owner_select/insert/
-- update/delete, mismo qual/with_check exacto) más crm_payments_admin_all
-- -- probablemente una reconstrucción documentada de las policies que no
-- limpió las originales. Se eliminan las 4 más antiguas (bare-name); se
-- conservan las _owner_ + admin_all, que ya coexisten con el resto del
-- diseño documentado en esa migración. Matriz de acceso efectiva idéntica
-- antes/después -- ver informe para la comprobación en Postgres real.

DROP POLICY IF EXISTS "crm_payments_select" ON public.crm_payments;
DROP POLICY IF EXISTS "crm_payments_insert" ON public.crm_payments;
DROP POLICY IF EXISTS "crm_payments_update" ON public.crm_payments;
DROP POLICY IF EXISTS "crm_payments_delete" ON public.crm_payments;

-- ============================================================
-- E) RPCs con grant más amplio de lo que su propia migración pretendía
-- ============================================================
--
-- Patrón encontrado en 2 variantes distintas, siempre con el mismo
-- síntoma (anon con EXECUTE pese a la intención documentada de negarlo):
--
--   1. wa_expire_trials/wa_plan_max_orders_per_month/wa_plan_max_products
--      (20260313200000_trial_system.sql): GRANT explícito solo a
--      service_role, pero SIN el REVOKE ALL FROM PUBLIC previo -- el
--      GRANT a PUBLIC que Postgres/Supabase otorga por defecto al crear
--      la función nunca se retiró, así que anon/authenticated seguían
--      pudiendo ejecutarlas igual.
--
--   2. crm_take_document_number/crm_assert_invoice_owner/
--      crm_insert_invoice_items/crm_create_invoice_document/
--      crm_update_invoice_document (20260717120000), crm_create_pos_sale
--      (20260910220000 y reCREATE OR REPLACE posteriores) y
--      crm_close_cash_session (20260915180000): SÍ hacían
--      "REVOKE ALL ... FROM PUBLIC;" pero sin incluir "anon, authenticated"
--      en la misma sentencia (a diferencia del patrón "REVOKE ALL ... FROM
--      PUBLIC, anon, authenticated;" usado en el resto del repo, incluidas
--      las migraciones de 1A/1B/1C) -- REVOKE FROM PUBLIC no retira el
--      GRANT que anon/authenticated ya tenían por defecto de forma
--      separada. Confirmado con has_function_privilege() en Postgres real.
--
-- Todas SIGUEN siendo llamadas por consumidores reales via `authenticated`
-- (CrmTerminal.jsx, CrmCash.jsx, crmService.js) y tienen guard interno de
-- auth.uid()/ownership que ya rechazaba a anon en la práctica -- el riesgo
-- es de defensa en profundidad (grant demasiado amplio), no una fuga de
-- datos confirmada. Los 3 helpers internos de invoice
-- (crm_take_document_number/crm_assert_invoice_owner/crm_insert_invoice_items)
-- nunca tuvieron GRANT propio -- se cierran del todo (SECURITY DEFINER,
-- solo se llaman entre sí y desde crm_create/update_invoice_document, que
-- corren como el mismo owner).

REVOKE ALL ON FUNCTION public.wa_expire_trials() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_plan_max_orders_per_month(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_plan_max_products(text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.crm_take_document_number(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_assert_invoice_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_insert_invoice_items(uuid, jsonb) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.crm_create_invoice_document(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_create_invoice_document(uuid, jsonb, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.crm_update_invoice_document(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_update_invoice_document(uuid, jsonb, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.crm_create_pos_sale(uuid, text, jsonb, date, uuid, numeric, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_create_pos_sale(uuid, text, jsonb, date, uuid, numeric, jsonb, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.crm_close_cash_session(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_close_cash_session(uuid, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
