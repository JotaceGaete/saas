-- POS-HELD-SALES-1 — ventas suspendidas del TPV.
--
-- Una venta en espera NO es una venta, pedido, pago ni reserva de stock.
-- Persiste únicamente el estado comercial del carrito para poder liberar
-- la caja y reanudarlo después. crm_create_pos_sale sigue siendo la única
-- autoridad que crea invoice/pagos/movimientos de stock al cobrar.
--
-- Diseño deliberadamente separado de wa_orders/crm_invoices y de Point.

CREATE TABLE public.crm_pos_held_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  customer_id UUID NULL REFERENCES public.wa_customers(id) ON DELETE SET NULL,
  label TEXT NULL,
  discount NUMERIC NOT NULL DEFAULT 0 CHECK (discount >= 0),
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'claimed', 'discarded')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  claimed_by UUID NULL REFERENCES auth.users(id),
  claimed_at TIMESTAMPTZ NULL,
  claim_token UUID NULL,
  discarded_by UUID NULL REFERENCES auth.users(id),
  discarded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (label IS NULL OR char_length(label) <= 120),
  CHECK (
    (status = 'held' AND claimed_by IS NULL AND claimed_at IS NULL AND claim_token IS NULL
                     AND discarded_by IS NULL AND discarded_at IS NULL)
    OR
    (status = 'claimed' AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL AND claim_token IS NOT NULL
                        AND discarded_by IS NULL AND discarded_at IS NULL)
    OR
    (status = 'discarded' AND discarded_by IS NOT NULL AND discarded_at IS NOT NULL)
  )
);

CREATE TABLE public.crm_pos_held_sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  held_sale_id UUID NOT NULL REFERENCES public.crm_pos_held_sales(id) ON DELETE CASCADE,
  product_id UUID NULL REFERENCES public.wa_products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  note TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(name) <> '')
);

CREATE INDEX crm_pos_held_sales_business_status_created_idx
  ON public.crm_pos_held_sales (business_id, status, created_at DESC);
CREATE INDEX crm_pos_held_sale_items_sale_sort_idx
  ON public.crm_pos_held_sale_items (held_sale_id, sort_order);

ALTER TABLE public.crm_pos_held_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pos_held_sale_items ENABLE ROW LEVEL SECURITY;

