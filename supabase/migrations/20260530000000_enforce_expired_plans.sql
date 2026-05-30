-- Enforcement de planes vencidos desde backend/SQL.
-- Problema real: plan_expires_at o billing_subscriptions.current_period_ends_at vencieron
-- pero wa_businesses sigue en plan != 'starter' porque el cron no corrió.
--
-- Esta migración:
-- 1. Crea wa_enforce_expired_plans() que:
--    a) Marca billing_subscriptions como 'expired' cuando period terminó
--    b) Downgradea wa_businesses a starter cuando plan_expires_at venció
--       OR billing_subscription está expirada/cancelada
-- 2. Actualiza wa_apply_scheduled_plan_changes() para incluir enforcement de billing subs
-- 3. Programa pg_cron para correr wa_enforce_expired_plans() cada hora

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. wa_enforce_expired_plans
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_enforce_expired_plans()
RETURNS TABLE (business_id UUID, previous_plan TEXT, new_plan TEXT, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Paso 1: marcar billing_subscriptions como 'expired' cuando period_ends_at ya venció
  UPDATE public.billing_subscriptions
  SET
    status     = 'expired',
    updated_at = now()
  WHERE status IN ('active', 'past_due')
    AND current_period_ends_at IS NOT NULL
    AND current_period_ends_at <= now();

  -- Paso 2: downgrade wa_businesses a starter donde:
  --   (A) plan_expires_at venció directamente, O
  --   (B) la suscripción de billing asociada está expirada/cancelada con period vencido
  RETURN QUERY
  WITH expired_biz AS (
    SELECT DISTINCT
      b.id,
      b.plan_slug AS prev,
      CASE
        WHEN b.plan_expires_at IS NOT NULL AND b.plan_expires_at <= now()
          THEN 'plan_expires_at_exceeded'
        ELSE 'billing_subscription_expired'
      END AS reason
    FROM public.wa_businesses b
    WHERE b.plan_slug IN ('pro', 'business')
      AND (
        -- Caso A: plan_expires_at directo
        (b.plan_expires_at IS NOT NULL AND b.plan_expires_at <= now())
        OR
        -- Caso B: via billing_subscriptions expirada
        EXISTS (
          SELECT 1
          FROM public.billing_subscriptions bs
          WHERE bs.business_id = b.id
            AND bs.status IN ('expired', 'cancelled', 'past_due')
            AND bs.current_period_ends_at IS NOT NULL
            AND bs.current_period_ends_at <= now()
        )
      )
  ),
  updated AS (
    UPDATE public.wa_businesses b
    SET
      plan_slug           = 'starter',
      plan_expires_at     = NULL,
      trial_expires_at    = NULL,
      scheduled_plan_slug = NULL,
      scheduled_change_at = NULL,
      updated_at          = now()
    FROM expired_biz eb
    WHERE b.id = eb.id
    RETURNING b.id
  )
  SELECT u.id::UUID, eb.prev, 'starter'::TEXT, eb.reason
  FROM updated u
  JOIN expired_biz eb ON eb.id = u.id;
END;
$$;

COMMENT ON FUNCTION public.wa_enforce_expired_plans() IS
  'Enforcement de planes vencidos: marca billing_subscriptions expiradas y downgradea wa_businesses a starter cuando plan_expires_at o current_period_ends_at vencieron. Seguro para correr por cron cada hora.';

GRANT EXECUTE ON FUNCTION public.wa_enforce_expired_plans() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Actualizar wa_apply_scheduled_plan_changes para incluir enforcement
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_apply_scheduled_plan_changes()
RETURNS TABLE (business_id UUID, previous_plan TEXT, new_plan TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  -- Enforcement amplio: vencidos por plan_expires_at o por billing_subscription
  FOR v_rec IN
    SELECT * FROM public.wa_enforce_expired_plans()
  LOOP
    RETURN NEXT ROW(v_rec.business_id, v_rec.previous_plan, v_rec.new_plan)::RECORD;
  END LOOP;

  -- Caso B: Trial terminó y tenían PRO programado (compraron PRO durante trial)
  RETURN QUERY
  WITH to_apply_trial_ended AS (
    SELECT id, plan_slug AS prev_plan, scheduled_plan_slug AS new_plan, scheduled_change_at AS change_at
    FROM public.wa_businesses
    WHERE scheduled_plan_slug IS NOT NULL
      AND scheduled_change_at IS NOT NULL
      AND plan_expires_at IS NULL
      AND scheduled_change_at <= now()
      AND scheduled_plan_slug != 'starter'
  ),
  updated_b AS (
    UPDATE public.wa_businesses b
    SET
      plan_slug           = ta.new_plan,
      plan_expires_at     = ta.change_at + interval '30 days',
      trial_expires_at    = NULL,
      scheduled_plan_slug = NULL,
      scheduled_change_at = NULL,
      updated_at          = now()
    FROM to_apply_trial_ended ta
    WHERE b.id = ta.id
    RETURNING b.id
  )
  SELECT u.id::UUID, ta.prev_plan, ta.new_plan
  FROM updated_b u
  JOIN to_apply_trial_ended ta ON ta.id = u.id;
END;
$$;

COMMENT ON FUNCTION public.wa_apply_scheduled_plan_changes() IS
  'Aplica cambios de plan: (A) enforcement de expirados via wa_enforce_expired_plans; (B) activa plan pagado cuando scheduled_change_at <= now y plan_expires_at IS NULL (trial terminado).';

GRANT EXECUTE ON FUNCTION public.wa_apply_scheduled_plan_changes() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pg_cron: correr wa_enforce_expired_plans cada hora
--    (requiere pg_cron habilitado en el proyecto Supabase)
-- ─────────────────────────────────────────────────────────────────────────────
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Borrar job anterior si existe con el mismo nombre
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enforce-expired-plans-hourly') THEN
      PERFORM cron.unschedule('enforce-expired-plans-hourly');
    END IF;

    PERFORM cron.schedule(
      'enforce-expired-plans-hourly',
      '0 * * * *',
      'SELECT public.wa_enforce_expired_plans()'
    );

    RAISE NOTICE 'pg_cron job enforce-expired-plans-hourly configurado.';
  ELSE
    RAISE NOTICE 'pg_cron no está disponible. Llamar wa_enforce_expired_plans() manualmente o via edge function.';
  END IF;
END
$do$;
