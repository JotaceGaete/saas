-- Historial de envíos de prueba de emails desde el panel admin (no mezclar con wa_email_logs operativos).

-- Permite llamar wa_is_admin() desde el cliente autenticado (Edge Function con JWT de usuario).
GRANT EXECUTE ON FUNCTION public.wa_is_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS public.wa_admin_email_test_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_admin_email_test_logs_created_at
  ON public.wa_admin_email_test_logs (created_at DESC);

COMMENT ON TABLE public.wa_admin_email_test_logs IS
  'Registro de emails de prueba enviados desde Admin > Emails.';

ALTER TABLE public.wa_admin_email_test_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_admin_email_test_logs_admin_select" ON public.wa_admin_email_test_logs;
CREATE POLICY "wa_admin_email_test_logs_admin_select"
  ON public.wa_admin_email_test_logs
  FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- Inserción solo desde backend (Edge Function con service_role).
DROP POLICY IF EXISTS "wa_admin_email_test_logs_service_insert" ON public.wa_admin_email_test_logs;
CREATE POLICY "wa_admin_email_test_logs_service_insert"
  ON public.wa_admin_email_test_logs
  FOR INSERT TO service_role
  WITH CHECK (true);