-- Sin acceso directo desde el navegador. Las RPC SECURITY DEFINER de abajo
-- son la única superficie pública y vuelven a validar el tenant por auth.uid().
REVOKE ALL ON TABLE public.crm_pos_held_sales FROM anon, authenticated;
REVOKE ALL ON TABLE public.crm_pos_held_sale_items FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.crm_hold_pos_sale(
  p_business_id UUID,
  p_items JSONB,
  p_customer_id UUID DEFAULT NULL,
  p_discount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_label TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_held_sale_id UUID;
  v_line JSONB;
  v_product_id UUID;
  v_name TEXT;
  v_unit_price NUMERIC;
  v_quantity INTEGER;
  v_note TEXT;
  v_sort_order INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;
  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses WHERE id = p_business_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Business not accessible' USING ERRCODE = '42501';
  END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.wa_customers WHERE id = p_customer_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF p_label IS NOT NULL AND char_length(btrim(p_label)) > 120 THEN
    RAISE EXCEPTION 'INVALID_LABEL' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(p_discount, 0) < 0 THEN
    RAISE EXCEPTION 'INVALID_DISCOUNT' USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'INVALID_ITEMS' USING ERRCODE = '23514';
  END IF;

  -- Validar todo antes de insertar el encabezado: un fallo deja cero filas.
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_product_id := NULLIF(v_line->>'product_id', '')::UUID;
      v_unit_price := (v_line->>'unit_price')::NUMERIC;
      v_quantity := (v_line->>'quantity')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_ITEMS' USING ERRCODE = '23514';
    END;
    v_name := btrim(COALESCE(v_line->>'name', ''));
    v_note := NULLIF(btrim(COALESCE(v_line->>'note', '')), '');
    IF v_name = '' OR v_unit_price IS NULL OR v_unit_price < 0
       OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_ITEMS' USING ERRCODE = '23514';
    END IF;
    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.wa_products
       WHERE id = v_product_id AND business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  INSERT INTO public.crm_pos_held_sales (
    business_id, customer_id, label, discount, notes, status, created_by
  ) VALUES (
    p_business_id, p_customer_id, NULLIF(btrim(COALESCE(p_label, '')), ''),
    COALESCE(p_discount, 0), NULLIF(p_notes, ''), 'held', v_user_id
  )
  RETURNING id INTO v_held_sale_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_line->>'product_id', '')::UUID;
    v_name := btrim(v_line->>'name');
    v_unit_price := (v_line->>'unit_price')::NUMERIC;
    v_quantity := (v_line->>'quantity')::INTEGER;
    v_note := NULLIF(btrim(COALESCE(v_line->>'note', '')), '');

    INSERT INTO public.crm_pos_held_sale_items (
      held_sale_id, product_id, name, unit_price, quantity, note, sort_order
    ) VALUES (
      v_held_sale_id, v_product_id, v_name, v_unit_price, v_quantity, v_note, v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  END LOOP;

  RETURN v_held_sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_list_held_pos_sales(p_business_id UUID)
RETURNS TABLE (
  id UUID,
  customer_id UUID,
  customer_name TEXT,
  label TEXT,
  discount NUMERIC,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  item_count BIGINT,
  unit_count BIGINT,
  subtotal NUMERIC,
  total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses WHERE wa_businesses.id = p_business_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Business not accessible' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT h.id, h.customer_id, c.name::TEXT, h.label, h.discount, h.notes,
         h.created_by, h.created_at,
         count(i.id)::BIGINT,
         COALESCE(sum(i.quantity), 0)::BIGINT,
         COALESCE(sum(i.unit_price * i.quantity), 0)::NUMERIC,
         GREATEST(COALESCE(sum(i.unit_price * i.quantity), 0) - h.discount, 0)::NUMERIC
    FROM public.crm_pos_held_sales h
    LEFT JOIN public.crm_pos_held_sale_items i ON i.held_sale_id = h.id
    LEFT JOIN public.wa_customers c
      ON c.id = h.customer_id AND c.business_id = h.business_id
   WHERE h.business_id = p_business_id
     AND h.status = 'held'
   GROUP BY h.id, h.customer_id, c.name, h.label, h.discount, h.notes, h.created_by, h.created_at
   ORDER BY h.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_claim_held_pos_sale(
  p_business_id UUID,
  p_held_sale_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_sale public.crm_pos_held_sales;
  v_token UUID := gen_random_uuid();
  v_items JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses WHERE id = p_business_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Business not accessible' USING ERRCODE = '42501';
  END IF;

  -- UPDATE condicional = compare-and-swap. Solo una caja puede pasar held→claimed.
  UPDATE public.crm_pos_held_sales
     SET status = 'claimed',
         claimed_by = v_user_id,
         claimed_at = now(),
         claim_token = v_token,
         updated_at = now()
   WHERE id = p_held_sale_id
     AND business_id = p_business_id
     AND status = 'held'
  RETURNING * INTO v_sale;

  IF NOT FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.crm_pos_held_sales
       WHERE id = p_held_sale_id AND business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'HELD_SALE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'HELD_SALE_ALREADY_CLAIMED' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', i.product_id,
      'name', i.name,
      'unit_price', i.unit_price,
      'quantity', i.quantity,
      'note', i.note,
      'sort_order', i.sort_order
    ) ORDER BY i.sort_order
  ), '[]'::jsonb)
  INTO v_items
  FROM public.crm_pos_held_sale_items i
  WHERE i.held_sale_id = v_sale.id;

  RETURN jsonb_build_object(
    'id', v_sale.id,
    'customer_id', v_sale.customer_id,
    'label', v_sale.label,
    'discount', v_sale.discount,
    'notes', v_sale.notes,
    'created_at', v_sale.created_at,
    'claim_token', v_token,
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_release_claimed_pos_sale(
  p_business_id UUID,
  p_held_sale_id UUID,
  p_claim_token UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses WHERE id = p_business_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Business not accessible' USING ERRCODE = '42501';
  END IF;

  UPDATE public.crm_pos_held_sales
     SET status = 'held', claimed_by = NULL, claimed_at = NULL, claim_token = NULL,
         updated_at = now()
   WHERE id = p_held_sale_id
     AND business_id = p_business_id
     AND status = 'claimed'
     AND claimed_by = v_user_id
     AND claim_token = p_claim_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HELD_SALE_CLAIM_MISMATCH' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_discard_held_pos_sale(
  p_business_id UUID,
  p_held_sale_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses WHERE id = p_business_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Business not accessible' USING ERRCODE = '42501';
  END IF;

  UPDATE public.crm_pos_held_sales
     SET status = 'discarded', discarded_by = v_user_id, discarded_at = now(), updated_at = now()
   WHERE id = p_held_sale_id
     AND business_id = p_business_id
     AND status = 'held';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HELD_SALE_NOT_AVAILABLE' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- El claim se conserva hasta que el TPV confirma que el carrito fue
-- restaurado. Después se elimina el registro temporal. El token impide
-- que otra caja complete el claim de la primera.
CREATE OR REPLACE FUNCTION public.crm_consume_claimed_pos_sale(
  p_business_id UUID,
  p_held_sale_id UUID,
  p_claim_token UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses WHERE id = p_business_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Business not accessible' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.crm_pos_held_sales
   WHERE id = p_held_sale_id
     AND business_id = p_business_id
     AND status = 'claimed'
     AND claimed_by = v_user_id
     AND claim_token = p_claim_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HELD_SALE_CLAIM_MISMATCH' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_hold_pos_sale(UUID, JSONB, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_list_held_pos_sales(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_claim_held_pos_sale(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_release_claimed_pos_sale(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_discard_held_pos_sale(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_consume_claimed_pos_sale(UUID, UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.crm_hold_pos_sale(UUID, JSONB, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_list_held_pos_sales(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_claim_held_pos_sale(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_release_claimed_pos_sale(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_discard_held_pos_sale(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_consume_claimed_pos_sale(UUID, UUID, UUID) TO authenticated;

COMMENT ON TABLE public.crm_pos_held_sales IS
  'Cabecera temporal de ventas TPV en espera. No representa una venta/pedido/pago ni reserva stock.';
COMMENT ON TABLE public.crm_pos_held_sale_items IS
  'Snapshot de líneas de una venta TPV en espera; conserva nombre/precio/cantidad, incluyendo líneas manuales.';
COMMENT ON FUNCTION public.crm_claim_held_pos_sale(UUID, UUID) IS
  'Claim atómico held→claimed. Evita que dos cajas reanuden simultáneamente la misma venta.';
COMMENT ON FUNCTION public.crm_consume_claimed_pos_sale(UUID, UUID, UUID) IS
  'Consume (elimina) una venta reclamada solo con el token y usuario que la reclamó.';

NOTIFY pgrst, 'reload schema';
