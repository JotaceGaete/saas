-- Affiliate Core - Fase C0.1: close direct client reads of payout tables.
--
-- All supported affiliate/admin flows already use SECURITY DEFINER RPCs.
-- Keeping table SELECT for authenticated allowed callers to bypass the
-- masked self-service API and fetch payout_method_snapshot in full.

REVOKE SELECT
  ON TABLE public.referral_payout_requests
  FROM PUBLIC, anon, authenticated;

REVOKE SELECT
  ON TABLE public.referral_payout_commissions
  FROM PUBLIC, anon, authenticated;

-- Do not leave dormant client SELECT policies behind. Removing them makes
-- the intended boundary explicit and prevents a future accidental GRANT
-- from silently reopening access to complete banking snapshots.
DROP POLICY IF EXISTS "referral_payout_requests_owner_select"
  ON public.referral_payout_requests;
DROP POLICY IF EXISTS "referral_payout_requests_admin_select"
  ON public.referral_payout_requests;
DROP POLICY IF EXISTS "referral_payout_commissions_owner_select"
  ON public.referral_payout_commissions;
DROP POLICY IF EXISTS "referral_payout_commissions_admin_select"
  ON public.referral_payout_commissions;

COMMENT ON TABLE public.referral_payout_requests IS
  'Solicitud de retiro append-only. Sin acceso directo para anon/authenticated: afiliados y admins deben usar exclusivamente las RPCs controladas. payout_method_snapshot solo se expone completo mediante wa_admin_get_referral_payout_detail().';

COMMENT ON TABLE public.referral_payout_commissions IS
  'Relación retiro-comisión append-only. Sin acceso directo para anon/authenticated; toda lectura y escritura de cliente pasa por RPCs controladas.';

NOTIFY pgrst, 'reload schema';
