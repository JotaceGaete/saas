-- ============================================================
-- TPV-BUG — RLS de crm_cash_sessions/crm_payments: helper compartido +
-- reaserción idempotente de las policies existentes.
-- ============================================================
--
-- Auditoría (ver informe del bug): la regla de autorización de
-- crm_cash_sessions y crm_payments SIEMPRE fue la misma en este repo --
-- `business_id IN (SELECT id FROM wa_businesses WHERE user_id = auth.uid())`
-- -- ya usada tal cual en crm_cash_sessions (20260602040000),
-- crm_payments (20260530210000) y en la RPC atómica de venta más
-- reciente (crm_create_pos_sale, 20260910220000). No es un modelo viejo
-- que quedó desincronizado de uno nuevo: es y sigue siendo el ÚNICO
-- modelo de autorización de negocio de todo el repo -- no existe hoy
-- ninguna tabla de miembros/roles/cajeros.
--
-- Esta migración NO cambia el límite de seguridad (sigue exigiendo
-- exactamente la misma condición de ownership, ni un bit más laxo) --
-- hace dos cosas:
--
-- 1) Factoriza la condición repetida en una única función
--    `public.user_can_access_business(business_id)`, para que exista UN
--    solo lugar que extender cuando se construya el modelo de
--    negocio -> miembros -> roles -> cajeros (ver TODO en la función).
--    Hoy se comporta IDÉNTICO al `IN (SELECT ...)` inline que reemplaza.
-- 2) Vuelve a declarar (DROP POLICY IF EXISTS + CREATE POLICY, mismo
--    patrón que el resto de este repo) las policies de
--    crm_cash_sessions y crm_payments usando esa función, por si la
--    definición vigente en el proyecto real hubiera quedado
--    desincronizada de este archivo -- reaplicarla es inofensivo
--    (mismo comportamiento) y cierra esa duda sin adivinar qué pasó.
--
-- Causa raíz de "new row violates row-level security policy" en
-- producción: el INSERT llega con un business_id que NO pertenece
-- (wa_businesses.user_id) al usuario autenticado que hace la petición.
-- El mecanismo concreto encontrado en el código que produce esto de
-- forma determinística: `impersonateBusiness` (AuthContext.jsx) es
-- puramente de estado en el cliente -- solo cambia qué `business` ve la
-- UI, nunca cambia la sesión real de Supabase. Un admin "viendo como
-- negocio" sigue autenticado como sí mismo (`auth.uid()` = el admin), así
-- que cualquier intento de abrir caja para el negocio impersonado es
-- rechazado por esta policy -- correctamente, porque el admin de verdad
-- no es el dueño de ese negocio. La corrección de ESE punto va en el
-- frontend (bloquear la acción de escritura mientras se impersona, con
-- un mensaje claro) en vez de relajar esta policy -- ver CrmCaja.jsx.
--
-- El 401 de `GET /rest/v1/crm_payments` es un problema DISTINTO: un 401
-- ocurre en la capa de autenticación (JWT ausente/inválido/expirado),
-- ANTES de que Postgres evalúe ninguna policy de RLS -- una policy de
-- SELECT que deniega filas nunca produce 401 (produce 200 con un array
-- vacío). Por eso ninguna migración de RLS puede corregir un 401; la
-- mitigación para esa clase de problema (sesión/token) va en el cliente
-- (reintentar tras refrescar la sesión) -- ver crmService.js.

CREATE OR REPLACE FUNCTION public.user_can_access_business(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  -- Modelo actual: solo el dueño (wa_businesses.user_id) tiene acceso.
  -- TODO(cajeros): cuando exista una tabla de miembros
  -- (ej. crm_business_members(business_id, user_id, role)), agregar acá
  -- un `OR EXISTS (SELECT 1 FROM crm_business_members WHERE business_id
  -- = p_business_id AND user_id = auth.uid() AND role = ANY(...))`. Este
  -- es el ÚNICO lugar que debería cambiar -- ninguna policy que llame a
  -- esta función necesita tocarse.
  SELECT EXISTS (
    SELECT 1 FROM public.wa_businesses
    WHERE id = p_business_id AND user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.user_can_access_business(uuid) IS
  'TPV-BUG: punto único de extensión para autorización de negocio (hoy: solo el dueño). '
  'Cuando exista un modelo de miembros/roles/cajeros, extender esta función -- no las policies que la usan.';

-- ─── crm_cash_sessions ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "crm_cash_sessions_select" ON public.crm_cash_sessions;
CREATE POLICY "crm_cash_sessions_select"
ON public.crm_cash_sessions FOR SELECT TO authenticated
USING (public.user_can_access_business(business_id));

DROP POLICY IF EXISTS "crm_cash_sessions_insert" ON public.crm_cash_sessions;
CREATE POLICY "crm_cash_sessions_insert"
ON public.crm_cash_sessions FOR INSERT TO authenticated
WITH CHECK (public.user_can_access_business(business_id));

DROP POLICY IF EXISTS "crm_cash_sessions_update" ON public.crm_cash_sessions;
CREATE POLICY "crm_cash_sessions_update"
ON public.crm_cash_sessions FOR UPDATE TO authenticated
USING (public.user_can_access_business(business_id))
WITH CHECK (public.user_can_access_business(business_id));

DROP POLICY IF EXISTS "crm_cash_sessions_delete" ON public.crm_cash_sessions;
CREATE POLICY "crm_cash_sessions_delete"
ON public.crm_cash_sessions FOR DELETE TO authenticated
USING (public.user_can_access_business(business_id));

-- ─── crm_payments ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "crm_payments_select" ON public.crm_payments;
CREATE POLICY "crm_payments_select"
ON public.crm_payments FOR SELECT TO authenticated
USING (public.user_can_access_business(business_id));

DROP POLICY IF EXISTS "crm_payments_insert" ON public.crm_payments;
CREATE POLICY "crm_payments_insert"
ON public.crm_payments FOR INSERT TO authenticated
WITH CHECK (public.user_can_access_business(business_id));

DROP POLICY IF EXISTS "crm_payments_update" ON public.crm_payments;
CREATE POLICY "crm_payments_update"
ON public.crm_payments FOR UPDATE TO authenticated
USING (public.user_can_access_business(business_id))
WITH CHECK (public.user_can_access_business(business_id));

DROP POLICY IF EXISTS "crm_payments_delete" ON public.crm_payments;
CREATE POLICY "crm_payments_delete"
ON public.crm_payments FOR DELETE TO authenticated
USING (public.user_can_access_business(business_id));
