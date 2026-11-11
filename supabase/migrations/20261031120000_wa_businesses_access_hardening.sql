-- ============================================================================
-- Hardening de acceso a wa_businesses y wa_payments (2026-10-31)
--
-- Problemas que corrige (verificados en producción, solo lectura):
--   1. La política wa_businesses_public_read (rol public, USING true) permitía
--      que anon y cualquier usuario autenticado leyera TODAS las columnas de
--      TODOS los negocios, incluidos email y datos de suscripción/trial.
--   2. Un comerciante autenticado podía hacer UPDATE de plan_slug,
--      plan_expires_at, trial_expires_at, is_active, etc. de su propio negocio
--      (autoasignación de plan / reactivación de trial).
--   3. anon y authenticated tenían INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/
--      TRIGGER sobre tablas que no los necesitan.
--
-- Modelo resultante:
--   - Lectura pública: anon y authenticated leen SOLO columnas públicas de
--     cualquier negocio (catálogo). Columnas privadas: email y campos de
--     suscripción. Se exponen al dueño y al admin mediante RPC con chequeo.
--   - Datos de plan para clientes finales: función que devuelve solo el plan
--     efectivo, sin fechas ni datos de facturación.
--   - Escritura de campos de plan: solo service_role o admin. El INSERT del
--     dueño se permite únicamente con el trial estándar de la plataforma.
--
-- NO aplicar en producción sin aprobación. Probar primero con
-- scripts/security/wa-businesses-access-check.sh en una base descartable.
-- ============================================================================

-- ── 1. Política de lectura: se elimina la lectura abierta de filas + columnas ──
DROP POLICY IF EXISTS wa_businesses_public_read ON public.wa_businesses;

-- Las filas siguen siendo legibles para anon/authenticated, pero el acceso
-- real queda limitado por la lista de columnas del punto 2.
CREATE POLICY wa_businesses_catalog_read ON public.wa_businesses
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── 2. Columnas: lectura pública explícita (sin email ni suscripción) ─────────
REVOKE SELECT ON public.wa_businesses FROM anon, authenticated;
GRANT SELECT (
  id, user_id, name, description, whatsapp, address, city, region, country,
  country_code, currency, logo_url, cover_image_url, design_settings, lat, lng,
  og_image_url, slug, is_active, rubro_id, seo_family_key, seo_content_override,
  seo_content_ai, instagram_url, tiktok_url, facebook_url, print_legend,
  document_title_type, business_mode, order_message_template, ticket_logo_url,
  operating_days, onboarding_step, onboarding_completed_at, created_at, updated_at
) ON public.wa_businesses TO anon, authenticated;
-- Nota: user_id se mantiene legible porque el cliente lo usa en filtros
-- (.eq('user_id', ...)). Decisión pendiente de revisión: expone el UUID del dueño.

-- ── 3. Privilegios de escritura mínimos ───────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.wa_businesses FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.wa_businesses FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.wa_payments FROM anon, authenticated;

-- ── 4. Guardia de campos de plan (INSERT y UPDATE por authenticated) ─────────
CREATE OR REPLACE FUNCTION public.wa_businesses_guard_billing_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- service_role, postgres y admins quedan fuera de la guardia.
  IF auth.role() IS DISTINCT FROM 'authenticated' OR public.wa_is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Solo se permite el trial estándar de la plataforma (14 días, plan pro).
    IF NEW.user_id IS DISTINCT FROM auth.uid()
       OR NEW.plan_slug IS DISTINCT FROM 'pro'
       OR NEW.scheduled_plan_slug IS DISTINCT FROM 'starter'
       OR NEW.is_active IS NOT TRUE
       OR NEW.trial_expires_at IS NULL
       OR NEW.trial_expires_at > now() + interval '15 days'
       OR NEW.plan_expires_at IS DISTINCT FROM NEW.trial_expires_at THEN
      RAISE EXCEPTION 'billing fields are server-managed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.plan_started_at IS DISTINCT FROM OLD.plan_started_at
     OR NEW.scheduled_plan_slug IS DISTINCT FROM OLD.scheduled_plan_slug
     OR NEW.scheduled_change_at IS DISTINCT FROM OLD.scheduled_change_at
     OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'billing fields are server-managed' USING ERRCODE = '42501';
  END IF;

  -- Única excepción: el dueño puede BAJAR a starter un plan o trial ya vencido
  -- (AuthContext aplica este downgrade al cargar la sesión). Nunca subir ni extender.
  IF NEW.plan_slug IS DISTINCT FROM OLD.plan_slug
     OR NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at
     OR NEW.trial_expires_at IS DISTINCT FROM OLD.trial_expires_at THEN
    IF NOT (
      NEW.plan_slug = 'starter'
      AND NEW.plan_expires_at IS NULL
      AND NEW.trial_expires_at IS NULL
      AND (
        (OLD.plan_expires_at IS NOT NULL AND OLD.plan_expires_at <= now())
        OR (OLD.trial_expires_at IS NOT NULL AND OLD.trial_expires_at <= now())
      )
    ) THEN
      RAISE EXCEPTION 'billing fields are server-managed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wa_businesses_guard_billing ON public.wa_businesses;
CREATE TRIGGER wa_businesses_guard_billing
  BEFORE INSERT OR UPDATE ON public.wa_businesses
  FOR EACH ROW EXECUTE FUNCTION public.wa_businesses_guard_billing_fields();

-- ── 5. RPC: datos de suscripción del propio dueño (o admin) ──────────────────
CREATE OR REPLACE FUNCTION public.wa_get_business_billing(p_business_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  plan_slug text,
  plan_started_at timestamptz,
  plan_expires_at timestamptz,
  trial_expires_at timestamptz,
  scheduled_plan_slug text,
  scheduled_change_at timestamptz,
  activated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.email, b.plan_slug, b.plan_started_at, b.plan_expires_at,
         b.trial_expires_at, b.scheduled_plan_slug, b.scheduled_change_at, b.activated_at
  FROM public.wa_businesses b
  WHERE b.id = p_business_id
    AND (b.user_id = auth.uid() OR public.wa_is_admin());
$$;

-- ── 6. RPC: listado completo para el panel admin ─────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_admin_list_business_billing()
RETURNS TABLE (
  id uuid,
  email text,
  user_id uuid,
  plan_slug text,
  plan_started_at timestamptz,
  plan_expires_at timestamptz,
  trial_expires_at timestamptz,
  scheduled_plan_slug text,
  scheduled_change_at timestamptz,
  activated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.wa_is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT b.id, b.email, b.user_id, b.plan_slug, b.plan_started_at, b.plan_expires_at,
           b.trial_expires_at, b.scheduled_plan_slug, b.scheduled_change_at, b.activated_at
    FROM public.wa_businesses b
    ORDER BY b.created_at DESC;
END;
$$;

-- ── 7. RPC: plan efectivo para clientes finales (sin fechas ni facturación) ──
CREATE OR REPLACE FUNCTION public.wa_get_business_effective_plan(p_business_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.wa_get_effective_plan(b.plan_slug, b.plan_expires_at, b.trial_expires_at)
  FROM public.wa_businesses b
  WHERE b.id = p_business_id;
$$;

-- ── 8. Permisos de ejecución de las RPC ──────────────────────────────────────
REVOKE ALL ON FUNCTION public.wa_get_business_billing(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_admin_list_business_billing() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wa_get_business_effective_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_get_business_billing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_admin_list_business_billing() TO authenticated;
GRANT EXECUTE ON FUNCTION public.wa_get_business_effective_plan(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
