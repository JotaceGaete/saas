-- ============================================================
-- TPV-CORE-1 — venta POS atómica + stock transaccional.
--
-- Basado en la auditoría TPV-CORE-1 (preimplementación). Reemplaza el
-- flujo actual de CrmTerminal (createPosInvoice: 3-4 .insert() client-side
-- secuenciales, sin transacción, sin lock de stock) por una única RPC
-- SECURITY DEFINER que crea invoice + items + payments + stock movements
-- atómicamente.
--
-- NO se toca: wa_orders, wa_order_items, merchant-mp-webhook,
-- wa_process_merchant_payment_event, crm_create_invoice_document,
-- crm_update_invoice_document, CrmInvoiceEditor/createCrmInvoice. Esos
-- flujos siguen exactamente igual que hoy.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. crm_invoices.pos_idempotency_key
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Auditoría del modelo exacto antes de decidir el índice: el único
-- precedente de "clave que impide duplicar una fila de crm_invoices" es
-- crm_invoices_order_id_uq (20260717120000_crm_invoice_atomic_documents.sql),
-- que es de UNA sola columna (order_id) sin business_id -- porque order_id
-- ya es la PK de wa_orders, globalmente única por sí sola.
--
-- pos_idempotency_key es distinto: la genera el CLIENTE (CrmTerminal, un
-- UUID por intento de venta), no una PK de otra tabla. Aunque en la
-- práctica crypto.randomUUID() nunca colisiona entre negocios, no hay
-- ninguna garantía del lado del servidor de que el cliente use ese
-- generador -- así que, a diferencia de order_id, acá SÍ conviene incluir
-- business_id en el índice: dos negocios distintos jamás deben poder
-- pisarse una venta por una coincidencia (o un bug) en cómo el cliente
-- arma la clave. Costo cero, defensa adicional consistente con el patrón
-- de "siempre acotar a business_id explícitamente" ya usado en cada RLS
-- de este módulo.
ALTER TABLE public.crm_invoices
  ADD COLUMN IF NOT EXISTS pos_idempotency_key TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_invoices_pos_idempotency_key_uq
  ON public.crm_invoices (business_id, pos_idempotency_key)
  WHERE pos_idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.crm_invoices.pos_idempotency_key IS
  'TPV-CORE-1: clave de idempotencia generada por el cliente (CrmTerminal) '
  'una vez por intento de "Completar venta". NULL para toda factura que no '
  'venga de crm_create_pos_sale (CRM manual, puente wa_orders, etc.) -- el '
  'índice único parcial (business_id, pos_idempotency_key) solo aplica '
  'cuando no es NULL, así que estas filas nunca se ven afectadas.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. crm_apply_stock_movement() — corregir la carrera de concurrencia
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Bug real preexistente (no introducido acá, pero agravado por TPV-CORE-1):
-- el SELECT de stock_actual no usaba FOR UPDATE. Dos transacciones
-- concurrentes insertando en crm_stock_movements para el MISMO producto
-- pueden leer el mismo stock_actual antes de que ninguna haga su UPDATE,
-- calculando cada una su propio delta sobre un valor ya obsoleto --
-- sobreventa silenciosa (el GREATEST(0,...) la enmascara, nunca lanza error).
--
-- Fix: agregar FOR UPDATE al SELECT. La segunda transacción concurrente
-- queda bloqueada hasta que la primera confirme, y al desbloquearse relee
-- el valor YA actualizado antes de calcular su propio delta -- el cálculo
-- queda serializado y correcto.
--
-- Esto por sí solo NO evita la sobreventa a nivel de negocio (el trigger
-- sigue sin rechazar nada, solo aplica el delta correctamente y satura en
-- 0) -- ver crm_create_pos_sale más abajo, que valida stock disponible
-- bajo lock y aborta con STOCK_INSUFFICIENT ANTES de llegar a insertar el
-- movimiento. El trigger corregido es la red de seguridad para CUALQUIER
-- insertador (incluido wa_process_merchant_payment_event, que no
-- pre-valida ni pre-bloquea nada) -- se beneficia del fix sin que se le
-- cambie una sola línea.
--
-- Semántica conservada 100%: misma firma, mismos tipos de movimiento
-- (entrada/salida/ajuste), mismo piso en 0, mismas excepciones de
-- product_id NULL / producto no encontrado.
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
  IF NEW.product_id IS NULL THEN
    RAISE EXCEPTION 'crm_stock_movements: product_id no puede ser NULL'
      USING ERRCODE = 'check_violation';
  END IF;

  -- TPV-CORE-1: FOR UPDATE -- bloquea la fila hasta el commit/rollback de
  -- esta transacción, serializando cualquier otro insertador concurrente
  -- de crm_stock_movements sobre el mismo producto.
  SELECT stock_actual
    INTO v_stock_actual
    FROM public.wa_products
   WHERE id          = NEW.product_id
     AND business_id = NEW.business_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no encontrado o no pertenece al negocio %',
      NEW.product_id, NEW.business_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.type = 'ajuste' THEN
    v_new_stock := GREATEST(0, NEW.quantity);
  ELSIF NEW.type = 'entrada' THEN
    v_new_stock := GREATEST(0, COALESCE(v_stock_actual, 0) + NEW.quantity);
  ELSIF NEW.type = 'salida' THEN
    v_new_stock := GREATEST(0, COALESCE(v_stock_actual, 0) - NEW.quantity);
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.wa_products
     SET stock_actual = v_new_stock
   WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. crm_create_pos_sale — RPC atómica de venta POS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- p_items: JSONB array de {product_id?: uuid|null, name: text,
--          unit_price: numeric, quantity: integer, note?: text}.
-- p_payments: JSONB array de {method: cash|card|bank_transfer|check|other,
--             amount: numeric} -- montos ya "aplicados" (mismo criterio
--             que appliedPayments en CrmTerminal.jsx: el vuelto de
--             efectivo ya fue restado antes de llegar acá; la RPC igual
--             re-valida/re-aplica el mismo tope server-side, nunca confía
--             en que el cliente lo hizo bien).
-- p_issue_date: fecha LOCAL del comercio (getLocalDateString() en JS) --
--             se recibe como parámetro porque Postgres no conoce la zona
--             horaria del negocio; usar CURRENT_DATE (UTC) rompería el
--             agrupamiento por "día de caja" ya usado por
--             crm_cash_sessions.date / crm_payments.payment_date.
--
-- Idempotencia: pos_idempotency_key identifica UN intento de venta. Un
-- retry con la misma key -- por red, doble click, o dos llamadas
-- concurrentes -- nunca crea una segunda invoice/items/payments/stock:
-- la llamada serializa por (business_id, pos_idempotency_key) vía
-- pg_advisory_xact_lock ANTES de mirar si ya existe una fila (ver más
-- abajo) -- la primera en tomar el lock corre la venta completa; la
-- segunda queda bloqueada hasta que la primera confirme, y al
-- desbloquearse encuentra la fila ya creada y la devuelve tal cual, sin
-- volver a validar/descontar stock ni crear pagos/ítems/movimientos.
-- Ninguna otra tabla queda huérfana.
--
-- TPV-CORE-1B -- decisión sobre unique_violation (23505): esta función
-- NO atrapa un eventual 23505 de crm_invoices_pos_idempotency_key_uq
-- para reintentar la búsqueda. Con el advisory lock serializando el
-- acceso ANTES del SELECT de idempotencia y ANTES de cualquier INSERT,
-- dos transacciones con la MISMA business_id+key nunca deberían llegar a
-- competir por ese INSERT -- la segunda ve la fila ya creada en el
-- SELECT y retorna antes de intentar insertar nada. Que este 23505
-- llegue a dispararse en la práctica significaría que el lock no está
-- sirviendo como se espera (un bug real, no una condición esperada) --
-- atraparlo y "recuperarse" buscando la invoice igual habría escondido
-- ese bug en vez de dejarlo fallar ruidosamente. El índice único queda
-- como defensa de última línea (nunca se elimina), no como un camino
-- feliz que se espera ejercitar.
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
  -- de mirar si ya existe una venta con esa key.
  --
  -- Sin esto, dos llamadas concurrentes con la MISMA key (doble click que
  -- burla el lock de React, o un retry de red que se cruza con el intento
  -- original todavía en vuelo) pueden AMBAS pasar el SELECT de "¿ya
  -- existe?" antes de que ninguna haya insertado la invoice -- el índice
  -- único de la sección 1 evita que las dos lleguen a EXISTIR, pero no
  -- evita que la segunda llamada ya haya bloqueado/descontado stock, o
  -- reciba un 23505/STOCK_INSUFFICIENT crudo para una venta que en
  -- realidad SÍ se concretó (la de la primera llamada). Eso no es
  -- idempotencia semántica, es solo "no quedan dos filas".
  --
  -- pg_advisory_xact_lock(bigint) sirve exactamente para esto: se libera
  -- solo al COMMIT/ROLLBACK de esta transacción (a diferencia de
  -- pg_advisory_lock, no requiere un unlock manual, y no sobrevive un
  -- error -- ROLLBACK también lo libera). La clave se deriva de
  -- business_id + ':' + idempotency_key vía hashtextextended(text, seed)
  -- -- disponible en la versión de Postgres de este proyecto (>=11),
  -- devuelve BIGINT directamente, exactamente lo que pide la firma de
  -- pg_advisory_xact_lock. Es una clave DETERMINÍSTICA: la misma
  -- business_id+key siempre hashea al mismo bigint, así que dos llamadas
  -- con esa misma combinación siempre compiten por el MISMO lock.
  --
  -- Nunca es un lock global: distintas keys (o distintos negocios) hashean
  -- a bigints distintos con altísima probabilidad, así que ventas
  -- distintas se ejecutan concurrentemente sin pisarse. Una colisión de
  -- hash entre dos combinaciones business_id+key DISTINTAS es
  -- teóricamente posible (mismo riesgo que cualquier lock basado en hash)
  -- -- en ese caso ambas simplemente se serializan de más (una espera a la
  -- otra sin necesidad), nunca se corrompe nada: cada transacción sigue
  -- haciendo su propia búsqueda de idempotencia por business_id+key real
  -- (no por el hash) inmediatamente después de tomar el lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':' || p_idempotency_key, 0));

  -- Idempotencia: si esta key ya generó una venta para este negocio,
  -- devolverla tal cual -- CERO inserts nuevos en ninguna tabla. Gracias
  -- al lock de arriba, si otra llamada con la MISMA key está en curso,
  -- esta llamada quedó bloqueada hasta que esa otra hizo COMMIT (o
  -- ROLLBACK) -- así que este SELECT ve el resultado FINAL de la llamada
  -- anterior, nunca un estado a mitad de camino.
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
    IF v_stock_actual IS NOT NULL AND v_stock_actual < v_agg.total_qty THEN
      RAISE EXCEPTION 'STOCK_INSUFFICIENT' USING ERRCODE = 'P0001';
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
  -- activado. El trigger crm_apply_stock_movement (ya corregido arriba)
  -- aplica el delta -- nunca un UPDATE directo acá.
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
  'stock bajo lock (FOR UPDATE sobre wa_products) y aborta con '
  'STOCK_INSUFFICIENT antes de insertar nada si no alcanza -- nunca vende '
  'de más silenciosamente. No descuenta stock de líneas manuales '
  '(product_id NULL) ni de productos sin control de stock activado '
  '(stock_actual IS NULL). Requiere caja abierta solo si hay algún pago '
  'real aplicado (paid_total > 0) -- una venta 100% a cuenta corriente no '
  'toca caja. No maneja anulación/restock -- eso no existe todavía para '
  'ninguna venta de crm_invoices en este repo.';

NOTIFY pgrst, 'reload schema';
