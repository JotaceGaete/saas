-- SEGURIDAD-WALINKA-1E — wa_order_items (checkout público) + policies
-- históricas de Supabase Storage (wa-product-images, wa-business-logos,
-- wa-business-covers).
--
-- ============================================================
-- A) wa_order_items_anon_insert
-- ============================================================
--
-- Hallazgo: wa_order_items_anon_insert (20260309142017_wa_catalog_app.sql)
-- es FOR INSERT TO public WITH CHECK (true) -- no valida en absoluto que
-- el order_id pertenezca a un pedido recién creado por el mismo actor.
-- createOrder() (src/services/waBusinessService.js) crea el pedido con 2
-- INSERT independientes desde el cliente (primero wa_orders, después
-- wa_order_items) -- exactamente el patrón "no-atómico" que
-- 20260910130000_merchant_mp_checkout_core.sql ya había señalado como
-- problema al diseñar el checkout de comercio (ver su comentario de
-- cabecera, "MP-CHECKOUT-0").
--
-- Demostrado con datos 100% sintéticos en PostgreSQL real (ver informe
-- SEGURIDAD-WALINKA-1E): un actor sin ninguna relación con el negocio A
-- -- tanto anon como un authenticated cualquiera, ni dueño ni admin --
-- pudo insertar un wa_order_items arbitrario en un pedido de A, con
-- cualquier product_name/product_price/quantity. No se afirma que esto
-- haya sido explotado en producción.
--
-- Diseño: exactamente el patrón que la propia migración de MP-CHECKOUT-1
-- ya estableció como precedente (RPC SECURITY DEFINER que crea
-- wa_orders + wa_order_items atómicamente, en una sola invocación) --
-- pero para el checkout público general (no solo el de comercio con MP
-- Connect), así que se GRANTea a anon/authenticated en vez de dejarlo
-- service_role-only. Los 4 triggers existentes de wa_orders
-- (wa_orders_enforce_limit, wa_orders_link_customer, wa_orders_set_paid_at,
-- wa_orders_updated_at) se aplican exactamente igual, porque disparan
-- sobre cualquier INSERT en la tabla sin importar el rol o la función que
-- lo ejecute -- el límite mensual de pedidos por plan, el auto-link de
-- wa_customers y paid_at siguen funcionando sin cambios.
--
-- Preserva exactamente el modelo de confianza actual sobre precio/cantidad
-- (el cliente sigue enviando product_price/subtotal/quantity, igual que
-- hoy -- esta RPC es un primitivo de persistencia atómica, no de
-- validación de negocio, mismo criterio que wa_create_merchant_checkout_order).
-- Esto es una manipulación de precio POSIBLE en ambos casos (antes y
-- después de este fix) y queda documentada como hallazgo aparte en el
-- informe -- fuera de alcance de este ticket, que cubre solamente el
-- wa_order_items_anon_insert cross-order.
--
-- wa_orders_anon_insert (crear UN pedido nuevo para cualquier negocio) NO
-- se toca: es el punto de entrada público intencional del catálogo, sin
-- ningún concepto de "ownership" que viole -- el ticket cubre
-- exclusivamente wa_order_items_anon_insert.

