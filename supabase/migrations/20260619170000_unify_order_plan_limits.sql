-- ============================================================
-- Unificar límite mensual de pedidos entre JS (plans.js) y DB
--
-- Problema: wa_plan_max_orders_per_month() tenía starter=30,
-- mientras plans.js define starter=50. El trigger además tenía
-- el número 30 hardcodeado en el mensaje de error, causando un
-- texto incorrecto si el límite cambia en el futuro.
--
-- Esta migración:
--   1. Actualiza wa_plan_max_orders_per_month() → starter=50.
--   2. Reemplaza wa_orders_enforce_limit_trigger() con mensaje
--      dinámico usando el valor de la función (sin hardcodear).
-- ============================================================


-- ── 1. Actualizar wa_plan_max_orders_per_month() ──────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_plan_max_orders_per_month(p_plan TEXT)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN CASE lower(trim(coalesce(p_plan, '')))
    WHEN 'pro'      THEN NULL   -- ilimitado
    WHEN 'business' THEN NULL   -- ilimitado
    WHEN 'full'     THEN NULL   -- alias legacy de business
    ELSE 50                     -- starter + slugs desconocidos/null
  END;
END;
$$;


-- ── 2. Reemplazar trigger con mensaje dinámico ────────────────────────────────
--
-- El trigger anterior tenía "Tu plan Free permite 30 pedidos por mes"
-- hardcodeado. Ahora usa el valor de wa_plan_max_orders_per_month()
-- en el RAISE EXCEPTION para que el mensaje sea siempre correcto.

CREATE OR REPLACE FUNCTION public.wa_orders_enforce_limit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan  TEXT;
  v_exp   TIMESTAMPTZ;
  v_trial TIMESTAMPTZ;
  v_eff   TEXT;
  v_max   INT;
  v_count INT;
BEGIN
  SELECT plan_slug, plan_expires_at, trial_expires_at
    INTO v_plan, v_exp, v_trial
    FROM public.wa_businesses
   WHERE id = NEW.business_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  v_eff := public.wa_get_effective_plan(v_plan, v_exp, v_trial);
  v_max := public.wa_plan_max_orders_per_month(v_eff);

  -- NULL = ilimitado (pro / business)
  IF v_max IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*)
    INTO v_count
    FROM public.wa_orders
   WHERE business_id = NEW.business_id
     AND created_at >= date_trunc('month', now());

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED:Tu plan permite % pedidos por mes. Actualiza tu plan para recibir pedidos ilimitados.', v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


-- ── 3. Verificación inline ────────────────────────────────────────────────────

DO $$
DECLARE
  v_starter INT;
  v_pro     INT;
  v_biz     INT;
BEGIN
  v_starter := public.wa_plan_max_orders_per_month('starter');
  v_pro     := public.wa_plan_max_orders_per_month('pro');
  v_biz     := public.wa_plan_max_orders_per_month('business');

  IF v_starter IS DISTINCT FROM 50 THEN
    RAISE EXCEPTION 'wa_plan_max_orders_per_month: starter esperaba 50, obtuvo %', v_starter;
  END IF;
  IF v_pro IS NOT NULL THEN
    RAISE EXCEPTION 'wa_plan_max_orders_per_month: pro esperaba NULL, obtuvo %', v_pro;
  END IF;
  IF v_biz IS NOT NULL THEN
    RAISE EXCEPTION 'wa_plan_max_orders_per_month: business esperaba NULL, obtuvo %', v_biz;
  END IF;

  RAISE NOTICE 'wa_plan_max_orders_per_month OK: starter=%, pro=%, business=%',
    v_starter, COALESCE(v_pro::TEXT, 'NULL'), COALESCE(v_biz::TEXT, 'NULL');
END $$;
