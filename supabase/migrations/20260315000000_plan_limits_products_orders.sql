-- Eliminar overload de 2 args para que solo exista wa_get_effective_plan(TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
-- y las llamadas con 2 args usen el 3º por defecto (NULL). Evita "function is not unique".
DROP FUNCTION IF EXISTS public.wa_get_effective_plan(TEXT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.wa_plan_max_products(p_plan TEXT)
RETURNS INT LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN CASE p_plan
    WHEN 'starter'  THEN 10
    WHEN 'pro'      THEN 100
    WHEN 'business' THEN NULL
    ELSE 10
  END;
END;
$$;
-- 2. wa_products: columna status (active | inactive | archived)
ALTER TABLE public.wa_products
  ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.wa_products
  DROP CONSTRAINT IF EXISTS wa_products_status_check;
ALTER TABLE public.wa_products
  ADD CONSTRAINT wa_products_status_check
  CHECK (status IN ('active', 'inactive', 'archived'));
COMMENT ON COLUMN public.wa_products.status IS 'active = cuenta para límite y catálogo; inactive/archived = no.';
-- Backfill inicial: is_active = true -> active; false o NULL -> inactive
UPDATE public.wa_products
SET status = CASE WHEN is_active IS TRUE THEN 'active' ELSE 'inactive' END
WHERE status IS NULL;
-- Asegurar NOT NULL + default
ALTER TABLE public.wa_products
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active';
-- Trigger: mantener is_active y status sincronizados
CREATE OR REPLACE FUNCTION public.wa_products_sync_is_active()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- INSERT: si no viene status, lo inferimos desde is_active; si viene, manda status.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL THEN
      NEW.status := CASE
        WHEN COALESCE(NEW.is_active, TRUE) THEN 'active'
        ELSE 'inactive'
      END;
    END IF;
  END IF;

  -- UPDATE: si no viene status explícito, conservar el anterior o inferir desde is_active.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NULL THEN
      IF NEW.is_active IS NULL THEN
        NEW.status := OLD.status;
      ELSE
        NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END;
      END IF;
    END IF;
  END IF;

  -- En todos los casos: is_active se deriva SIEMPRE de status.
  NEW.is_active := (NEW.status = 'active');

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS wa_products_1_sync_status ON public.wa_products;
CREATE TRIGGER wa_products_1_sync_status
  BEFORE INSERT OR UPDATE OF status, is_active ON public.wa_products
  FOR EACH ROW EXECUTE FUNCTION public.wa_products_sync_is_active();
-- 3. wa_check_product_limit: usa status = 'active'
CREATE OR REPLACE FUNCTION public.wa_check_product_limit(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_plan      TEXT;
  v_expires   TIMESTAMPTZ;
  v_eff_plan  TEXT;
  v_max       INT;
  v_active_cnt INT;
BEGIN
  SELECT plan_slug, plan_expires_at
    INTO v_plan, v_expires
    FROM public.wa_businesses
   WHERE id = p_business_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  v_eff_plan := public.wa_get_effective_plan(v_plan, v_expires);
  v_max      := public.wa_plan_max_products(v_eff_plan);
  IF v_max IS NULL THEN RETURN TRUE; END IF;
  SELECT COUNT(*) INTO v_active_cnt
    FROM public.wa_products
   WHERE business_id = p_business_id AND status = 'active';
  RETURN v_active_cnt < v_max;
END;
$$;
-- 4. wa_get_plan_usage: contar activos por status = 'active'
CREATE OR REPLACE FUNCTION public.wa_get_plan_usage(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_plan          TEXT;
  v_expires       TIMESTAMPTZ;
  v_eff_plan      TEXT;
  v_max_products  INT;
  v_max_orders    INT;
  v_active_prod   INT;
  v_orders_month  INT;
BEGIN
  SELECT plan_slug, plan_expires_at
    INTO v_plan, v_expires
    FROM public.wa_businesses
   WHERE id = p_business_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'planSlug', 'starter', 'effectivePlan', 'starter',
      'activeProducts', 0, 'maxProducts', 10,
      'ordersThisMonth', 0, 'maxOrdersPerMonth', 30,
      'isTrial', false
    );
  END IF;
  v_eff_plan     := public.wa_get_effective_plan(v_plan, v_expires);
  v_max_products := public.wa_plan_max_products(v_eff_plan);
  v_max_orders   := public.wa_plan_max_orders_per_month(v_eff_plan);
  SELECT COUNT(*) INTO v_active_prod
    FROM public.wa_products
   WHERE business_id = p_business_id AND status = 'active';
  SELECT COUNT(*) INTO v_orders_month
    FROM public.wa_orders
   WHERE business_id = p_business_id
     AND created_at >= date_trunc('month', now());
  RETURN jsonb_build_object(
    'planSlug',          v_plan,
    'effectivePlan',     v_eff_plan,
    'planExpiresAt',     v_expires,
    'trialExpiresAt',    NULL,
    'isTrial',           false,
    'activeProducts',    v_active_prod,
    'maxProducts',       v_max_products,
    'ordersThisMonth',   v_orders_month,
    'maxOrdersPerMonth', v_max_orders
  );
END;
$$;
-- 5. Vista admin: usa status = 'active' y wa_get_effective_plan/2
DROP VIEW IF EXISTS public.wa_admin_business_overview;

CREATE VIEW public.wa_admin_business_overview AS
SELECT
  b.id,
  b.name,
  b.slug,
  b.email,
  b.whatsapp,
  b.is_active,
  b.plan_slug,
  b.plan_expires_at,
  public.wa_get_effective_plan(b.plan_slug, b.plan_expires_at) AS effective_plan,
  FALSE AS is_trial,
  b.created_at,
  COUNT(DISTINCT p.id)                                         AS total_products,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active')      AS active_products,
  COUNT(DISTINCT o.id)                                         AS total_orders,
  COUNT(DISTINCT o.id) FILTER (
    WHERE o.created_at >= date_trunc('month', now())
  )                                                            AS orders_this_month,
  b.user_id,
  u.email                                                      AS user_email,
  u.created_at                                                 AS user_created_at,
  (b.name ILIKE '%test%' OR b.name ILIKE '%demo%' OR b.name ILIKE '%prueba%'
   OR b.slug ILIKE '%test%' OR b.slug ILIKE '%demo%')          AS is_demo_suspected
FROM public.wa_businesses b
LEFT JOIN public.wa_products p ON p.business_id = b.id
LEFT JOIN public.wa_orders   o ON o.business_id = b.id
LEFT JOIN auth.users         u ON u.id = b.user_id
GROUP BY b.id, b.name, b.slug, b.email, b.whatsapp, b.is_active,
         b.plan_slug, b.plan_expires_at, b.created_at,
         b.user_id, u.email, u.created_at;
-- 6. Trigger: bloquear INSERT/UPDATE de producto si supera límite de activos
CREATE OR REPLACE FUNCTION public.wa_products_enforce_limit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bid    UUID;
  v_max    INT;
  v_count  INT;
  v_eff    TEXT;
  v_plan   TEXT;
  v_exp    TIMESTAMPTZ;
  v_will_be_active BOOLEAN;
BEGIN
  v_bid := NEW.business_id;
  v_will_be_active := (COALESCE(NEW.status, CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END) = 'active');
  -- Si el nuevo estado no es activo, no aplica límite
  IF NOT v_will_be_active THEN
    RETURN NEW;
  END IF;
  -- Si era activo y sigue activo, no cambia el conteo
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;
  SELECT plan_slug, plan_expires_at INTO v_plan, v_exp
  FROM public.wa_businesses WHERE id = v_bid;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_eff   := public.wa_get_effective_plan(v_plan, v_exp);
  v_max   := public.wa_plan_max_products(v_eff);
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_count
  FROM public.wa_products
  WHERE business_id = v_bid AND status = 'active';
  -- Si UPDATE desde activo a algo no-activo, restamos 1 del conteo antes de comparar
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    v_count := v_count - 1;
  END IF;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED:Has alcanzado el límite de % productos activos de tu plan. Desactiva uno o actualiza tu plan.', v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS wa_products_2_enforce_limit ON public.wa_products;
CREATE TRIGGER wa_products_2_enforce_limit
  BEFORE INSERT OR UPDATE OF status, is_active ON public.wa_products
  FOR EACH ROW EXECUTE FUNCTION public.wa_products_enforce_limit_trigger();
-- 7. Trigger: bloquear INSERT de pedido si el plan tiene límite de pedidos/mes (Free)
CREATE OR REPLACE FUNCTION public.wa_orders_enforce_limit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ 
DECLARE
  v_eff   TEXT;
  v_max   INT;
  v_count INT;
  v_plan  TEXT;
  v_exp   TIMESTAMPTZ;
BEGIN
  SELECT plan_slug, plan_expires_at INTO v_plan, v_exp
  FROM public.wa_businesses WHERE id = NEW.business_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_eff   := public.wa_get_effective_plan(v_plan, v_exp);
  v_max   := public.wa_plan_max_orders_per_month(v_eff);
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_count
  FROM public.wa_orders
  WHERE business_id = NEW.business_id
    AND created_at >= date_trunc('month', now());
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED:Tu plan Free permite 30 pedidos por mes. Actualiza a Pro para recibir pedidos ilimitados.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS wa_orders_enforce_limit ON public.wa_orders;
CREATE TRIGGER wa_orders_enforce_limit
  BEFORE INSERT ON public.wa_orders
  FOR EACH ROW EXECUTE FUNCTION public.wa_orders_enforce_limit_trigger();
-- 8. Helper: desactivar productos que excedan el máximo del plan (no borrar datos)
CREATE OR REPLACE FUNCTION public.wa_deactivate_excess_products(
  p_business_id UUID,
  p_new_plan_slug TEXT
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max   INT;
  v_count INT;
BEGIN
  v_max := public.wa_plan_max_products(p_new_plan_slug);
  IF v_max IS NULL THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO v_count
  FROM public.wa_products
  WHERE business_id = p_business_id AND status = 'active';
  IF v_count <= v_max THEN RETURN 0; END IF;
  UPDATE public.wa_products
  SET status = 'inactive', is_active = FALSE
  WHERE business_id = p_business_id
    AND status = 'active'
    AND id NOT IN (
      SELECT id FROM public.wa_products
      WHERE business_id = p_business_id AND status = 'active'
      ORDER BY updated_at ASC, id ASC
      LIMIT v_max
    );
  RETURN (v_count - v_max);
END;
$$;
GRANT EXECUTE ON FUNCTION public.wa_deactivate_excess_products TO service_role;
