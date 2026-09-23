-- ============================================================
-- POINT-SMART-2-6 — finalización atómica + reserva de stock + guard de caja
-- ============================================================
-- Objetivo: entre "mandar el cobro al Point" y "crear la venta" puede pasar
-- tiempo. En esa ventana:
--   1) reservamos stock sin descontarlo;
--   2) impedimos cerrar la caja origen;
--   3) cuando MP confirma processed, una sola transacción crea invoice,
--      items, pago mercado_pago, stock y enlaza la operación;
--   4) retries/webhook/polling concurrentes devuelven la misma invoice.
--
-- La función es service_role-only: el browser NO puede declarar un cobro
-- processed ni invocarla directamente.

CREATE TABLE public.crm_pos_point_stock_reservations (
  operation_id UUID NOT NULL
    REFERENCES public.crm_pos_point_operations(id) ON DELETE CASCADE,
  business_id UUID NOT NULL
    REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL
    REFERENCES public.wa_products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (operation_id, product_id)
);

CREATE INDEX crm_pos_point_stock_reservations_product_idx
  ON public.crm_pos_point_stock_reservations (business_id, product_id);

ALTER TABLE public.crm_pos_point_stock_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_pos_point_stock_reservations FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.crm_pos_point_stock_reservations IS
  'POINT-SMART-2-6: reserva lógica server-side de stock mientras una order Point está pendiente. No modifica wa_products.stock_actual; se consume/elimina al finalizar y se libera en estados terminales no procesados.';

