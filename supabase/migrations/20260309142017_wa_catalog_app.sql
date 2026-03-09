-- ============================================================
-- WhatsApp Catalog App (wa_) - Isolated schema migration
-- IMPORTANT: Does NOT modify any existing tables
-- All new objects are prefixed with wa_
-- ============================================================

-- 1. Core tables

CREATE TABLE IF NOT EXISTS public.wa_businesses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  whatsapp    TEXT NOT NULL,
  email       TEXT,
  address     TEXT,
  city        TEXT,
  country     TEXT,
  currency    TEXT DEFAULT 'USD',
  logo_url    TEXT,
  slug        TEXT UNIQUE,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wa_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(10,2) NOT NULL,
  image_url   TEXT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wa_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  customer_name  TEXT NOT NULL,
  customer_phone TEXT,
  total_amount   NUMERIC(10,2) NOT NULL,
  status         TEXT DEFAULT 'pending',
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wa_order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID REFERENCES public.wa_orders(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES public.wa_products(id),
  product_name  TEXT NOT NULL,
  product_price NUMERIC(10,2) NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  subtotal      NUMERIC(10,2) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexes

CREATE INDEX IF NOT EXISTS idx_wa_businesses_user_id   ON public.wa_businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_businesses_slug      ON public.wa_businesses(slug);
CREATE INDEX IF NOT EXISTS idx_wa_products_business_id ON public.wa_products(business_id);
CREATE INDEX IF NOT EXISTS idx_wa_orders_business_id   ON public.wa_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_wa_order_items_order_id ON public.wa_order_items(order_id);

-- 3. Functions

CREATE OR REPLACE FUNCTION public.wa_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 4. Triggers

DROP TRIGGER IF EXISTS wa_businesses_updated_at ON public.wa_businesses;
CREATE TRIGGER wa_businesses_updated_at
  BEFORE UPDATE ON public.wa_businesses
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

DROP TRIGGER IF EXISTS wa_products_updated_at ON public.wa_products;
CREATE TRIGGER wa_products_updated_at
  BEFORE UPDATE ON public.wa_products
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

DROP TRIGGER IF EXISTS wa_orders_updated_at ON public.wa_orders;
CREATE TRIGGER wa_orders_updated_at
  BEFORE UPDATE ON public.wa_orders
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- 5. Enable RLS

ALTER TABLE public.wa_businesses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_order_items ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies: wa_businesses

DROP POLICY IF EXISTS "wa_businesses_owner_all"   ON public.wa_businesses;
DROP POLICY IF EXISTS "wa_businesses_public_read" ON public.wa_businesses;

CREATE POLICY "wa_businesses_owner_all"
ON public.wa_businesses FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "wa_businesses_public_read"
ON public.wa_businesses FOR SELECT TO public
USING (true);

-- 7. RLS Policies: wa_products

DROP POLICY IF EXISTS "wa_products_owner_all"   ON public.wa_products;
DROP POLICY IF EXISTS "wa_products_public_read" ON public.wa_products;

CREATE POLICY "wa_products_owner_all"
ON public.wa_products FOR ALL TO authenticated
USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

CREATE POLICY "wa_products_public_read"
ON public.wa_products FOR SELECT TO public
USING (is_active = true);

-- 8. RLS Policies: wa_orders

DROP POLICY IF EXISTS "wa_orders_owner_select" ON public.wa_orders;
DROP POLICY IF EXISTS "wa_orders_owner_update" ON public.wa_orders;
DROP POLICY IF EXISTS "wa_orders_anon_insert"  ON public.wa_orders;

CREATE POLICY "wa_orders_owner_select"
ON public.wa_orders FOR SELECT TO authenticated
USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

CREATE POLICY "wa_orders_owner_update"
ON public.wa_orders FOR UPDATE TO authenticated
USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

CREATE POLICY "wa_orders_anon_insert"
ON public.wa_orders FOR INSERT TO public
WITH CHECK (true);

-- 9. RLS Policies: wa_order_items

DROP POLICY IF EXISTS "wa_order_items_owner_select" ON public.wa_order_items;
DROP POLICY IF EXISTS "wa_order_items_anon_insert"  ON public.wa_order_items;

CREATE POLICY "wa_order_items_owner_select"
ON public.wa_order_items FOR SELECT TO authenticated
USING (
  order_id IN (
    SELECT o.id FROM public.wa_orders o
    JOIN public.wa_businesses b ON o.business_id = b.id
    WHERE b.user_id = auth.uid()
  )
);

CREATE POLICY "wa_order_items_anon_insert"
ON public.wa_order_items FOR INSERT TO public
WITH CHECK (true);

-- 10. Storage Buckets

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wa-product-images', 'wa-product-images', true, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wa-business-logos', 'wa-business-logos', true, 5242760,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "wa_product_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "wa_product_images_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "wa_product_images_auth_delete" ON storage.objects;

CREATE POLICY "wa_product_images_public_read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'wa-product-images');

CREATE POLICY "wa_product_images_auth_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'wa-product-images');

CREATE POLICY "wa_product_images_auth_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'wa-product-images' AND owner = auth.uid());

DROP POLICY IF EXISTS "wa_business_logos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "wa_business_logos_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "wa_business_logos_auth_delete" ON storage.objects;

CREATE POLICY "wa_business_logos_public_read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'wa-business-logos');

CREATE POLICY "wa_business_logos_auth_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'wa-business-logos');

CREATE POLICY "wa_business_logos_auth_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'wa-business-logos' AND owner = auth.uid());

-- 11. Mock demo data

DO $$
DECLARE
  demo_user_id UUID := gen_random_uuid();
  demo_biz_id  UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_user_meta_data, raw_app_meta_data,
    is_sso_user, is_anonymous, confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at, email_change_token_new, email_change,
    email_change_sent_at, email_change_token_current, email_change_confirm_status,
    reauthentication_token, reauthentication_sent_at, phone, phone_change,
    phone_change_token, phone_change_sent_at
  ) VALUES (
    demo_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'negocio@ejemplo.com', crypt('demo1234', gen_salt('bf', 10)), now(), now(), now(),
    jsonb_build_object('full_name', 'Tienda Demo'),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
    false, false, '', null, '', null, '', '', null, '', 0, '', null, null, '', '', null
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wa_businesses (
    id, user_id, name, description, whatsapp, email,
    address, city, country, currency, slug, is_active
  ) VALUES (
    demo_biz_id, demo_user_id,
    'Tienda Artesanal Lucia',
    'Productos artesanales hechos a mano con amor. Envios a todo el pais.',
    '+57 300 123 4567', 'lucia@tiendaartesanal.com',
    'Calle 45 #12-30, Barrio El Poblado',
    'Medellin', 'CO', 'COP', 'tienda-lucia', true
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wa_products (business_id, name, description, price, is_active, sort_order)
  VALUES
    (demo_biz_id, 'Torta de Chocolate Artesanal', 'Deliciosa torta humeda de chocolate con cobertura de ganache', 45.00, true, 1),
    (demo_biz_id, 'Empanadas de Carne x12', 'Docena de empanadas caseras rellenas de carne picada', 18.50, true, 2),
    (demo_biz_id, 'Jugo Natural de Naranja 1L', 'Jugo fresco exprimido de naranjas seleccionadas', 8.00, true, 3),
    (demo_biz_id, 'Vela Aromatica de Lavanda', 'Vela artesanal de soja con esencia de lavanda', 12.00, true, 4),
    (demo_biz_id, 'Crema Hidratante Natural', 'Crema facial hidratante con aloe vera y aceite de argan', 28.00, true, 5),
    (demo_biz_id, 'Collar de Plata con Dije', 'Collar artesanal de plata 925 con dije de luna', 35.00, false, 6)
  ON CONFLICT (id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Mock data insertion skipped: %', SQLERRM;
END $$;
