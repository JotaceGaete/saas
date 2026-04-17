-- Mejoras al panel admin:
-- 1. Política RLS para que admins puedan leer wa_catalog_visits (necesario para la vista)
-- 2. Agrega visits_30d y visits_7d a wa_admin_business_overview
-- 3. Expone is_trial explícitamente (ya estaba implícito, ahora documentado)

-- ── 1. Admin SELECT en wa_catalog_visits ──────────────────────────────────────
DROP POLICY IF EXISTS "wa_catalog_visits_admin_select" ON public.wa_catalog_visits;
CREATE POLICY "wa_catalog_visits_admin_select"
  ON public.wa_catalog_visits FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- ── 2. Recrear wa_admin_business_overview con métricas de visitas ─────────────
-- Usamos un CTE pre-agregado para evitar subqueries correlacionadas por negocio.
DROP VIEW IF EXISTS public.wa_admin_business_overview;

CREATE VIEW public.wa_admin_business_overview AS
WITH visit_agg AS (
  SELECT
    business_id,
    COUNT(*) FILTER (WHERE created_at >= (now() - interval '30 days')) AS visits_30d,
    COUNT(*) FILTER (WHERE created_at >= (now() - interval  '7 days')) AS visits_7d
  FROM public.wa_catalog_visits
  GROUP BY business_id
)
SELECT
  b.id,
  b.name,
  b.slug,
  b.email,
  b.whatsapp,
  b.is_active,
  b.plan_slug,
  b.plan_expires_at,
  b.trial_expires_at,
  b.country_code,
  public.wa_get_effective_plan(b.plan_slug, b.plan_expires_at, b.trial_expires_at) AS effective_plan,
  (b.trial_expires_at IS NOT NULL AND b.trial_expires_at > now())                  AS is_trial,
  b.created_at,
  COUNT(DISTINCT p.id)                                                              AS total_products,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active')                           AS active_products,
  COUNT(DISTINCT o.id)                                                              AS total_orders,
  COUNT(DISTINCT o.id) FILTER (
    WHERE o.created_at >= date_trunc('month', now())
  )                                                                                 AS orders_this_month,
  COALESCE(va.visits_30d, 0)                                                        AS visits_30d,
  COALESCE(va.visits_7d, 0)                                                         AS visits_7d,
  b.user_id,
  u.email                                                                           AS user_email,
  u.created_at                                                                      AS user_created_at,
  (b.name ILIKE '%test%' OR b.name ILIKE '%demo%' OR b.name ILIKE '%prueba%'
   OR b.slug ILIKE '%test%' OR b.slug ILIKE '%demo%')                               AS is_demo_suspected
FROM public.wa_businesses b
LEFT JOIN public.wa_products p  ON p.business_id = b.id
LEFT JOIN public.wa_orders   o  ON o.business_id = b.id
LEFT JOIN auth.users         u  ON u.id = b.user_id
LEFT JOIN visit_agg          va ON va.business_id = b.id
GROUP BY
  b.id, b.name, b.slug, b.email, b.whatsapp, b.is_active,
  b.plan_slug, b.plan_expires_at, b.trial_expires_at, b.country_code,
  b.created_at, b.user_id, u.email, u.created_at,
  va.visits_30d, va.visits_7d;

COMMENT ON VIEW public.wa_admin_business_overview IS
  'Vista enriquecida para el panel admin: negocios con métricas de productos, pedidos, visitas al catálogo, plan efectivo, trial, email del usuario y país.';

NOTIFY pgrst, 'reload schema';
