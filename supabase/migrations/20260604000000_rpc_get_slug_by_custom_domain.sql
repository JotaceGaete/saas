-- RPC pública para resolver el slug de un catálogo dado un dominio personalizado.
-- SECURITY DEFINER para saltear RLS en business_domains y wa_businesses.
-- Solo devuelve el slug; no expone IDs ni datos sensibles.

CREATE OR REPLACE FUNCTION public.get_slug_by_custom_domain(p_domain TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_slug        TEXT;
BEGIN
  SELECT business_id
    INTO v_business_id
    FROM public.business_domains
   WHERE domain = p_domain
     AND status = 'active'
   LIMIT 1;

  IF v_business_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT slug
    INTO v_slug
    FROM public.wa_businesses
   WHERE id = v_business_id
     AND is_active = true
   LIMIT 1;

  RETURN v_slug;
END;
$$;

-- Acceso público: la consulta no expone datos privados, solo el slug del catálogo.
GRANT EXECUTE ON FUNCTION public.get_slug_by_custom_domain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_slug_by_custom_domain(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
