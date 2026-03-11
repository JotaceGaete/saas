-- ============================================================
-- Cambio de plan: downgrades programados y pagos internos (prorrateo 0)
-- ============================================================

-- 1. wa_businesses: campos para downgrade programado
ALTER TABLE public.wa_businesses
  ADD COLUMN IF NOT EXISTS scheduled_plan_slug TEXT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_change_at  TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.wa_businesses.scheduled_plan_slug IS 'Plan a aplicar al vencer el actual (solo downgrades).';
COMMENT ON COLUMN public.wa_businesses.scheduled_change_at  IS 'Fecha en que se aplicará el cambio (normalmente = plan_expires_at).';

-- 2. wa_payments: permitir external_reference para pagos internos (ya existe metadata)
-- No cambiamos NOT NULL; usamos valor 'internal_proration' para esos registros.

-- 3. Función para aplicar downgrades programados cuando plan_expires_at ya venció
-- Puede ser llamada por cron (pg_cron) o por un Edge Function programado.
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

COMMENT ON FUNCTION public.wa_apply_scheduled_plan_changes() IS 'Aplica cambios de plan programados (downgrades) cuando plan_expires_at ya venció. Llamar por cron o manualmente.';

-- 4. Opcional: política para que solo el dueño vea scheduled_* (RLS ya filtra por user_id)
-- No hace falta policy adicional si solo el backend escribe con service_role.

NOTIFY pgrst, 'reload schema';
