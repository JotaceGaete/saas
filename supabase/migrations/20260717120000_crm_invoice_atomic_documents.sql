-- Atomic CRM sales-note persistence and race-free document numbering.
-- Existing invoices are not modified or deleted by this migration.

ALTER TABLE public.crm_invoices
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.wa_orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_invoices_order_id_uq
  ON public.crm_invoices(order_id) WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_document_sequences (
  business_id   UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'quote')),
  last_number   INTEGER NOT NULL CHECK (last_number >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, document_type)
);

ALTER TABLE public.crm_document_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_document_sequences_owner" ON public.crm_document_sequences;
CREATE POLICY "crm_document_sequences_owner" ON public.crm_document_sequences
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

INSERT INTO public.crm_document_sequences (business_id, document_type, last_number)
SELECT business_id, 'invoice', MAX(invoice_number)
FROM public.crm_invoices
GROUP BY business_id
ON CONFLICT (business_id, document_type) DO UPDATE
SET last_number = GREATEST(public.crm_document_sequences.last_number, EXCLUDED.last_number),
    updated_at = now();

INSERT INTO public.crm_document_sequences (business_id, document_type, last_number)
SELECT business_id, 'quote', MAX(quote_number)
FROM public.crm_quotes
GROUP BY business_id
ON CONFLICT (business_id, document_type) DO UPDATE
SET last_number = GREATEST(public.crm_document_sequences.last_number, EXCLUDED.last_number),
    updated_at = now();

