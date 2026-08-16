-- ============================================================
-- Affiliate Core — Fase C2: método de retiro persistente y cifrado.
--
-- No reabre ninguna migración anterior de Affiliate Core -- todas quedan
-- intactas. Este archivo crea infraestructura NUEVA y AISLADA:
--   - public.referral_payout_methods (nueva tabla)
--   - 3 RPCs self-service nuevas (GET/SET/DELETE)
--   - 1 helper interno de lectura de clave (Vault)
--
-- FUERA DE ALCANCE, a propósito (sin tocar en este archivo):
--   - wa_request_referral_payout() (Fase 5C): NO se toca. El formulario
--     actual de WalinkaRef sigue mandando su propio payout_method_snapshot
--     exactamente como hoy -- esta tabla todavía no se consulta desde
--     ningún flujo de solicitud de retiro. Esa integración es Fase C3,
--     explícitamente no autorizada en esta ronda.
--   - payout_method_snapshot, referral_payout_requests,
--     referral_payout_commissions: sin cambios de ningún tipo.
--   - wa_list_my_referral_payouts, wa_get_my_referral_stats,
--     wa_admin_list_referral_payouts, wa_admin_get_referral_payout_detail:
--     sin cambios -- ninguno lee ni sabe que esta tabla existe.
--   - Atribución, streaks, comisiones, maduración, refunds: intactos.
--   - WalinkaRef: cero cambios de frontend.
--
-- Mecanismo de cifrado verificado ANTES de escribir este archivo (no
-- inventado): pgcrypto ya está habilitado en este proyecto
-- (20260502162609_creator_platform_core.sql, aplicada y confirmada en
-- remoto) y Supabase Vault ya está en uso activo y probado en producción
-- para el mismo propósito general -- secretos server-side leídos
-- exclusivamente dentro de funciones SECURITY DEFINER, nunca expuestos a
-- ningún rol cliente (ver 20260317000001_cron_daily_summary.sql,
-- 20260318000000_welcome_email_on_signup.sql,
-- 20260402000000_email_idempotency_and_hardening.sql,
-- 20260405000000_email_queue_activation24h.sql -- las 4 leen
-- vault.decrypted_secrets exactamente así, ninguna otorga acceso a
-- anon/authenticated sobre el esquema vault). Este archivo reutiliza ese
-- mismo mecanismo probado, con un secreto nuevo y propio.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. referral_payout_methods — como máximo UN método por afiliado
--    (garantizado por PK, no por un UNIQUE aparte). Todo dato sensible
--    reutilizable se cifra -- holder_name incluido en esta fase, a
--    diferencia del payout_method_snapshot histórico (que no se toca).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.referral_payout_methods (
  user_id                     UUID          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Operacional / no sensible.
  country                     TEXT          NOT NULL,
  method_type                 TEXT          NOT NULL DEFAULT 'bank_transfer',
  bank_name                   TEXT          NOT NULL,
  account_type                 TEXT         NULL,
  alias                        TEXT         NULL,

  -- Sensible -- SOLO cifrado, nunca una versión plaintext simultánea en
  -- ninguna columna de esta tabla.
  holder_name_ciphertext        BYTEA       NOT NULL,
  tax_id_ciphertext              BYTEA      NOT NULL,
  account_number_ciphertext      BYTEA      NOT NULL,

  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT referral_payout_methods_country_check
    CHECK (country IN ('CL', 'AR')),
  CONSTRAINT referral_payout_methods_method_type_check
    CHECK (method_type = 'bank_transfer'),
  CONSTRAINT referral_payout_methods_account_type_check
    CHECK (account_type IS NULL OR account_type IN ('checking', 'savings', 'vista'))
);

COMMENT ON TABLE public.referral_payout_methods IS
  'Método de retiro persistente y reutilizable de un afiliado -- como máximo UNA fila por user_id (PK). Completamente desacoplada de referral_payout_requests.payout_method_snapshot (histórico, inmutable, nunca leído desde acá ni al revés). holder_name/tax_id/account_number viven SOLO cifrados (pgcrypto + clave de Vault) -- nunca una copia en texto plano en esta tabla. RPC-only desde el cliente: sin GRANT de tabla a ningún rol, ver sección de grants más abajo.';
COMMENT ON COLUMN public.referral_payout_methods.holder_name_ciphertext IS
  'Nombre del titular, cifrado con pgp_sym_encrypt() -- Fase C2 decidió cifrarlo también, a diferencia del payout_method_snapshot histórico donde queda en claro dentro del JSON del retiro ya inmutable.';
COMMENT ON COLUMN public.referral_payout_methods.tax_id_ciphertext IS
  'RUT (CL) o CUIT/CUIL (AR), cifrado con pgp_sym_encrypt(). Solo se desencripta dentro de funciones SECURITY DEFINER -- la lectura self-service (wa_get_my_referral_payout_method) devuelve exclusivamente una versión enmascarada.';
