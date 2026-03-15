-- ──────────────────────────────────────────────────────────────────────────────
-- Trial signup defaults: todos los negocios nuevos nacen con PRO trial 7 días.
-- Corrige el trigger y ajusta funciones que usan el mecanismo de downgrade.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Trigger: nuevos usuarios reciben PRO trial 7 días con TODOS los campos necesarios.
--    plan_expires_at = now() + 7 days  →  usado por wa_apply_scheduled_plan_changes.
--    scheduled_plan_slug = 'starter'   →  downgrade automático al vencer.
--    trial_expires_at                  →  columna de auditoría/display (misma fecha).
CREATE OR REPLACE FUNCTION public.wa_handle_new_user_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name         TEXT;
  v_whatsapp     TEXT;
  v_slug         TEXT;
  v_base_slug    TEXT;
  v_counter      INTEGER := 0;
  v_country_code TEXT;
  v_trial_end    TIMESTAMPTZ;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1),
    'Mi Negocio'
  );

  v_whatsapp     := COALESCE(NEW.raw_user_meta_data->>'whatsapp', '');
  v_country_code := upper(COALESCE(NEW.raw_user_meta_data->>'country_code', 'CL'));

  IF v_country_code NOT IN ('AR','BO','BR','CL','CO','CR','EC','GT','MX','PA','PE','PY','UY') THEN
    v_country_code := 'CL';
  END IF;

  v_base_slug := lower(regexp_replace(regexp_replace(v_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN v_base_slug := 'negocio'; END IF;
  v_slug := v_base_slug;

  WHILE EXISTS (SELECT 1 FROM public.wa_businesses WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug    := v_base_slug || '-' || v_counter;
  END LOOP;

  v_trial_end := now() + interval '7 days';

  INSERT INTO public.wa_businesses (
    user_id,
    name,
    whatsapp,
    email,
    country_code,
    currency,
    slug,
    is_active,
    plan_slug,
    plan_started_at,
    plan_expires_at,
    trial_expires_at,
    scheduled_plan_slug,
    scheduled_change_at
  ) VALUES (
    NEW.id,
    v_name,
    v_whatsapp,
    NEW.email,
    v_country_code,
    CASE WHEN v_country_code = 'AR' THEN 'ARS' ELSE 'CLP' END,
    v_slug,
    true,
    'pro',
    now(),
    v_trial_end,
    v_trial_end,
    'starter',
    v_trial_end
  ) ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'wa_handle_new_user_business failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 2. wa_apply_scheduled_plan_changes: también limpiar trial_expires_at al aplicar downgrade.
CREATE OR REPLACE FUNCTION public.wa_apply_scheduled_plan_changes()
RETURNS TABLE (business_id UUID, previous_plan TEXT, new_plan TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH to_apply AS (
    SELECT id, plan_slug AS prev_plan, scheduled_plan_slug AS new_plan
    FROM public.wa_businesses
    WHERE scheduled_plan_slug IS NOT NULL
      AND scheduled_change_at IS NOT NULL
      AND plan_expires_at IS NOT NULL
      AND plan_expires_at <= now()
  ),
  updated AS (
    UPDATE public.wa_businesses b
    SET
      plan_slug           = ta.new_plan,
      plan_expires_at     = NULL,
      trial_expires_at    = NULL,
      scheduled_plan_slug = NULL,
      scheduled_change_at = NULL
    FROM to_apply ta
    WHERE b.id = ta.id
    RETURNING b.id
  )
  SELECT u.id::UUID, ta.prev_plan, ta.new_plan
  FROM updated u
  JOIN to_apply ta ON ta.id = u.id;
END;
$$;

-- 3. wa_admin_change_plan: quitar 'control' del listado de planes válidos.
CREATE OR REPLACE FUNCTION public.wa_admin_change_plan(
  p_business_id UUID,
  p_new_plan_slug TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    biz RECORD;
  BEGIN
    IF NOT public.wa_is_admin() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    IF p_new_plan_slug IS NULL OR p_new_plan_slug NOT IN ('starter', 'pro', 'business') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_plan');
    END IF;

    SELECT id, plan_slug, plan_expires_at INTO biz
    FROM public.wa_businesses WHERE id = p_business_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'business_not_found');
    END IF;

    UPDATE public.wa_businesses
    SET plan_slug       = p_new_plan_slug,
        plan_expires_at = CASE WHEN p_new_plan_slug = 'starter' THEN NULL ELSE biz.plan_expires_at END,
        trial_expires_at = CASE WHEN p_new_plan_slug = 'starter' THEN NULL ELSE trial_expires_at END,
        scheduled_plan_slug = CASE WHEN p_new_plan_slug = 'starter' THEN NULL ELSE scheduled_plan_slug END,
        scheduled_change_at = CASE WHEN p_new_plan_slug = 'starter' THEN NULL ELSE scheduled_change_at END,
        updated_at      = now()
    WHERE id = p_business_id;

    INSERT INTO public.wa_admin_audit_log (admin_user_id, action, entity_type, entity_id, payload)
    VALUES (
      auth.uid(),
      'change_plan',
      'business',
      p_business_id,
      jsonb_build_object('previous_plan_slug', biz.plan_slug, 'new_plan_slug', p_new_plan_slug, 'reason', p_reason)
    );

    RETURN jsonb_build_object('ok', true, 'plan_slug', p_new_plan_slug);
  END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_apply_scheduled_plan_changes TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_admin_change_plan TO service_role;

NOTIFY pgrst, 'reload schema';
