-- ============================================================
-- wa_customers: ficha de cliente por teléfono normalizado
-- ============================================================

-- 1. Tabla principal

CREATE TABLE IF NOT EXISTS public.wa_customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  name             TEXT,
  phone            TEXT,
  phone_normalized TEXT,
  email            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT wa_customers_business_phone_unique UNIQUE (business_id, phone_normalized)
);

-- 2. Índices

CREATE INDEX IF NOT EXISTS idx_wa_customers_business_id ON public.wa_customers(business_id);
CREATE INDEX IF NOT EXISTS idx_wa_customers_phone_norm  ON public.wa_customers(phone_normalized);

-- 3. Trigger updated_at

DROP TRIGGER IF EXISTS wa_customers_updated_at ON public.wa_customers;
CREATE TRIGGER wa_customers_updated_at
  BEFORE UPDATE ON public.wa_customers
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- 4. FK en wa_orders (nullable)

ALTER TABLE public.wa_orders
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.wa_customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_orders_customer_id ON public.wa_orders(customer_id);

-- 5. RLS: solo el dueño autenticado puede ver y editar sus clientes.
--    El cliente anónimo NUNCA toca wa_customers directamente:
--    el upsert lo hace el trigger SECURITY DEFINER del paso 6.

ALTER TABLE public.wa_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_customers_owner_select" ON public.wa_customers;
DROP POLICY IF EXISTS "wa_customers_owner_update" ON public.wa_customers;
DROP POLICY IF EXISTS "wa_customers_anon_insert"  ON public.wa_customers;

CREATE POLICY "wa_customers_owner_select"
ON public.wa_customers FOR SELECT TO authenticated
USING (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

CREATE POLICY "wa_customers_owner_update"
ON public.wa_customers FOR UPDATE TO authenticated
USING (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
))
WITH CHECK (business_id IN (
  SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
));

-- 6. Trigger SECURITY DEFINER: cuando se inserta un pedido con teléfono,
--    hace upsert en wa_customers y rellena customer_id en el mismo pedido.
--    Al correr como SECURITY DEFINER bypasea RLS sin necesitar política INSERT pública.

CREATE OR REPLACE FUNCTION public.wa_orders_link_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_norm TEXT;
  v_customer_id UUID;
BEGIN
  -- Si ya tiene customer_id o no tiene teléfono, no hacer nada.
  IF NEW.customer_phone IS NULL OR NEW.customer_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_phone_norm := regexp_replace(NEW.customer_phone, '[^0-9]', '', 'g');
  IF v_phone_norm = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.wa_customers (business_id, name, phone, phone_normalized, email)
  VALUES (NEW.business_id, NEW.customer_name, NEW.customer_phone, v_phone_norm, NEW.customer_email)
  ON CONFLICT (business_id, phone_normalized) DO UPDATE
    SET name  = COALESCE(EXCLUDED.name,  wa_customers.name),
        email = COALESCE(EXCLUDED.email, wa_customers.email),
        updated_at = now()
  RETURNING id INTO v_customer_id;

  NEW.customer_id := v_customer_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wa_orders_link_customer ON public.wa_orders;
CREATE TRIGGER wa_orders_link_customer
  BEFORE INSERT ON public.wa_orders
  FOR EACH ROW EXECUTE FUNCTION public.wa_orders_link_customer();
