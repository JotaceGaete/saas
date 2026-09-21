-- ============================================================
-- SEGURIDAD-WALINKA-2 — integridad server-side de precios y totales
-- del checkout público.
--
-- Hallazgo (auditado y reproducido en Postgres real con datos
-- sintéticos, ver informe local): wa_create_order_with_items()
-- (creada en 20260921140000, GRANT a anon/authenticated) insertaba
-- wa_orders.total_amount/subtotal y wa_order_items.product_price/
-- subtotal EXACTAMENTE como los enviara el cliente, sin comparar
-- contra wa_products.price. Un llamador anónimo podía:
--   1. comprar cualquier producto real al precio que quisiera
--      (product_price/subtotal/p_total_amount arbitrarios);
--   2. referenciar en un pedido de un negocio un producto de OTRO
--      negocio (sin validar product.business_id = p_business_id);
--   3. "comprar" un producto inactivo (is_active=false);
--   4. enviar quantity negativa/cero para fabricar un subtotal
--      negativo;
--   5. además, la policy "wa_orders_anon_insert" (WITH CHECK true,
--      desde el primer día del catálogo) permitía además un INSERT
--      directo en wa_orders totalmente por fuera de la RPC, con
--      total_amount arbitrario -- confirmado sin ningún consumidor
--      real (grep de todo src/: nunca hay un .insert() directo sobre
--      wa_orders/wa_order_items, siempre a través de una RPC). Cerrar
--      solo la RPC y dejar este INSERT directo abierto habría dejado
--      un bypass trivial alrededor del propio fix de este ticket, así
--      que se cierra en la misma migración (mismo criterio que ya se
--      usó con "wa_order_items_anon_insert" en 20260921140000).
--
-- Ya existe en este mismo repo el diseño de referencia correcto para
-- el checkout de Mercado Pago del comercio (wa_create_merchant_checkout_order
-- + create-merchant-mp-checkout, migración 20260910130000): precio
-- SIEMPRE releído de wa_products.price server-side, nunca del
-- carrito. Este fix aplica el mismo principio directamente DENTRO de
-- wa_create_order_with_items(), porque a diferencia del checkout de
-- Mercado Pago, el checkout "gratis" (WhatsApp) no tiene una Edge
-- Function intermedia que valide antes de llegar a la RPC -- el
-- browser llama a wa_create_order_with_items() directamente, así que
-- la propia RPC debe ser la única fuente de verdad.
--
-- Diseño elegido (ver informe local para el detalle de las fases 2-8):
--   - Firma de la función SIN CAMBIOS (mismo orden/tipos de
--     parámetros) para no romper createOrder() en el frontend.
--   - p_total_amount, p_subtotal y, dentro de cada elemento de
--     p_items, product_price/subtotal/product_name/currency se
--     IGNORAN por completo: son parámetros legacy que el frontend
--     sigue enviando (no se le exige un cambio de contrato en este
--     ticket) pero cuyo valor nunca se usa para nada.
--   - Por cada item: se exige product_id + quantity entero positivo;
--     se busca el producto en wa_products filtrando
--     business_id = p_business_id (bloquea cross-business), is_active
--     y NOT is_sold_out (bloquea productos inactivos/agotados), y si
--     stock_actual no es NULL se exige quantity <= stock_actual
--     (mismo criterio que validateAndPriceLine() en
--     create-merchant-mp-checkout/lib.ts). El precio y el nombre
--     persistidos SIEMPRE salen de esa fila de wa_products, nunca del
--     payload del cliente.
--   - subtotal de línea = wa_products.price × quantity; total/subtotal
--     del pedido = suma de las líneas ya validadas. Sin descuentos,
--     recargos ni delivery: esas columnas no existen hoy en wa_orders
--     (igual que ya documenta computeOrderTotals() en
--     create-merchant-mp-checkout/lib.ts) -- no se inventan.
--   - currency: se ignora p_currency y se usa wa_businesses.currency
--     (el negocio, no el cliente, es quien define en qué moneda
--     vende) -- currency estaba en la lista explícita de campos
--     monetario-adyacentes a revisar en este ticket y no tenía ningún
--     resguardo server-side.
--   - selected_options: se sigue persistiendo tal cual la envía el
--     cliente (JSONB descriptivo). Confirmado en la auditoría de este
--     ticket que hoy NO existe ningún sistema de variantes/opciones
--     con recargo de precio real (wa_products.has_options/
--     options_description son solo texto libre; add_ons/combo_config
--     se usan únicamente para mostrar un "total estimado" en el
--     modal del catálogo y NUNCA se agregan al carrito real -- ver
--     informe). No se diseña un sistema de precios por opción que
--     todavía no existe.
--   - Snapshot de precio: se usa el precio VIGENTE de wa_products en
--     el momento de crear el pedido (sin price-lock -- no existe hoy
--     ningún mecanismo de reserva de precio, y no se inventa uno). El
--     valor quedado en wa_order_items.product_price es ese snapshot,
--     igual que antes.
--   - Se valida wa_businesses.is_active para bloquear pedidos contra
--     un negocio desactivado/suspendido llamando la RPC directamente
--     (la UI ya solo llega a un negocio activo vía getBusinessBySlug,
--     pero la RPC es alcanzable sin pasar por la UI).
--   - Carrito vacío (p_items nulo/no-array/longitud 0) se rechaza:
--     antes se permitía silenciosamente y dejaba un pedido sin items
--     con el total que quisiera el cliente.
--   - Todo-o-nada: la primera línea inválida aborta la función entera
--     (una excepción sin capturar revierte toda la transacción de la
--     llamada RPC, incluido el INSERT en wa_orders ya hecho) -- nunca
--     un pedido parcial.
--
-- Mercado Pago: fuera de alcance de cambios -- ya está correcto (ver
-- informe sección J). El checkout "gratis" (WhatsApp, esta RPC) no
-- tiene ningún paso de cobro automático: payment_status queda
-- 'pendiente' hasta que el dueño del negocio lo marca manualmente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.wa_create_order_with_items(
  p_business_id      UUID,
  p_customer_name    TEXT,
  p_customer_phone   TEXT,
  p_customer_email   TEXT,
  p_service_type     TEXT,
  p_table_reference  TEXT,
  p_delivery_address TEXT,
  p_total_amount     NUMERIC, -- LEGACY: ignorado, se recalcula 100% server-side
  p_subtotal         NUMERIC, -- LEGACY: ignorado, ídem
  p_currency         TEXT,    -- LEGACY: ignorado, se usa wa_businesses.currency
  p_notes            TEXT,
  p_items            JSONB    -- por item: solo product_id/quantity/selected_options son de intención; product_price/subtotal/product_name/currency se ignoran
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_order_id        UUID;
  v_item            JSONB;
  v_product_id      UUID;
  v_quantity        INTEGER;
  v_product         RECORD;
  v_business        RECORD;
  v_line_subtotal   NUMERIC(10,2);
  v_order_subtotal  NUMERIC(10,2) := 0;
BEGIN
  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, is_active, currency
    INTO v_business
    FROM public.wa_businesses
    WHERE id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BUSINESS_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_business.is_active THEN
    RAISE EXCEPTION 'BUSINESS_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.wa_orders (
    business_id, customer_name, customer_phone, customer_email,
    service_type, table_reference, delivery_address,
    total_amount, subtotal, currency,
    order_status, payment_status, notes
  ) VALUES (
    p_business_id, p_customer_name, p_customer_phone, p_customer_email,
    p_service_type, p_table_reference, p_delivery_address,
    0, 0, COALESCE(v_business.currency, 'USD'),
    'pedido', 'pendiente', p_notes
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_quantity   := NULLIF(v_item->>'quantity', '')::INTEGER;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_ITEM' USING ERRCODE = 'P0001';
    END IF;
    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = 'P0001';
    END IF;

    SELECT id, name, price, is_active, is_sold_out, stock_actual
      INTO v_product
      FROM public.wa_products
      WHERE id = v_product_id
        AND business_id = p_business_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF NOT v_product.is_active OR v_product.is_sold_out THEN
      RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE' USING ERRCODE = 'P0001';
    END IF;
    IF v_product.stock_actual IS NOT NULL AND v_quantity > v_product.stock_actual THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
    END IF;

    v_line_subtotal  := v_product.price * v_quantity;
    v_order_subtotal := v_order_subtotal + v_line_subtotal;

    INSERT INTO public.wa_order_items (
      order_id, product_id, product_name, product_price, quantity, subtotal, selected_options
    ) VALUES (
      v_order_id,
      v_product.id,
      v_product.name,
      v_product.price,
      v_quantity,
      v_line_subtotal,
      COALESCE(v_item->'selected_options', '[]'::jsonb)
    );
  END LOOP;

  UPDATE public.wa_orders
  SET total_amount = v_order_subtotal,
      subtotal = v_order_subtotal
  WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;

-- Firma/grants sin cambios respecto a 20260921140000 -- solo cambia el body.
REVOKE ALL ON FUNCTION public.wa_create_order_with_items(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.wa_create_order_with_items(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB
) TO anon, authenticated;

-- Cierra el bypass directo descrito en el punto 5 del header: sin
-- ningún consumidor real (ver informe), y wa_create_order_with_items()
-- (SECURITY DEFINER) sigue pudiendo insertar en wa_orders igual que
-- antes porque una función SECURITY DEFINER no pasa por RLS.
DROP POLICY IF EXISTS "wa_orders_anon_insert" ON public.wa_orders;
