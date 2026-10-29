-- Point finalization runs server-side with service_role.
-- Preserve the existing owner check for normal callers while allowing the
-- trusted service-role finalizer to allocate the POS document number.
CREATE OR REPLACE FUNCTION public.crm_take_document_number(p_business_id uuid, p_document_type text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_number INTEGER;
BEGIN
  IF p_document_type NOT IN ('invoice', 'quote') THEN
    RAISE EXCEPTION 'Unsupported document type: %', p_document_type USING ERRCODE = '22023';
  END IF;

  IF auth.role() <> 'service_role' AND NOT EXISTS (
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
$function$;
