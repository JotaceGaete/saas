CREATE TABLE IF NOT EXISTS public.wa_business_daily_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  insight_date DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'UTC')::date),
  hallazgo TEXT NOT NULL,
  alerta TEXT NOT NULL,
  accion TEXT NOT NULL,
  prioridad TEXT NOT NULL CHECK (prioridad IN ('Alta', 'Media', 'Baja')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_wa_business_daily_ai_insights_business_date
  ON public.wa_business_daily_ai_insights (business_id, insight_date);

CREATE INDEX IF NOT EXISTS idx_wa_business_daily_ai_insights_business_id
  ON public.wa_business_daily_ai_insights (business_id);

CREATE INDEX IF NOT EXISTS idx_wa_business_daily_ai_insights_generated_at_desc
  ON public.wa_business_daily_ai_insights (generated_at DESC);

COMMENT ON TABLE public.wa_business_daily_ai_insights IS
  'Cache diario de insights IA por negocio. Máximo un insight por negocio y día.';

ALTER TABLE public.wa_business_daily_ai_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_business_daily_ai_insights_owner_select" ON public.wa_business_daily_ai_insights;
CREATE POLICY "wa_business_daily_ai_insights_owner_select"
  ON public.wa_business_daily_ai_insights
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.wa_businesses b
      WHERE b.id = wa_business_daily_ai_insights.business_id
        AND b.user_id = auth.uid()
    )
  );

-- Lock lógico diario por negocio para evitar generación duplicada simultánea.
CREATE OR REPLACE FUNCTION public.wa_try_daily_insight_lock(p_business_id uuid, p_insight_date date)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key bigint;
BEGIN
  -- Hash estable de "businessId|YYYY-MM-DD" para lock diario.
  v_key := hashtextextended(p_business_id::text || '|' || p_insight_date::text, 0);
  RETURN pg_try_advisory_lock(v_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_release_daily_insight_lock(p_business_id uuid, p_insight_date date)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key bigint;
BEGIN
  v_key := hashtextextended(p_business_id::text || '|' || p_insight_date::text, 0);
  RETURN pg_advisory_unlock(v_key);
END;
$$;