CREATE OR REPLACE FUNCTION public.crm_take_document_number(
  p_business_id UUID,
  p_document_type TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number INTEGER;
BEGIN
  IF p_document_type NOT IN ('invoice', 'quote') THEN
    RAISE EXCEPTION 'Unsupported document type: %', p_document_type USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses
    WHERE id = p_business_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Business not accessible' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.crm_document_sequences AS sequence
    (business_id, document_type, last_number)
  VALUES (
    p_business_id,
    p_document_type,
    CASE p_document_type
      WHEN 'invoice' THEN COALESCE((SELECT MAX(invoice_number) FROM public.crm_invoices WHERE business_id = p_business_id), 0) + 1
      ELSE COALESCE((SELECT MAX(quote_number) FROM public.crm_quotes WHERE business_id = p_business_id), 0) + 1
    END
  )
  ON CONFLICT (business_id, document_type) DO UPDATE
    SET last_number = sequence.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO v_number;

  RETURN v_number;
END;
$$;

-- Keep the legacy RPC race-free for callers not migrated in this release.
CREATE OR REPLACE FUNCTION public.crm_next_invoice_number(p_business_id UUID)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.crm_take_document_number(p_business_id, 'invoice');
$$;

CREATE OR REPLACE FUNCTION public.crm_next_quote_number(p_business_id UUID)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.crm_take_document_number(p_business_id, 'quote');
$$;

CREATE OR REPLACE FUNCTION public.crm_assert_invoice_owner(p_invoice_id UUID)
RETURNS public.crm_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_invoice public.crm_invoices;
BEGIN
  SELECT i.* INTO v_invoice
  FROM public.crm_invoices i
  JOIN public.wa_businesses b ON b.id = i.business_id
  WHERE i.id = p_invoice_id AND b.user_id = auth.uid()
  FOR UPDATE OF i;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found or inaccessible' USING ERRCODE = '42501';
  END IF;
  RETURN v_invoice;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_insert_invoice_items(
  p_invoice_id UUID,
  p_items JSONB
) RETURNS TABLE(subtotal NUMERIC, discount_amount NUMERIC, total NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_unit NUMERIC;
  v_quantity INTEGER;
  v_discount NUMERIC;
  v_type TEXT;
  v_base NUMERIC;
  v_item_total NUMERIC;
  v_subtotal NUMERIC := 0;
  v_discount_total NUMERIC := 0;
  v_index INTEGER := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Items must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one invoice item is required' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_unit := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);
    v_discount := COALESCE((v_item->>'discount_pct')::NUMERIC, 0);
    v_type := COALESCE(NULLIF(v_item->>'discount_type', ''), 'percentage');
    IF COALESCE(trim(v_item->>'name'), '') = '' OR v_unit < 0 OR v_quantity <= 0
       OR v_type NOT IN ('percentage', 'fixed')
       OR v_discount < 0 OR (v_type = 'percentage' AND v_discount > 100) THEN
      RAISE EXCEPTION 'Invalid invoice item at index %', v_index USING ERRCODE = '23514';
    END IF;
    v_base := v_unit * v_quantity;
    v_item_total := round(GREATEST(0, v_base - CASE
      WHEN v_type = 'fixed' THEN LEAST(v_discount, v_base)
      ELSE v_base * v_discount / 100
    END), 2);

    INSERT INTO public.crm_invoice_items
      (invoice_id, product_id, name, description, unit_price, quantity,
       discount_pct, discount_type, subtotal, sort_order)
    VALUES
      (p_invoice_id, NULLIF(v_item->>'product_id', '')::UUID, trim(v_item->>'name'),
       NULLIF(v_item->>'description', ''), v_unit, v_quantity, v_discount,
       v_type, v_item_total, COALESCE((v_item->>'sort_order')::INTEGER, v_index));

    v_subtotal := v_subtotal + v_item_total;
    v_discount_total := v_discount_total + (v_base - v_item_total);
    v_index := v_index + 1;
  END LOOP;
  RETURN QUERY SELECT round(v_subtotal, 2), round(v_discount_total, 2), round(v_subtotal, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_create_invoice_document(
  p_business_id UUID,
  p_document JSONB,
  p_items JSONB
) RETURNS SETOF public.crm_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.crm_invoices;
  v_totals RECORD;
  v_number INTEGER;
  v_overall_discount NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.wa_businesses WHERE id = p_business_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Business not accessible' USING ERRCODE = '42501';
  END IF;
  v_number := public.crm_take_document_number(p_business_id, 'invoice');

  INSERT INTO public.crm_invoices
    (business_id, customer_id, invoice_number, issue_date, due_date, notes,
     payment_terms, delivery_days, delivery_method, commercial_notes, quote_id,
     order_id, source, status, paid_at, subtotal, discount_amount, total)
  VALUES
    (p_business_id, NULLIF(p_document->>'customer_id', '')::UUID, v_number,
     COALESCE(NULLIF(p_document->>'issue_date', '')::DATE, CURRENT_DATE),
     NULLIF(p_document->>'due_date', '')::DATE, NULLIF(p_document->>'notes', ''),
     NULLIF(p_document->>'payment_terms', ''), NULLIF(p_document->>'delivery_days', ''),
     NULLIF(p_document->>'delivery_method', ''), NULLIF(p_document->>'commercial_notes', ''),
     NULLIF(p_document->>'quote_id', '')::UUID, NULLIF(p_document->>'order_id', '')::UUID,
     COALESCE(NULLIF(p_document->>'source', ''), 'crm'),
     COALESCE(NULLIF(p_document->>'status', ''), 'pendiente'),
     NULLIF(p_document->>'paid_at', '')::TIMESTAMPTZ, 0, 0, 0)
  RETURNING * INTO v_invoice;

  SELECT * INTO v_totals FROM public.crm_insert_invoice_items(v_invoice.id, p_items);
  v_overall_discount := CASE
    WHEN p_document ? 'overall_discount' THEN LEAST(GREATEST(COALESCE((p_document->>'overall_discount')::NUMERIC, 0), 0), v_totals.subtotal)
    ELSE NULL
  END;
  UPDATE public.crm_invoices i
  SET subtotal = v_totals.subtotal,
      discount_amount = COALESCE(v_overall_discount, v_totals.discount_amount),
      total = CASE WHEN v_overall_discount IS NULL THEN v_totals.total ELSE v_totals.subtotal - v_overall_discount END
  WHERE i.id = v_invoice.id
  RETURNING i.* INTO v_invoice;
  RETURN NEXT v_invoice;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_update_invoice_document(
  p_invoice_id UUID,
  p_document JSONB,
  p_items JSONB
) RETURNS SETOF public.crm_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.crm_invoices;
  v_totals RECORD;
BEGIN
  v_invoice := public.crm_assert_invoice_owner(p_invoice_id);
  IF v_invoice.status <> 'pendiente' THEN
    RAISE EXCEPTION 'Only pending invoices can be edited' USING ERRCODE = '23514';
  END IF;

  -- Deletion and reinsertion occur in this function's transaction. Any exception
  -- (including an item constraint) rolls the original rows and header back.
  DELETE FROM public.crm_invoice_items WHERE invoice_id = p_invoice_id;
  SELECT * INTO v_totals FROM public.crm_insert_invoice_items(p_invoice_id, p_items);

  UPDATE public.crm_invoices i SET
    customer_id = NULLIF(p_document->>'customer_id', '')::UUID,
    issue_date = COALESCE(NULLIF(p_document->>'issue_date', '')::DATE, i.issue_date),
    due_date = NULLIF(p_document->>'due_date', '')::DATE,
    notes = NULLIF(p_document->>'notes', ''),
    payment_terms = NULLIF(p_document->>'payment_terms', ''),
    delivery_days = NULLIF(p_document->>'delivery_days', ''),
    delivery_method = NULLIF(p_document->>'delivery_method', ''),
    commercial_notes = NULLIF(p_document->>'commercial_notes', ''),
    subtotal = v_totals.subtotal,
    discount_amount = v_totals.discount_amount,
    total = v_totals.total
  WHERE i.id = p_invoice_id
  RETURNING i.* INTO v_invoice;
  RETURN NEXT v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_take_document_number(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_assert_invoice_owner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_insert_invoice_items(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_create_invoice_document(UUID, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_update_invoice_document(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_create_invoice_document(UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_update_invoice_document(UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_next_invoice_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_next_quote_number(UUID) TO authenticated;
