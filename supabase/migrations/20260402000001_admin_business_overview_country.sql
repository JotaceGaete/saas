-- Agrega country_code a wa_admin_business_overview para mostrar país en panel admin.
-- Requiere recrear la vista porque PostgreSQL no soporta ALTER VIEW para añadir columnas.

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
  b.trial_expires_at,
  b.country_code,
  public.wa_get_effective_plan(b.plan_slug, b.plan_expires_at, b.trial_expires_at) AS effective_plan,
  (b.trial_expires_at IS NOT NULL AND b.trial_expires_at > now()) AS is_trial,
  b.created_at,
  COUNT(DISTINCT p.id)                                              AS total_products,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active')           AS active_products,
  COUNT(DISTINCT o.id)                                              AS total_orders,
  COUNT(DISTINCT o.id) FILTER (
    WHERE o.created_at >= date_trunc('month', now())
  )                                                                 AS orders_this_month,
  b.user_id,
  u.email                                                           AS user_email,
  u.created_at                                                      AS user_created_at,
  (b.name ILIKE '%test%' OR b.name ILIKE '%demo%' OR b.name ILIKE '%prueba%'
   OR b.slug ILIKE '%test%' OR b.slug ILIKE '%demo%')               AS is_demo_suspected
FROM public.wa_businesses b
LEFT JOIN public.wa_products p ON p.business_id = b.id
LEFT JOIN public.wa_orders   o ON o.business_id = b.id
LEFT JOIN auth.users         u ON u.id = b.user_id
GROUP BY
  b.id, b.name, b.slug, b.email, b.whatsapp, b.is_active,
  b.plan_slug, b.plan_expires_at, b.trial_expires_at, b.country_code,
  b.created_at, b.user_id, u.email, u.created_at;

COMMENT ON VIEW public.wa_admin_business_overview IS
  'Vista enriquecida para el panel admin: negocios con métricas, plan efectivo, email del usuario y país.';

NOTIFY pgrst, 'reload schema';
