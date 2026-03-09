-- RLS: permitir a usuarios con role 'admin' (app_metadata o user_metadata) leer todas las tablas wa_* para el panel admin.
-- El cliente envía el JWT con app_metadata.role = 'admin' cuando el usuario está marcado como admin en Supabase Auth.

-- Helper: true si el usuario autenticado es admin
CREATE OR REPLACE FUNCTION public.wa_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- wa_businesses: admin puede SELECT todo
DROP POLICY IF EXISTS "wa_businesses_admin_select" ON public.wa_businesses;
CREATE POLICY "wa_businesses_admin_select"
ON public.wa_businesses FOR SELECT TO authenticated
USING (public.wa_is_admin());

-- wa_products: admin puede SELECT todo (para conteos y listados)
DROP POLICY IF EXISTS "wa_products_admin_select" ON public.wa_products;
CREATE POLICY "wa_products_admin_select"
ON public.wa_products FOR SELECT TO authenticated
USING (public.wa_is_admin());

-- wa_orders: admin puede SELECT todo (para conteos)
DROP POLICY IF EXISTS "wa_orders_admin_select" ON public.wa_orders;
CREATE POLICY "wa_orders_admin_select"
ON public.wa_orders FOR SELECT TO authenticated
USING (public.wa_is_admin());