-- Reserva idempotente. Serializa por producto con FOR UPDATE y descuenta de
-- la disponibilidad las reservas activas de OTRAS operaciones.
CREATE OR REPLACE FUNCTION public.crm_point_reserve_stock(p_operation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op public.crm_pos_point_operations;
  v_line RECORD;
  v_stock INTEGER;
  v_reserved INTEGER;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_op FROM public.crm_pos_point_operations
  WHERE id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'POINT_OPERATION_NOT_FOUND' USING ERRCODE='P0001'; END IF;

  -- Retry: si ya existe cualquier reserva, la operación ya fue reservada
  -- atómicamente en una llamada anterior.
  IF EXISTS (SELECT 1 FROM public.crm_pos_point_stock_reservations WHERE operation_id = v_op.id) THEN
    RETURN;
  END IF;

  FOR v_line IN
    SELECT NULLIF(x->>'product_id','')::uuid AS product_id,
           SUM((x->>'quantity')::integer) AS qty
    FROM jsonb_array_elements(v_op.sale_snapshot->'items') x
    WHERE NULLIF(x->>'product_id','') IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  LOOP
    SELECT stock_actual INTO v_stock
    FROM public.wa_products
    WHERE id=v_line.product_id AND business_id=v_op.business_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
    IF v_stock IS NULL THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(r.quantity),0) INTO v_reserved
    FROM public.crm_pos_point_stock_reservations r
    JOIN public.crm_pos_point_operations o ON o.id=r.operation_id
    WHERE r.business_id=v_op.business_id
      AND r.product_id=v_line.product_id
      AND r.operation_id<>v_op.id
      AND o.crm_invoice_id IS NULL
      AND o.mp_status IN ('creating','created','at_terminal','action_required','processed');

    IF v_stock - v_reserved < v_line.qty THEN
      RAISE EXCEPTION 'STOCK_INSUFFICIENT:%:%:%', v_line.product_id, v_line.qty, GREATEST(v_stock-v_reserved,0)
        USING ERRCODE='P0001';
    END IF;

    INSERT INTO public.crm_pos_point_stock_reservations(operation_id,business_id,product_id,quantity)
    VALUES(v_op.id,v_op.business_id,v_line.product_id,v_line.qty);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_point_reserve_stock(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_point_reserve_stock(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_point_release_stock(p_operation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.crm_pos_point_stock_reservations WHERE operation_id=p_operation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_point_release_stock(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_point_release_stock(UUID) TO service_role;

-- Ventas TPV normales también deben respetar reservas Point activas.
-- El stock físico todavía no se descuenta durante el pago, por lo que sin
-- este helper una venta normal podría consumir unidades ya comprometidas.
CREATE OR REPLACE FUNCTION public.crm_point_assert_stock_available(
  p_business_id UUID,
  p_product_id UUID,
  p_requested INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $
DECLARE v_stock INTEGER; v_reserved INTEGER;
BEGIN
  SELECT stock_actual INTO v_stock FROM public.wa_products
   WHERE id=p_product_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF v_stock IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(r.quantity),0) INTO v_reserved
  FROM public.crm_pos_point_stock_reservations r
  JOIN public.crm_pos_point_operations o ON o.id=r.operation_id
  WHERE r.business_id=p_business_id AND r.product_id=p_product_id
    AND o.crm_invoice_id IS NULL
    AND o.mp_status IN ('creating','created','at_terminal','action_required','processed');

  IF v_stock-v_reserved<p_requested THEN
    RAISE EXCEPTION 'STOCK_INSUFFICIENT:%:%:%',p_product_id,p_requested,GREATEST(v_stock-v_reserved,0)
      USING ERRCODE='P0001';
  END IF;
END;
$;
REVOKE ALL ON FUNCTION public.crm_point_assert_stock_available(UUID,UUID,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_point_assert_stock_available(UUID,UUID,INTEGER) TO authenticated,service_role;

-- Finalizador Point específico. No llama crm_create_pos_sale porque esa RPC
-- selecciona "la caja abierta actual" y depende de auth.uid(); aquí debemos
-- usar created_by + cash_session_id capturados ANTES de cobrar.
CREATE OR REPLACE FUNCTION public.crm_finalize_point_sale(p_operation_id UUID)
RETURNS SETOF public.crm_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op public.crm_pos_point_operations;
  v_invoice public.crm_invoices;
  v_existing public.crm_invoices;
  v_line JSONB;
  v_agg RECORD;
  v_product UUID;
  v_name TEXT;
  v_note TEXT;
  v_price NUMERIC;
  v_qty INTEGER;
  v_subtotal NUMERIC := 0;
  v_discount NUMERIC;
  v_total NUMERIC;
  v_number INTEGER;
  v_sort INTEGER := 0;
  v_stock INTEGER;
  v_reserved_other INTEGER;
  v_reserved_self INTEGER;
  v_snapshot JSONB;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('point-finalize:'||p_operation_id::text,0));

  SELECT * INTO v_op FROM public.crm_pos_point_operations WHERE id=p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'POINT_OPERATION_NOT_FOUND' USING ERRCODE='P0001'; END IF;

  IF v_op.crm_invoice_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.crm_invoices WHERE id=v_op.crm_invoice_id;
    RETURN NEXT v_existing; RETURN;
  END IF;
  IF v_op.mp_status <> 'processed' THEN
    RAISE EXCEPTION 'POINT_NOT_PROCESSED' USING ERRCODE='P0001';
  END IF;
  IF v_op.mp_order_id IS NULL THEN
    RAISE EXCEPTION 'POINT_ORDER_MISSING' USING ERRCODE='P0001';
  END IF;

  v_snapshot := v_op.sale_snapshot;
  IF jsonb_typeof(v_snapshot) <> 'object'
     OR jsonb_typeof(v_snapshot->'items') <> 'array'
     OR jsonb_array_length(v_snapshot->'items')=0 THEN
    RAISE EXCEPTION 'POINT_INVALID_SNAPSHOT' USING ERRCODE='23514';
  END IF;

  -- La caja origen no puede haberse cerrado; el guard de cierre más abajo
  -- previene esto desde que existe la operación. FOR UPDATE la estabiliza.
  PERFORM 1 FROM public.crm_cash_sessions
   WHERE id=v_op.cash_session_id AND business_id=v_op.business_id AND status='open'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'POINT_CASH_SESSION_NOT_OPEN' USING ERRCODE='P0001'; END IF;

  -- Defensa adicional de idempotencia cruzada.
  SELECT * INTO v_existing FROM public.crm_invoices
   WHERE business_id=v_op.business_id AND pos_idempotency_key=v_op.sale_idempotency_key;
  IF FOUND THEN
    UPDATE public.crm_pos_point_operations SET crm_invoice_id=v_existing.id, finalized_at=COALESCE(finalized_at,now())
    WHERE id=v_op.id;
    DELETE FROM public.crm_pos_point_stock_reservations WHERE operation_id=v_op.id;
    RETURN NEXT v_existing; RETURN;
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_snapshot->'items')
  LOOP
    v_name:=trim(COALESCE(v_line->>'name',''));
    v_price:=COALESCE((v_line->>'unit_price')::numeric,-1);
    v_qty:=COALESCE((v_line->>'quantity')::integer,0);
    IF v_name='' OR v_price<0 OR v_qty<=0 THEN RAISE EXCEPTION 'POINT_INVALID_SNAPSHOT' USING ERRCODE='23514'; END IF;
    v_subtotal:=v_subtotal+round(v_price*v_qty,2);
  END LOOP;
  v_discount:=LEAST(GREATEST(COALESCE((v_snapshot->>'discount')::numeric,0),0),v_subtotal);
  v_total:=round(v_subtotal-v_discount,2);
  IF v_total<>v_op.amount OR COALESCE(v_snapshot->>'currency','')<>v_op.currency THEN
    RAISE EXCEPTION 'POINT_AMOUNT_MISMATCH' USING ERRCODE='23514';
  END IF;

  -- Stock bajo locks determinísticos. La reserva propia garantiza que una
  -- venta normal no debería haberlo consumido; igualmente revalidamos el
  -- stock físico antes de crear cualquier fila.
  FOR v_agg IN
    SELECT NULLIF(x->>'product_id','')::uuid product_id, SUM((x->>'quantity')::integer) qty
    FROM jsonb_array_elements(v_snapshot->'items') x
    WHERE NULLIF(x->>'product_id','') IS NOT NULL
    GROUP BY 1 ORDER BY 1
  LOOP
    SELECT stock_actual INTO v_stock FROM public.wa_products
     WHERE id=v_agg.product_id AND business_id=v_op.business_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
    IF v_stock IS NULL THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(quantity),0) INTO v_reserved_self
      FROM public.crm_pos_point_stock_reservations
      WHERE operation_id=v_op.id AND product_id=v_agg.product_id;
    IF v_reserved_self<>v_agg.qty THEN
      RAISE EXCEPTION 'POINT_STOCK_RESERVATION_MISSING:%',v_agg.product_id USING ERRCODE='P0001';
    END IF;
    SELECT COALESCE(SUM(r.quantity),0) INTO v_reserved_other
      FROM public.crm_pos_point_stock_reservations r
      JOIN public.crm_pos_point_operations o ON o.id=r.operation_id
      WHERE r.business_id=v_op.business_id AND r.product_id=v_agg.product_id
        AND r.operation_id<>v_op.id AND o.crm_invoice_id IS NULL
        AND o.mp_status IN ('creating','created','at_terminal','action_required','processed');
    IF v_stock < v_agg.qty THEN
      RAISE EXCEPTION 'STOCK_INSUFFICIENT:%:%:%',v_agg.product_id,v_agg.qty,v_stock USING ERRCODE='P0001';
    END IF;
  END LOOP;

  v_number:=public.crm_take_document_number(v_op.business_id,'invoice');
  INSERT INTO public.crm_invoices(
    business_id,customer_id,invoice_number,issue_date,status,subtotal,
    discount_amount,total,notes,paid_at,source,pos_idempotency_key
  ) VALUES(
    v_op.business_id,NULLIF(v_snapshot->>'customer_id','')::uuid,v_number,
    (v_snapshot->>'issue_date')::date,'pagada',round(v_subtotal,2),
    v_discount,v_total,NULLIF(v_snapshot->>'notes',''),COALESCE(v_op.processed_at,now()),
    'pos',v_op.sale_idempotency_key
  ) RETURNING * INTO v_invoice;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_snapshot->'items')
  LOOP
    v_product:=NULLIF(v_line->>'product_id','')::uuid;
    v_name:=trim(v_line->>'name'); v_price:=(v_line->>'unit_price')::numeric;
    v_qty:=(v_line->>'quantity')::integer; v_note:=NULLIF(v_line->>'note','');
    INSERT INTO public.crm_invoice_items(invoice_id,product_id,name,description,unit_price,quantity,discount_pct,subtotal,sort_order)
    VALUES(v_invoice.id,v_product,v_name,v_note,v_price,v_qty,0,round(v_price*v_qty,2),v_sort);
    v_sort:=v_sort+1;
  END LOOP;

  INSERT INTO public.crm_payments(
    business_id,invoice_id,customer_id,amount,currency,payment_method,payment_status,
    payment_date,cash_session_id,reference,notes,created_by
  ) VALUES(
    v_op.business_id,v_invoice.id,NULLIF(v_snapshot->>'customer_id','')::uuid,v_total,
    v_op.currency,'mercado_pago','received',(v_snapshot->>'issue_date')::date,
    v_op.cash_session_id,'Point '||v_op.mp_order_id,NULLIF(v_snapshot->>'notes',''),v_op.created_by
  );

  FOR v_agg IN
    SELECT NULLIF(x->>'product_id','')::uuid product_id, SUM((x->>'quantity')::integer qty
    FROM jsonb_array_elements(v_snapshot->'items') x
    WHERE NULLIF(x->>'product_id','') IS NOT NULL GROUP BY 1
  LOOP
    INSERT INTO public.crm_stock_movements(business_id,product_id,type,quantity,notes,created_by)
    SELECT v_op.business_id,v_agg.product_id,'salida',v_agg.qty,
      'Venta TPV Point -- NV-'||lpad(v_number::text,4,'0')||' (invoice '||v_invoice.id||')',v_op.created_by
    FROM public.wa_products p
    WHERE p.id=v_agg.product_id AND p.business_id=v_op.business_id AND p.stock_actual IS NOT NULL;
  END LOOP;

  UPDATE public.crm_pos_point_operations
  SET crm_invoice_id=v_invoice.id,finalized_at=now()
  WHERE id=v_op.id;
  DELETE FROM public.crm_pos_point_stock_reservations WHERE operation_id=v_op.id;

  SELECT * INTO v_invoice FROM public.crm_invoices WHERE id=v_invoice.id;
  RETURN NEXT v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_finalize_point_sale(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_finalize_point_sale(UUID) TO service_role;

-- Guard de cierre: no se puede cerrar una caja si existe un cobro Point cuyo
-- resultado todavía puede terminar generando una venta en ese turno.
CREATE OR REPLACE FUNCTION public.crm_cash_session_block_close_pending_point()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF OLD.status='open' AND NEW.status='closed' AND EXISTS(
    SELECT 1 FROM public.crm_pos_point_operations o
    WHERE o.cash_session_id=OLD.id
      AND o.crm_invoice_id IS NULL
      AND o.mp_status IN ('creating','created','at_terminal','action_required','processed')
  ) THEN
    RAISE EXCEPTION 'No se puede cerrar la caja: hay un cobro Point pendiente de resolver'
      USING ERRCODE='23514', HINT='crm_cash_session_point_pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_cash_sessions_block_close_pending_point ON public.crm_cash_sessions;
CREATE TRIGGER crm_cash_sessions_block_close_pending_point
  BEFORE UPDATE OF status ON public.crm_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.crm_cash_session_block_close_pending_point();

COMMENT ON FUNCTION public.crm_finalize_point_sale(UUID) IS
  'POINT-SMART-2-6: service_role-only. Finaliza atómicamente una operación Point status=processed contra su caja/snapshot originales, creando invoice/items/pago mercado_pago/stock y enlazando crm_invoice_id. Idempotente por advisory lock + sale_idempotency_key.';

NOTIFY pgrst,'reload schema';
