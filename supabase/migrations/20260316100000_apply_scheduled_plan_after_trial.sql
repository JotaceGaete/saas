-- Aplicar cambios programados también cuando termina el trial (PRO comprado durante trial).
-- Caso 1: plan_expires_at venció → downgrade (lógica existente).
-- Caso 2: plan_expires_at IS NULL y scheduled_change_at <= now() → activar plan pagado (PRO) al fin del trial.

CREATE OR REPLACE FUNCTION public.wa_apply_scheduled_plan_changes()
RETURNS TABLE (business_id UUID, previous_plan TEXT, new_plan TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caso A: Plan pagado venció → aplicar scheduled (normalmente downgrade a starter)
  RETURN QUERY
  WITH to_apply_paid_expired AS (
    SELECT id, plan_slug AS prev_plan, scheduled_plan_slug AS new_plan
    FROM public.wa_businesses
    WHERE scheduled_plan_slug IS NOT NULL
      AND scheduled_change_at IS NOT NULL
      AND plan_expires_at IS NOT NULL
      AND plan_expires_at <= now()
  ),
  updated_a AS (
    UPDATE public.wa_businesses b
    SET
      plan_slug           = ta.new_plan,
      plan_expires_at     = NULL,
      trial_expires_at    = NULL,
      scheduled_plan_slug = NULL,
      scheduled_change_at = NULL
    FROM to_apply_paid_expired ta
    WHERE b.id = ta.id
    RETURNING b.id
  )
  SELECT u.id::UUID, ta.prev_plan, ta.new_plan
  FROM updated_a u
  JOIN to_apply_paid_expired ta ON ta.id = u.id;

  -- Caso B: Trial terminó y tenían PRO programado (compraron PRO durante trial)
  RETURN QUERY
  WITH to_apply_trial_ended AS (
    SELECT id, plan_slug AS prev_plan, scheduled_plan_slug AS new_plan, scheduled_change_at AS change_at
    FROM public.wa_businesses
    WHERE scheduled_plan_slug IS NOT NULL
      AND scheduled_change_at IS NOT NULL
      AND plan_expires_at IS NULL
      AND scheduled_change_at <= now()
  ),
  updated_b AS (
    UPDATE public.wa_businesses b
    SET
      plan_slug           = ta.new_plan,
      plan_expires_at     = ta.change_at + interval '30 days',
      trial_expires_at    = NULL,
      scheduled_plan_slug = NULL,
      scheduled_change_at = NULL
    FROM to_apply_trial_ended ta
    WHERE b.id = ta.id
    RETURNING b.id
  )
  SELECT u.id::UUID, ta.prev_plan, ta.new_plan
  FROM updated_b u
  JOIN to_apply_trial_ended ta ON ta.id = u.id;
END;
$$;

COMMENT ON FUNCTION public.wa_apply_scheduled_plan_changes() IS 'Aplica cambios programados: (A) downgrade cuando plan_expires_at venció; (B) activar plan pagado (ej. PRO) cuando scheduled_change_at <= now() y plan_expires_at IS NULL (trial terminado).';