COMMENT ON COLUMN public.referral_payout_methods.account_number_ciphertext IS
  'Número de cuenta (CL) o CBU/CVU (AR), cifrado con pgp_sym_encrypt(). Mismo trato que tax_id_ciphertext: solo enmascarado en la lectura self-service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Seguridad de tabla desde el nacimiento: RLS habilitado, pero CERO
--    concesión a ningún rol cliente -- ni siquiera una policy de owner.
--    Mismo hardening de 2 capas ya aplicado a las tablas de payouts
--    (20260816100000 + 20260818100000): el REVOKE de tabla bloquea ANTES
--    de que RLS llegue a evaluarse; RLS habilitado + sin policies es la
--    segunda capa, redundante a propósito.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.referral_payout_methods ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.referral_payout_methods FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. updated_at (trigger estándar del repo, reutiliza wa_set_updated_at
--    ya existente desde Fase 5C).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER referral_payout_methods_updated_at
  BEFORE UPDATE ON public.referral_payout_methods
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. wa_referral_payout_method_encryption_key() — helper interno, mismo
--    trato que wa_validate_referral_payout_method_snapshot/
--    wa_mask_account_number/wa_referral_current_streak_months: sin GRANT a
--    ningún rol cliente. Lee el secreto UNA vez por invocación desde
--    vault.decrypted_secrets (mismo mecanismo ya probado en los 4 archivos
--    de email listados arriba). Si el secreto no está configurado, lanza
--    excepción -- NUNCA hay un valor por defecto ni un camino que continúe
--    sin cifrar (a diferencia del patrón de email, donde saltar el envío
--    es aceptable; acá continuar sin clave significaría persistir datos
--    bancarios en texto plano, inaceptable).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_referral_payout_method_encryption_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key TEXT;
BEGIN
  v_key := (
    SELECT decrypted_secret FROM vault.decrypted_secrets
    WHERE name = 'referral_payout_method_encryption_key'
    LIMIT 1
  );

  IF v_key IS NULL OR btrim(v_key) = '' THEN
    RAISE EXCEPTION 'REFERRAL_PAYOUT_METHOD_ENCRYPTION_KEY_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_referral_payout_method_encryption_key() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_referral_payout_method_encryption_key() IS
  'Lee el secreto de cifrado desde vault.decrypted_secrets (name=''referral_payout_method_encryption_key''). Lanza REFERRAL_PAYOUT_METHOD_ENCRYPTION_KEY_NOT_CONFIGURED si no está creado -- nunca continúa con un valor por defecto ni permite persistir texto plano como fallback. Helper interno: sin GRANT a ningún rol cliente, ver paso operativo pendiente en el comentario de cabecera de esta migración.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. wa_get_my_referral_payout_method() — lectura self-service enmascarada.
