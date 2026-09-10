-- ============================================================
-- MP-CHECKOUT-3 — disponibilidad pública/sanitizada de Mercado Pago
-- DEL COMERCIO para el catálogo público.
--
-- El comprador del catálogo es SIEMPRE anónimo (sin sesión Walinka),
-- así que wa_get_my_mp_connection_status() (MP-OAUTH-1) no sirve acá:
-- deriva el negocio de auth.uid(), y un visitante del catálogo no
-- tiene uno. Se audita esto explícitamente antes de escribir esta
-- migración -- no existe hoy ningún RPC sanitizado alcanzable por
-- `anon` para esta pregunta, así que se agrega el mínimo necesario.
--
-- Esta RPC devuelve EXCLUSIVAMENTE un booleano. Nunca business_id,
-- nunca provider_user_id, nunca token, nunca ningún otro campo de
-- mp_connections. No es un problema de "oráculo" -- la existencia del
-- negocio y su catálogo ya son públicos (es literalmente la página
-- que el visitante está viendo); lo único que esta función decide es
-- si mostrar o no el botón "Pagar con Mercado Pago".
-- ============================================================

CREATE OR REPLACE FUNCTION public.wa_get_public_merchant_mp_availability(p_business_slug TEXT)
RETURNS TABLE (available BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business RECORD;
  v_country  TEXT;
BEGIN
  IF p_business_slug IS NULL OR btrim(p_business_slug) = '' THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  SELECT id, is_active, country_code
    INTO v_business
    FROM public.wa_businesses
   WHERE slug = btrim(p_business_slug);

  IF NOT FOUND OR NOT v_business.is_active THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  -- Mismo conjunto soportado y misma normalización estricta (sin fuzzy
  -- matching, sin fallback a `country`) que ya usa MP-OAUTH/MP-CHECKOUT-1.
  v_country := upper(btrim(coalesce(v_business.country_code, '')));
  IF v_country NOT IN ('CL', 'AR') THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT EXISTS (
      SELECT 1 FROM public.mp_connections
       WHERE business_id = v_business.id
         AND status = 'connected'
    );
END;
$$;

-- A propósito, distinto del resto de RPCs de MP-OAUTH/MP-CHECKOUT: esta
-- SÍ debe ser alcanzable por `anon` (el comprador del catálogo no tiene
-- sesión) -- solo devuelve un booleano, nunca datos sensibles.
GRANT EXECUTE ON FUNCTION public.wa_get_public_merchant_mp_availability(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.wa_get_public_merchant_mp_availability(TEXT) IS
  'Único punto de entrada público (anon + authenticated) para que el catálogo sepa si mostrar "Pagar con Mercado Pago". Devuelve EXCLUSIVAMENTE {available: boolean} -- true solo si el negocio existe, está activo, su country_code es CL/AR (mismo conjunto que MP-OAUTH, sin fuzzy matching), y tiene una fila en mp_connections con status=''connected''. Nunca expone business_id/provider_user_id/tokens ni ningún otro campo.';

NOTIFY pgrst, 'reload schema';
