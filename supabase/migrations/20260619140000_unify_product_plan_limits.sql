-- ============================================================
-- Unificar límites de productos entre JS (plans.js) y DB
--
-- Problema: wa_plan_max_products() tenía starter=10, pro=50,
-- mientras plans.js define starter=20, pro=100.
-- Además existía un trigger viejo (wa_products_enforce_limit_trigger)
-- con los valores desactualizados, en conflicto con el nuevo trigger
-- (trg_enforce_product_plan_limit) creado en 20260619120000.
--
-- Esta migración:
--   1. Actualiza wa_plan_max_products() con los valores canónicos de JS.
--   2. Elimina solo el trigger viejo, dejando activo el nuevo.
-- ============================================================


-- ── 1. Actualizar wa_plan_max_products() ─────────────────────────────────────
--
-- La función existía; solo se reemplaza el cuerpo con los valores correctos.
-- Otras funciones que la llaman (wa_check_product_limit, wa_get_plan_usage,
-- wa_products_enforce_limit_trigger) heredan automáticamente el nuevo límite.

CREATE OR REPLACE FUNCTION public.wa_plan_max_products(p_plan TEXT)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN CASE p_plan
    WHEN 'pro'      THEN 100
    WHEN 'business' THEN NULL   -- ilimitado
    WHEN 'full'     THEN NULL   -- alias legacy de business
    ELSE 20                     -- starter + cualquier slug desconocido/null
  END;
END;
$$;


-- ── 2. Eliminar el trigger viejo ──────────────────────────────────────────────
--
-- La función wa_products_enforce_limit_trigger() se MANTIENE porque
-- wa_check_product_limit() y wa_get_plan_usage() la referencian
-- indirectamente a través de wa_plan_max_products(). Solo se elimina
-- el trigger que la disparaba en BEFORE INSERT/UPDATE.

DROP TRIGGER IF EXISTS wa_products_enforce_limit_trigger ON public.wa_products;


-- ── 3. Verificación inline ────────────────────────────────────────────────────

DO $$
DECLARE
  v_starter INT;
  v_pro     INT;
  v_biz     INT;
BEGIN
  v_starter := public.wa_plan_max_products('starter');
  v_pro     := public.wa_plan_max_products('pro');
  v_biz     := public.wa_plan_max_products('business');

  IF v_starter IS DISTINCT FROM 20 THEN
    RAISE EXCEPTION 'wa_plan_max_products: starter esperaba 20, obtuvo %', v_starter;
  END IF;
  IF v_pro IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION 'wa_plan_max_products: pro esperaba 100, obtuvo %', v_pro;
  END IF;
  IF v_biz IS NOT NULL THEN
    RAISE EXCEPTION 'wa_plan_max_products: business esperaba NULL, obtuvo %', v_biz;
  END IF;

  RAISE NOTICE 'wa_plan_max_products OK: starter=%, pro=%, business=%',
    v_starter, v_pro, COALESCE(v_biz::TEXT, 'NULL');
END $$;
