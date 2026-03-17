-- email_logs: registro de envíos de correo para auditoría y debugging.
-- Usado por send-email y send-daily-summary.

CREATE TABLE IF NOT EXISTS public.wa_email_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id       UUID        NULL REFERENCES public.wa_businesses(id) ON DELETE SET NULL,
  to_email          TEXT        NOT NULL,
  type              TEXT        NOT NULL,   -- daily_summary | weekly_summary | welcome | trial_expiring | payment_confirmed | plan_changed | password_recovery | new_order | custom
  status            TEXT        NOT NULL DEFAULT 'sent',  -- sent | failed
  provider_message_id TEXT     NULL,       -- Resend id, etc.
  error_message     TEXT        NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_email_logs_created_at ON public.wa_email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_email_logs_business_id ON public.wa_email_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_wa_email_logs_type ON public.wa_email_logs(type);

COMMENT ON TABLE public.wa_email_logs IS 'Log de correos enviados por Ventalink (resúmenes, notificaciones). No se envía email por pedido individual.';

ALTER TABLE public.wa_email_logs ENABLE ROW LEVEL SECURITY;

-- Solo service_role y admins pueden leer (backend; sin exposición al frontend normal)
DROP POLICY IF EXISTS "wa_email_logs_admin_select" ON public.wa_email_logs;
CREATE POLICY "wa_email_logs_admin_select"
  ON public.wa_email_logs FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- Inserts solo desde backend (Edge Functions con service_role)
DROP POLICY IF EXISTS "wa_email_logs_service_insert" ON public.wa_email_logs;
CREATE POLICY "wa_email_logs_service_insert"
  ON public.wa_email_logs FOR INSERT TO service_role
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