CREATE OR REPLACE FUNCTION public.wa_create_order_with_items(
  p_business_id      UUID,
  p_customer_name    TEXT,
  p_customer_phone   TEXT,
  p_customer_email   TEXT,
  p_service_type     TEXT,
  p_table_reference  TEXT,
  p_delivery_address TEXT,
  p_total_amount     NUMERIC,
  p_subtotal         NUMERIC,
  p_currency         TEXT,
  p_notes            TEXT,
  p_items            JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_order_id UUID;
  v_item     JSONB;
BEGIN
  INSERT INTO public.wa_orders (
    business_id, customer_name, customer_phone, customer_email,
    service_type, table_reference, delivery_address,
    total_amount, subtotal, currency,
    order_status, payment_status, notes
  ) VALUES (
    p_business_id, p_customer_name, p_customer_phone, p_customer_email,
    p_service_type, p_table_reference, p_delivery_address,
    p_total_amount, p_subtotal, p_currency,
    'pedido', 'pendiente', p_notes
  )
  RETURNING id INTO v_order_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.wa_order_items (
        order_id, product_id, product_name, product_price, quantity, subtotal, selected_options
      ) VALUES (
        v_order_id,
        (v_item->>'product_id')::UUID,
        v_item->>'product_name',
        (v_item->>'product_price')::NUMERIC,
        (v_item->>'quantity')::INTEGER,
        (v_item->>'subtotal')::NUMERIC,
        COALESCE(v_item->'selected_options', '[]'::jsonb)
      );
    END LOOP;
  END IF;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_create_order_with_items(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.wa_create_order_with_items(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB
) TO anon, authenticated;

COMMENT ON FUNCTION public.wa_create_order_with_items(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB
) IS
  'SEGURIDAD-WALINKA-1E. Crea wa_orders + wa_order_items atómicamente en una sola invocación -- reemplaza los 2 INSERT independientes que hacía createOrder() desde el cliente. p_items: array JSONB de {product_id, product_name, product_price, quantity, subtotal, selected_options}, tal cual los envía el cliente (sin re-validar contra wa_products -- mismo criterio que wa_create_merchant_checkout_order). Único camino para escribir en wa_order_items desde anon/authenticated: la policy wa_order_items_anon_insert (WITH CHECK true, sin validar ownership del order_id) se elimina en esta misma migración.';

DROP POLICY IF EXISTS "wa_order_items_anon_insert" ON public.wa_order_items;

-- ============================================================
-- B) Storage: wa-product-images, wa-business-logos, wa-business-covers
-- ============================================================
--
-- Auditoría de consumidores (ver informe SEGURIDAD-WALINKA-1E): cero
-- referencias en todo el repo a estos 3 buckets, y cero usos de
-- supabase.storage/storage.from(...)/.upload()/.remove()/.update()/
-- getPublicUrl()/createSignedUrl() en frontend, backend o Edge
-- Functions. El sistema migró subida de imágenes/video enteramente a
-- Cloudflare R2 (Edge Functions upload-image-r2/upload-video-r2,
-- presigned PUT URLs, scripts/migrate-images-to-r2.mjs documenta
-- explícitamente la migración de URLs viejas *.supabase.co/storage/v1/
-- object/public/... hacia R2).
--
-- Las 3 policies INSERT históricas (..._auth_upload) validan únicamente
-- bucket_id = '...' -- CUALQUIER usuario authenticated puede subir a
-- CUALQUIER ruta dentro del bucket, sin relación con su propio negocio
-- (el hallazgo exacto que señala el ticket). Sin consumidor de escritura
-- vivo que preservar, la corrección mínima es cerrar por completo el
-- INSERT/DELETE de cliente -- no diseñar una policy de ownership por
-- path para un flujo que ya no existe.
--
-- Las policies de lectura pública (..._public_read) NO se tocan: pueden
-- seguir existiendo URLs históricas guardadas en wa_products.image_url /
-- wa_businesses.logo_url / wa_businesses.cover_image_url que aún
-- apunten a Supabase Storage (no se migraron todas a R2 necesariamente
-- en todo negocio/producto) -- romper la lectura rompería esas imágenes
-- ya publicadas.
--
-- No se borran buckets ni objetos existentes -- solo se retira la
-- capacidad de escribir OBJETOS NUEVOS vía Supabase Storage.

DROP POLICY IF EXISTS "wa_product_images_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "wa_product_images_auth_delete" ON storage.objects;

DROP POLICY IF EXISTS "wa_business_logos_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "wa_business_logos_auth_delete" ON storage.objects;

DROP POLICY IF EXISTS "wa_business_covers_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "wa_business_covers_auth_delete" ON storage.objects;

NOTIFY pgrst, 'reload schema';
