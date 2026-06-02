-- ============================================================
-- CRM Cash Sessions: apertura y cierre de caja diaria
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  date date NOT NULL,
  opened_by uuid REFERENCES auth.users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  initial_amount numeric(12,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_cash_sessions_business_status
  ON public.crm_cash_sessions(business_id, status);

CREATE INDEX IF NOT EXISTS idx_crm_cash_sessions_business_opened_at
  ON public.crm_cash_sessions(business_id, opened_at);

CREATE INDEX IF NOT EXISTS idx_crm_cash_sessions_business_date
  ON public.crm_cash_sessions(business_id, date);

ALTER TABLE public.crm_cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_cash_sessions_select" ON public.crm_cash_sessions;
CREATE POLICY "crm_cash_sessions_select"
ON public.crm_cash_sessions FOR SELECT TO authenticated
USING (
  business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "crm_cash_sessions_insert" ON public.crm_cash_sessions;
CREATE POLICY "crm_cash_sessions_insert"
ON public.crm_cash_sessions FOR INSERT TO authenticated
WITH CHECK (
  business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "crm_cash_sessions_update" ON public.crm_cash_sessions;
CREATE POLICY "crm_cash_sessions_update"
ON public.crm_cash_sessions FOR UPDATE TO authenticated
USING (
  business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "crm_cash_sessions_delete" ON public.crm_cash_sessions;
CREATE POLICY "crm_cash_sessions_delete"
ON public.crm_cash_sessions FOR DELETE TO authenticated
USING (
  business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  )
);
