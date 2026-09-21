-- SEGURIDAD-WALINKA-1D — separa datos bancarios/reservados de wa_businesses.
--
-- Hallazgo: wa_businesses tiene RLS habilitado con la policy
-- wa_businesses_public_read (SELECT, rol public, USING (true)) -- necesaria
-- para que cualquiera pueda ver el catálogo/perfil público de un negocio.
-- Pero RLS filtra FILAS, no COLUMNAS: las columnas bank_name,
-- bank_account_type, bank_account_number, bank_account_holder, bank_rut y
-- bank_email vivían en esa misma fila, así que quedaban estructuralmente
-- accesibles a anon -- y, como las policies de SELECT se OR-combinan, a
-- CUALQUIER usuario authenticated (no solo el dueño o un admin) -- vía un
-- select() explícito de esas columnas, aunque ningún código de la app las
-- pidiera. No se afirma que existan datos bancarios reales en producción
-- ni que haya habido una filtración -- este es un riesgo estructural.
--
-- Auditoría de consumidores (SEGURIDAD-WALINKA-1D, Fase 0): CERO
-- consumidores vivos de estos 6 campos en toda la app -- frontend, backend,
-- Edge Functions, RPCs, views, triggers -- confirmado por grep exhaustivo
-- sobre el código y sobre las 185 migraciones versionadas (la única otra
-- migración que las menciona es la que las creó,
-- 20260309200000_add_bank_fields.sql). Tampoco hay ni hubo un formulario/UI
-- que las escriba. El propio equipo ya lo había confirmado
-- independientemente en 20260815100000_referral_payout_requests.sql:
-- "nunca se reutilizan wa_businesses.bank_* (están muertas, sin uso en
-- toda la app, ancladas a wa_businesses en vez de a auth.users)".
--
-- Diseño: no se ejecuta un DROP COLUMN directo sin más. Esta sesión no
-- tiene acceso de lectura al proyecto Supabase de producción real de este
-- repo, así que no puede confirmarse que estas columnas estén vacías ahí
-- -- se prefiere no destruir datos potencialmente existentes. En su lugar:
--   1. Se crea wa_business_bank_accounts, tabla privada 1:1 con
--      wa_businesses, con RLS owner/admin (mismo patrón exacto que
--      wa_businesses_owner_all / wa_businesses_admin_select de
--      20260309142017_wa_catalog_app.sql / 20260309260000_admin_rls.sql)
--      -- sin policy pública, sin GRANT a anon.
--   2. Se migran (INSERT ... SELECT) las filas de wa_businesses que tengan
--      al menos un campo bank_* no nulo -- preserva cualquier dato
--      histórico real sin asumir que no existe.
--   3. Recién entonces se hace DROP de las 6 columnas en wa_businesses --
--      seguro porque Fase 0 confirmó cero consumidores vivos; el dato (si
--      existía) sigue existiendo, solo que reubicado y protegido.
--
-- No crea ningún formulario/UI nuevo -- fuera de alcance de esta
-- migración. La tabla queda lista (con el modelo de permisos correcto)
-- para si en el futuro se retoma esta funcionalidad.

CREATE TABLE public.wa_business_bank_accounts (
  business_id UUID PRIMARY KEY REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  bank_name TEXT,
  bank_account_type TEXT,
  bank_account_number TEXT,
  bank_account_holder TEXT,
  bank_rut TEXT,
  bank_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_business_bank_accounts IS
  'Datos bancarios/reservados de un negocio, separados de wa_businesses (que tiene lectura pública) -- SEGURIDAD-WALINKA-1D. Sin consumidor vivo en la app al momento de esta migración; existe para preservar cualquier dato histórico y dejar un lugar correctamente protegido si en el futuro se retoma esta funcionalidad.';

DROP TRIGGER IF EXISTS wa_business_bank_accounts_updated_at ON public.wa_business_bank_accounts;
CREATE TRIGGER wa_business_bank_accounts_updated_at
  BEFORE UPDATE ON public.wa_business_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

ALTER TABLE public.wa_business_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_business_bank_accounts_owner_all"
ON public.wa_business_bank_accounts FOR ALL TO authenticated
USING (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()));

CREATE POLICY "wa_business_bank_accounts_admin_select"
ON public.wa_business_bank_accounts FOR SELECT TO authenticated
USING (public.wa_is_admin());

REVOKE ALL ON public.wa_business_bank_accounts FROM PUBLIC, anon;

-- Preserva cualquier dato histórico real antes de retirar las columnas de
-- wa_businesses -- no asume que están vacías en producción. Si todas son
-- NULL (lo esperable dado que están huérfanas), este INSERT no copia nada.
INSERT INTO public.wa_business_bank_accounts (
  business_id, bank_name, bank_account_type, bank_account_number,
  bank_account_holder, bank_rut, bank_email, created_at, updated_at
)
SELECT id, bank_name, bank_account_type, bank_account_number,
       bank_account_holder, bank_rut, bank_email,
       COALESCE(created_at, now()), now()
FROM public.wa_businesses
WHERE bank_name IS NOT NULL
   OR bank_account_type IS NOT NULL
   OR bank_account_number IS NOT NULL
   OR bank_account_holder IS NOT NULL
   OR bank_rut IS NOT NULL
   OR bank_email IS NOT NULL;

ALTER TABLE public.wa_businesses
  DROP COLUMN bank_name,
  DROP COLUMN bank_account_type,
  DROP COLUMN bank_account_number,
  DROP COLUMN bank_account_holder,
  DROP COLUMN bank_rut,
  DROP COLUMN bank_email;

NOTIFY pgrst, 'reload schema';