--    Reutiliza wa_mask_account_number() (Fase 5D.1, ya existe) tanto para
--    tax_id como para account_number -- mismo criterio de enmascarado
--    (últimos 4 caracteres visibles) para ambos, sin introducir una
--    segunda función de masking con un criterio distinto.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_get_my_referral_payout_method()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row     public.referral_payout_methods%ROWTYPE;
  v_key     TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row FROM public.referral_payout_methods WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_key := public.wa_referral_payout_method_encryption_key();

  RETURN jsonb_build_object(
    'country',              v_row.country,
    'methodType',            v_row.method_type,
    'holderName',            pgp_sym_decrypt(v_row.holder_name_ciphertext, v_key),
    'bankName',              v_row.bank_name,
    'accountType',           v_row.account_type,
    'maskedTaxId',           public.wa_mask_account_number(pgp_sym_decrypt(v_row.tax_id_ciphertext, v_key)),
    'maskedAccountNumber',   public.wa_mask_account_number(pgp_sym_decrypt(v_row.account_number_ciphertext, v_key)),
    'alias',                 v_row.alias,
    'updatedAt',             v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wa_get_my_referral_payout_method() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_get_my_referral_payout_method() TO authenticated;

COMMENT ON FUNCTION public.wa_get_my_referral_payout_method() IS
  'Lectura self-service del método de retiro del caller (auth.uid()). NULL si no hay método configurado. holderName se devuelve descifrado en claro (aceptado para el propio dueño); tax_id y account_number NUNCA completos -- solo maskedTaxId/maskedAccountNumber vía wa_mask_account_number(). Nunca ciphertext, nunca la clave, nunca datos de otro afiliado (filtra exclusivamente por auth.uid()). Restringida a authenticated.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. wa_set_my_referral_payout_method(...) — crea o reemplaza (upsert por
--    PK) el único método del caller. Validación server-side por país,
--    normalización, cifrado antes de escribir. Nunca acepta user_id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_set_my_referral_payout_method(
  p_country        TEXT,
  p_holder_name    TEXT,
  p_tax_id         TEXT,
  p_bank_name      TEXT,
  p_account_type   TEXT,
  p_account_number TEXT,
  p_alias          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id         UUID := auth.uid();
  v_country         TEXT := upper(btrim(COALESCE(p_country, '')));
  v_holder_name     TEXT := btrim(COALESCE(p_holder_name, ''));
  v_bank_name       TEXT := btrim(COALESCE(p_bank_name, ''));
  v_account_type    TEXT := NULLIF(btrim(COALESCE(p_account_type, '')), '');
  v_alias           TEXT := NULLIF(btrim(COALESCE(p_alias, '')), '');
  v_tax_id_norm     TEXT;
  v_account_number  TEXT;
  v_key             TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  IF v_country NOT IN ('CL', 'AR') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_country');
  END IF;

  IF v_holder_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_holder_name');
  END IF;

  IF v_bank_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_bank_name');
  END IF;

  -- Normalización + validación estructural, no absurdamente rígida --
  -- acepta puntos/espacios/guiones de formato humano, valida solo la
  -- FORMA final, nunca un dígito verificador módulo-11 (evitaría rechazar
  -- RUT legítimos por errores de digitación de terceros).
  IF v_country = 'CL' THEN
    v_tax_id_norm := upper(regexp_replace(COALESCE(p_tax_id, ''), '[.\s]', '', 'g'));
    IF v_tax_id_norm !~ '^[0-9]{7,8}-[0-9K]$' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_tax_id');
    END IF;

    IF v_account_type IS NULL OR v_account_type NOT IN ('checking', 'savings', 'vista') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_account_type');
    END IF;

    v_account_number := regexp_replace(COALESCE(p_account_number, ''), '[-\s]', '', 'g');
    IF length(v_account_number) < 4 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_account_number');
    END IF;
  ELSE -- AR
    v_tax_id_norm := regexp_replace(COALESCE(p_tax_id, ''), '[-\s]', '', 'g');
    IF v_tax_id_norm !~ '^[0-9]{11}$' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_tax_id');
    END IF;

    -- account_type no aplica a AR (CBU/CVU no tiene el mismo concepto que
    -- cuenta corriente/ahorro chilena) -- se acepta tal cual venga,
    -- normalmente NULL.

    v_account_number := regexp_replace(COALESCE(p_account_number, ''), '[-\s]', '', 'g');
    IF v_account_number !~ '^[0-9]{22}$' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_cbu');
    END IF;
  END IF;

  v_key := public.wa_referral_payout_method_encryption_key();

  INSERT INTO public.referral_payout_methods (
    user_id, country, method_type, bank_name, account_type, alias,
    holder_name_ciphertext, tax_id_ciphertext, account_number_ciphertext
  ) VALUES (
    v_user_id, v_country, 'bank_transfer', v_bank_name, v_account_type, v_alias,
    pgp_sym_encrypt(v_holder_name, v_key),
    pgp_sym_encrypt(v_tax_id_norm, v_key),
    pgp_sym_encrypt(v_account_number, v_key)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    country                   = EXCLUDED.country,
    method_type                = EXCLUDED.method_type,
    bank_name                  = EXCLUDED.bank_name,
    account_type                = EXCLUDED.account_type,
    alias                       = EXCLUDED.alias,
    holder_name_ciphertext       = EXCLUDED.holder_name_ciphertext,
    tax_id_ciphertext             = EXCLUDED.tax_id_ciphertext,
    account_number_ciphertext     = EXCLUDED.account_number_ciphertext;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.wa_set_my_referral_payout_method(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_set_my_referral_payout_method(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.wa_set_my_referral_payout_method(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Crea o reemplaza (upsert por PK user_id) el único método de retiro del caller (auth.uid() -- nunca acepta un user_id del cliente). Valida y normaliza server-side por país (CL: RUT 7-8 dígitos + guion + dígito/K, account_type en {checking,savings,vista}, account_number >=4 dígitos tras normalizar; AR: CUIT/CUIL 11 dígitos exactos, CBU/CVU 22 dígitos exactos). Cifra holder_name/tax_id/account_number con pgp_sym_encrypt() + clave de Vault ANTES de escribir -- nunca persiste texto plano. Restringida a authenticated. NO toca wa_request_referral_payout ni payout_method_snapshot -- Fase C2, integración diferida a Fase C3.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. wa_delete_my_referral_payout_method() — DELETE físico, aprobado para
--    C2 (nada referencia esta tabla por FK; payouts/comisiones/paid
--    periods/stats son completamente independientes).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_delete_my_referral_payout_method()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_deleted INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.referral_payout_methods WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.wa_delete_my_referral_payout_method() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_delete_my_referral_payout_method() TO authenticated;

COMMENT ON FUNCTION public.wa_delete_my_referral_payout_method() IS
  'Elimina físicamente (DELETE real, no soft-delete) el método de retiro del caller (auth.uid()). Afecta exclusivamente la fila propia -- WHERE user_id = auth.uid(), nunca un parámetro. No toca referral_payout_requests, referral_payout_commissions, referral_commissions, referral_paid_periods ni ninguna estadística: esta tabla no tiene ninguna FK entrante. Idempotente: eliminar cuando no existe método devuelve {ok:true, deleted:false}, nunca error. Restringida a authenticated.';

NOTIFY pgrst, 'reload schema';
