-- ============================================================
-- TPV-STOCK-UX-1 — STOCK_INSUFFICIENT estructurado.
--
-- Problema real en producción: el cajero podía agregar al carrito una
-- cantidad mayor al stock disponible y solo se enteraba al presionar
-- "Confirmar venta", con un mensaje genérico ("No hay stock suficiente
-- para completar la venta.") que no dice CUÁL producto -- con muchos
-- artículos en el carrito, no hay forma práctica de saber cuál corregir.
--
-- Esta migración NO toca la autoridad del servidor: crm_create_pos_sale
-- sigue siendo quien valida stock bajo FOR UPDATE y aborta ANTES de
-- insertar nada -- eso no cambia. Lo único que cambia es CUÁNTA
-- información lleva el mensaje de la excepción cuando aborta:
--
--   antes:   STOCK_INSUFFICIENT
--   ahora:   STOCK_INSUFFICIENT:<product_id>:<requested_quantity>:<available_quantity>
--
-- Decisión: el mensaje NO incluye el nombre del producto. product_id ya
-- viaja en el error (dato interno, no sensible -- el propio cliente lo
-- envió en p_items un instante antes); requested/available son enteros
-- sin ningún dato de negocio adicional. El frontend resuelve el NOMBRE a
-- mostrar buscando ese product_id en el carrito que él mismo acaba de
-- enviar (CrmTerminal ya tiene el nombre en memoria -- no hace falta que
-- el servidor lo devuelva ni una consulta adicional). Esto evita
-- ensanchar la superficie de la RPC con datos de catálogo que no son
-- estrictamente necesarios para resolver el error.
--
-- Backward-compatible: todo el código existente que hace
-- `mensaje.includes('STOCK_INSUFFICIENT')` (crmService.js, y el propio
-- test de la migración original) sigue funcionando sin cambios, porque
-- el nuevo mensaje sigue empezando con ese mismo literal -- solo se le
-- agregó información al final, nunca se le sacó nada.
--
-- CREATE OR REPLACE FUNCTION con la MISMA firma exacta -- reemplaza el
-- cuerpo in place, conserva GRANT/REVOKE existentes. Ningún otro
-- comportamiento de crm_create_pos_sale cambia: mismos locks, misma
-- idempotencia, misma validación de pagos/cuenta corriente/caja, mismo
-- orden de inserts. No se toca crm_apply_stock_movement ni el trigger de
-- stock (fuera de alcance de TPV-STOCK-UX-1, sección 14 de la tarea).
-- ============================================================

CREATE OR REPLACE FUNCTION public.crm_create_pos_sale(
  p_business_id      UUID,
  p_idempotency_key  TEXT,
  p_items            JSONB,
  p_issue_date       DATE,
  p_customer_id      UUID DEFAULT NULL,
  p_discount         NUMERIC DEFAULT 0,
  p_payments         JSONB DEFAULT '[]'::jsonb,
  p_notes            TEXT DEFAULT NULL,
  p_currency         TEXT DEFAULT 'CLP'
)
RETURNS SETOF public.crm_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id            UUID := auth.uid();
  v_existing_invoice   public.crm_invoices;
  v_invoice            public.crm_invoices;
  v_number             INTEGER;
  v_number_label       TEXT;
  v_line               JSONB;
  v_agg                RECORD;
  v_product_id         UUID;
  v_unit_price         NUMERIC;
  v_quantity           INTEGER;
  v_name               TEXT;
  v_note               TEXT;
  v_item_subtotal      NUMERIC;
  v_subtotal           NUMERIC := 0;
  v_discount_amount    NUMERIC;
  v_total              NUMERIC;
  v_sort_order         INTEGER := 0;
  v_stock_actual       INTEGER;
  v_payment            JSONB;
  v_method             TEXT;
  v_amount             NUMERIC;
  v_non_cash_total     NUMERIC := 0;
  v_remaining_for_cash NUMERIC;
  v_applied_amount     NUMERIC;
  v_paid_total         NUMERIC := 0;
  v_invoice_status     TEXT;
  v_paid_at            TIMESTAMPTZ;
  v_open_session_id    UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  IF p_business_id IS NULL OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
     OR length(p_idempotency_key) > 200
     OR p_issue_date IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE = 'P0001';
  END IF;

  -- Ownership: nunca se confía en p_business_id del cliente sin verificar
  -- que pertenece al usuario autenticado -- SECURITY DEFINER bypasea RLS,
  -- así que este chequeo es la única barrera real.
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses WHERE id = p_business_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Business not accessible' USING ERRCODE = '42501';
  END IF;

  -- TPV-CORE-1B — serializar por (business_id, pos_idempotency_key) ANTES
  -- de mirar si ya existe una venta con esa key. Ver la migración
  -- original (20260910220000_crm_pos_atomic_sale.sql) para la
  -- explicación completa de por qué hace falta este lock -- no cambia
  -- acá, se reproduce igual porque CREATE OR REPLACE exige el cuerpo
  -- completo de la función.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':' || p_idempotency_key, 0));

  -- Idempotencia: si esta key ya generó una venta para este negocio,
  -- devolverla tal cual -- CERO inserts nuevos en ninguna tabla.
  SELECT * INTO v_existing_invoice
    FROM public.crm_invoices
   WHERE business_id = p_business_id AND pos_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN NEXT v_existing_invoice;
    RETURN;
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.wa_customers WHERE id = p_customer_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'INVALID_ITEMS' USING ERRCODE = '23514';
  END IF;

  -- ── Validar estructura de cada línea + calcular subtotal ────────────
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_name       := trim(COALESCE(v_line->>'name', ''));
    v_unit_price := COALESCE((v_line->>'unit_price')::NUMERIC, -1);
    v_quantity   := COALESCE((v_line->>'quantity')::INTEGER, 0);
    IF v_name = '' OR v_unit_price < 0 OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_ITEMS' USING ERRCODE = '23514';
    END IF;
    v_subtotal := v_subtotal + round(v_unit_price * v_quantity, 2);
  END LOOP;

  v_discount_amount := LEAST(GREATEST(COALESCE(p_discount, 0), 0), v_subtotal);
  v_total := round(v_subtotal - v_discount_amount, 2);

  -- ── Validar y bloquear stock ANTES de crear nada ────────────────────
  -- Agrupado por product_id: si el mismo producto aparece en más de una
  -- línea, se valida contra la cantidad TOTAL pedida, no línea por línea
  -- (evita que dos líneas de 1 unidad cada una pasen individualmente
  -- contra un stock de 1). Nunca confía en que el cliente ya fusionó
  -- líneas duplicadas (CrmTerminal sí lo hace, pero la RPC no depende de
  -- ese comportamiento del cliente).
  FOR v_agg IN
    SELECT NULLIF(line->>'product_id', '')::UUID AS product_id,
           SUM(COALESCE((line->>'quantity')::INTEGER, 0)) AS total_qty
    FROM jsonb_array_elements(p_items) AS line
    WHERE NULLIF(line->>'product_id', '') IS NOT NULL
    GROUP BY 1
  LOOP
    -- Línea manual/freeform (product_id NULL): nunca toca inventario --
    -- ya excluida por el WHERE de arriba, no entra a este loop.
    SELECT stock_actual INTO v_stock_actual
      FROM public.wa_products
     WHERE id = v_agg.product_id AND business_id = p_business_id
     FOR UPDATE;

    IF NOT FOUND THEN
      -- Mismo código tanto para "no existe" como para "pertenece a otro
      -- negocio" -- no se distingue a propósito, para no filtrar
      -- información de existencia entre tenants.
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    -- stock_actual IS NULL => "sin control de stock activado": nunca se
    -- valida ni se genera movimiento para este producto (ver sección G
    -- de la auditoría -- insertar un movimiento acá activaría el control
    -- de stock involuntariamente).
    --
    -- TPV-STOCK-UX-1: el mensaje ahora lleva product_id, cantidad
    -- solicitada y stock disponible, para que el frontend pueda señalar
    -- exactamente qué producto causó el rechazo -- ver el comentario al
    -- inicio del archivo. product_id nunca es NULL en este punto (el
    -- WHERE del cursor ya lo garantiza), así que siempre es un UUID
    -- válido para el formato "STOCK_INSUFFICIENT:<uuid>:<int>:<int>".
    IF v_stock_actual IS NOT NULL AND v_stock_actual < v_agg.total_qty THEN
      RAISE EXCEPTION 'STOCK_INSUFFICIENT:%:%:%', v_agg.product_id, v_agg.total_qty, v_stock_actual
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- ── Validar pagos y calcular paid_total (misma lógica que hoy en JS,
  --    ahora como autoridad server-side) ───────────────────────────────
  IF jsonb_typeof(COALESCE(p_payments, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE = '23514';
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb))
  LOOP
    v_method := lower(trim(COALESCE(v_payment->>'method', '')));
    v_amount := COALESCE((v_payment->>'amount')::NUMERIC, 0);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    IF v_method NOT IN ('cash', 'card', 'bank_transfer', 'check', 'other') THEN
      RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE = '23514';
    END IF;
    IF v_method <> 'cash' THEN
      v_non_cash_total := v_non_cash_total + v_amount;
    END IF;
  END LOOP;

  -- Solo el efectivo puede generar vuelto -- un no-efectivo nunca puede
  -- superar el total (mismo mensaje/regla que hoy: "Solo el efectivo
  -- puede generar vuelto").
  IF v_non_cash_total > v_total THEN
    RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE = '23514';
  END IF;

  -- Aplica efectivo hasta cubrir el remanente, en el orden en que llegó
  -- el array (jsonb_array_elements preserva el orden de inserción).
  v_remaining_for_cash := GREATEST(v_total - v_non_cash_total, 0);
  v_paid_total := v_non_cash_total;
  FOR v_payment IN SELECT value FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb))
  LOOP
    v_method := lower(trim(COALESCE(v_payment->>'method', '')));
    v_amount := COALESCE((v_payment->>'amount')::NUMERIC, 0);
    IF v_amount <= 0 OR v_method <> 'cash' THEN CONTINUE; END IF;
    v_applied_amount := LEAST(v_amount, v_remaining_for_cash);
    v_remaining_for_cash := v_remaining_for_cash - v_applied_amount;
    v_paid_total := v_paid_total + v_applied_amount;
  END LOOP;
  v_paid_total := round(v_paid_total, 2);

  v_invoice_status := CASE
    WHEN v_paid_total >= v_total THEN 'pagada'
    WHEN v_paid_total > 0 THEN 'parcial'
    ELSE 'pendiente'
  END;
  v_paid_at := CASE WHEN v_invoice_status = 'pagada' THEN now() ELSE NULL END;

  -- El saldo pendiente pasa a cuenta corriente y exige cliente registrado
  -- -- misma regla que hoy (CREDIT_NO_CUSTOMER).
  IF v_paid_total < v_total AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'CREDIT_NO_CUSTOMER' USING ERRCODE = 'P0001';
  END IF;

  -- Caja abierta requerida solo si hay algún pago real aplicado -- una
  -- venta 100% a cuenta corriente (paid_total = 0) no toca caja, igual
  -- que hoy.
  IF v_paid_total > 0 THEN
    SELECT id INTO v_open_session_id
      FROM public.crm_cash_sessions
     WHERE business_id = p_business_id AND status = 'open'
     ORDER BY opened_at DESC
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NO_OPEN_CASH' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── Todo validado: crear la venta ───────────────────────────────────
  v_number := public.crm_take_document_number(p_business_id, 'invoice');
  v_number_label := 'NV-' || lpad(v_number::text, 4, '0');

  INSERT INTO public.crm_invoices (
    business_id, customer_id, invoice_number, issue_date, status,
    subtotal, discount_amount, total, notes, paid_at, source,
    pos_idempotency_key
  ) VALUES (
    p_business_id, p_customer_id, v_number, p_issue_date, v_invoice_status,
    round(v_subtotal, 2), v_discount_amount, v_total, p_notes, v_paid_at, 'pos',
    p_idempotency_key
  )
  RETURNING * INTO v_invoice;

  v_sort_order := 0;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_line->>'product_id', '')::UUID;
    v_unit_price := (v_line->>'unit_price')::NUMERIC;
    v_quantity   := (v_line->>'quantity')::INTEGER;
    v_name       := trim(v_line->>'name');
    v_note       := NULLIF(v_line->>'note', '');
    v_item_subtotal := round(v_unit_price * v_quantity, 2);

    INSERT INTO public.crm_invoice_items (
      invoice_id, product_id, name, description, unit_price, quantity,
      discount_pct, subtotal, sort_order
    ) VALUES (
      v_invoice.id, v_product_id, v_name, v_note, v_unit_price, v_quantity,
      0, v_item_subtotal, v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  END LOOP;

  -- Pagos: mismo criterio de aplicación de efectivo que el cálculo de
  -- paid_total de arriba, ahora insertando cada fila real.
  v_remaining_for_cash := GREATEST(v_total - v_non_cash_total, 0);
  FOR v_payment IN SELECT value FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb))
  LOOP
    v_method := lower(trim(COALESCE(v_payment->>'method', '')));
    v_amount := COALESCE((v_payment->>'amount')::NUMERIC, 0);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    IF v_method = 'cash' THEN
      v_applied_amount := LEAST(v_amount, v_remaining_for_cash);
      v_remaining_for_cash := v_remaining_for_cash - v_applied_amount;
    ELSE
      v_applied_amount := v_amount;
    END IF;
    IF v_applied_amount <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.crm_payments (
      business_id, invoice_id, customer_id, amount, currency, payment_method,
      payment_status, payment_date, cash_session_id, reference, notes, created_by
    ) VALUES (
      p_business_id, v_invoice.id, p_customer_id, round(v_applied_amount, 2), p_currency,
      v_method, 'received', p_issue_date, v_open_session_id,
      CASE WHEN v_invoice_status = 'parcial' THEN 'Abono TPV ' || v_number_label ELSE 'TPV ' || v_number_label END,
      p_notes, v_user_id
    );
  END LOOP;

  -- Stock: una fila por producto distinto (cantidad total agregada de
  -- ese producto en la venta), solo para productos con control de stock
  -- activado. El trigger crm_apply_stock_movement aplica el delta --
  -- nunca un UPDATE directo acá.
  FOR v_agg IN
    SELECT NULLIF(line->>'product_id', '')::UUID AS product_id,
           SUM(COALESCE((line->>'quantity')::INTEGER, 0)) AS total_qty
    FROM jsonb_array_elements(p_items) AS line
    WHERE NULLIF(line->>'product_id', '') IS NOT NULL
    GROUP BY 1
  LOOP
    INSERT INTO public.crm_stock_movements (business_id, product_id, type, quantity, notes, created_by)
    SELECT p_business_id, v_agg.product_id, 'salida', v_agg.total_qty,
           'Venta TPV -- ' || v_number_label || ' (invoice ' || v_invoice.id || ')', v_user_id
      FROM public.wa_products p
     WHERE p.id = v_agg.product_id
       AND p.business_id = p_business_id
       AND p.stock_actual IS NOT NULL;
  END LOOP;

  SELECT * INTO v_invoice FROM public.crm_invoices WHERE id = v_invoice.id;
  RETURN NEXT v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_create_pos_sale(UUID, TEXT, JSONB, DATE, UUID, NUMERIC, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_create_pos_sale(UUID, TEXT, JSONB, DATE, UUID, NUMERIC, JSONB, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.crm_create_pos_sale(UUID, TEXT, JSONB, DATE, UUID, NUMERIC, JSONB, TEXT, TEXT) IS
  'TPV-CORE-1: crea una venta de CrmTerminal (crm_invoices + crm_invoice_items '
  '+ crm_payments + crm_stock_movements) en una única transacción atómica. '
  'Idempotente por (business_id, pos_idempotency_key) -- un retry con la '
  'misma key nunca duplica nada, solo devuelve la venta ya creada. Valida '
  'stock bajo lock (FOR UPDATE sobre wa_products) y aborta ANTES de insertar '
  'nada si no alcanza, con '
  'STOCK_INSUFFICIENT:<product_id>:<requested_quantity>:<available_quantity> '
  '(TPV-STOCK-UX-1) -- nunca vende de más silenciosamente. No descuenta '
  'stock de líneas manuales (product_id NULL) ni de productos sin control '
  'de stock activado (stock_actual IS NULL). Requiere caja abierta solo si '
  'hay algún pago real aplicado (paid_total > 0) -- una venta 100% a cuenta '
  'corriente no toca caja. No maneja anulación/restock -- eso no existe '
  'todavía para ninguna venta de crm_invoices en este repo.';

NOTIFY pgrst, 'reload schema';
