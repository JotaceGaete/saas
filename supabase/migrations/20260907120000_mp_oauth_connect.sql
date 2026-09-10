-- ============================================================
-- MP-OAUTH-1: conexión OAuth de Mercado Pago por negocio.
--
-- Objetivo: cada wa_businesses puede conectar SU PROPIA cuenta de
-- Mercado Pago (Authorization Code + PKCE) para que, en una etapa
-- FUTURA (no en este archivo), sus propios clientes le paguen a él
-- directamente. Este archivo NO crea ningún checkout ni webhook de
-- cobro a clientes finales -- solo la conexión OAuth y su storage.
--
-- AISLAMIENTO explícito respecto al Mercado Pago YA EXISTENTE
-- (billing de plataforma -- Walinka cobrándole el plan SaaS al
-- negocio, en create-mp-preference/mp-webhook):
--   - provider = 'mercado_pago_connect', NUNCA 'mercado_pago' (ese
--     valor ya está en uso en wa_payments/billing_subscriptions para
--     el flujo de billing existente -- reutilizarlo mezclaría reportes
--     de dos flujos completamente distintos).
--   - Tablas nuevas y exclusivas de esta feature (mp_connections,
--     mp_oauth_states). No se toca wa_payments, wa_payment_events,
--     billing_subscriptions, ni ninguna función/trigger de esas tablas.
--   - MP_ACCESS_TOKEN_CL/MP_ACCESS_TOKEN_AR (tokens estáticos de
--     plataforma) no se leen ni se escriben desde este flujo -- las
--     Edge Functions de esta feature usan credenciales OAuth propias
--     (MP_CLIENT_ID/MP_CLIENT_SECRET, ver .env.example) para
--     autenticarse ante la API de OAuth de Mercado Pago.
--
-- Patrón de seguridad reutilizado (NO se inventa uno nuevo): el mismo
-- de 20260818110000_referral_payout_methods.sql --
--   - RLS habilitado + REVOKE ALL de PUBLIC/anon/authenticated (doble
--     capa: el REVOKE bloquea antes de que RLS se evalúe siquiera).
--   - Cero policy de SELECT/INSERT/UPDATE/DELETE para authenticated:
--     el browser NUNCA lee la tabla directamente, ni siquiera columnas
--     no sensibles -- todo pasa por la RPC self-service de abajo.
--   - service_role (usado exclusivamente por las Edge Functions nuevas
--     de esta feature, con el mismo patrón de admin client que ya usa
--     create-mp-preference/mp-webhook) no está en el REVOKE y conserva
--     BYPASSRLS + los grants de plataforma de Supabase -- por eso
--     puede leer/escribir estas tablas sin necesitar RPCs propias.
--   - Material sensible (access_token, refresh_token, code_verifier)
--     cifrado con pgp_sym_encrypt() + clave de Supabase Vault, mismo
--     mecanismo ya probado (pgcrypto habilitado desde
--     20260502162609_creator_platform_core.sql; Vault ya en uso activo
--     para email y para referral_payout_methods).
--
-- Clave de cifrado: secreto NUEVO y propio en Vault, nombre
-- 'mp_connection_encryption_key' -- deliberadamente DISTINTO del
-- secreto 'referral_payout_method_encryption_key' ya existente, para
-- no compartir una misma clave entre dos dominios de datos sensibles
-- no relacionados (datos bancarios de afiliados vs. tokens OAuth de
-- Mercado Pago) y así acotar el radio de impacto si alguno se
-- compromete. Mismo mecanismo de lectura (vault.decrypted_secrets),
-- clave distinta.
--
-- PASO OPERATIVO PENDIENTE (fuera de esta migración, no se puede hacer
-- desde SQL de migración): crear el secreto 'mp_connection_encryption_key'
-- en Supabase Vault (Dashboard > Project Settings > Vault, o
-- `select vault.create_secret('<valor>', 'mp_connection_encryption_key')`)
-- antes de que mp-oauth-callback pueda cifrar tokens en producción.
-- Sin ese secreto, wa_mp_connection_encryption_key() lanza excepción
-- (mismo comportamiento que wa_referral_payout_method_encryption_key:
-- nunca hay un valor por defecto ni un camino que persista texto plano).
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. mp_connections — una fila como máximo por negocio (UNIQUE business_id).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.mp_connections (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id               UUID        NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,

  provider                  TEXT        NOT NULL DEFAULT 'mercado_pago_connect',
  provider_user_id          TEXT,

  -- Sensible -- SOLO cifrado, nunca una versión plaintext simultánea.
  access_token_ciphertext   BYTEA       NOT NULL,
  refresh_token_ciphertext  BYTEA,

  token_expires_at          TIMESTAMPTZ,
  scope                     TEXT,
  live_mode                 BOOLEAN,

  status                    TEXT        NOT NULL DEFAULT 'connected',
  connected_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at           TIMESTAMPTZ,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mp_connections_business_id_unique UNIQUE (business_id),
  CONSTRAINT mp_connections_provider_check CHECK (provider = 'mercado_pago_connect'),
  CONSTRAINT mp_connections_status_check CHECK (status IN ('connected', 'disconnected'))
);

COMMENT ON TABLE public.mp_connections IS
  'MP-OAUTH-1: conexión OAuth de Mercado Pago de UN negocio (UNIQUE business_id). Completamente aislada del Mercado Pago de billing de plataforma (wa_payments/billing_subscriptions, provider=''mercado_pago''): esta tabla usa provider=''mercado_pago_connect'' a propósito para no mezclarse. access_token/refresh_token viven SOLO cifrados (pgcrypto + clave de Vault) -- nunca una copia en texto plano. RPC-only desde el cliente vía wa_get_my_mp_connection_status(): sin GRANT de tabla a ningún rol, ver REVOKE más abajo. Escritura exclusiva de las Edge Functions mp-oauth-start/mp-oauth-callback/mp-oauth-disconnect (service_role).';
COMMENT ON COLUMN public.mp_connections.access_token_ciphertext IS
  'Access token de la cuenta MP del negocio, cifrado con pgp_sym_encrypt(). Se descifra únicamente dentro de Edge Functions server-side (service_role) para llamar a la API de Mercado Pago -- nunca se expone al browser ni se devuelve en ninguna RPC.';
COMMENT ON COLUMN public.mp_connections.refresh_token_ciphertext IS
  'Refresh token de la cuenta MP del negocio, cifrado igual que access_token_ciphertext. Nullable porque MP-OAUTH-1 no implementa refresh automático (etapa futura) -- se persiste si la API lo devuelve, para no perderlo antes de esa etapa.';
COMMENT ON COLUMN public.mp_connections.live_mode IS
  'Copiado tal cual del campo live_mode que devuelve POST /oauth/token de Mercado Pago. NULL si la respuesta real de MP no lo incluye -- nunca inferido ni inventado.';

CREATE TRIGGER mp_connections_updated_at
  BEFORE UPDATE ON public.mp_connections
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

ALTER TABLE public.mp_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mp_connections FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. mp_oauth_states — intercambio OAuth de corta vida (TTL 10 min),
--    single-use. Solo se persiste el HASH del state, nunca el valor
--    raw (el valor raw viaja únicamente en la URL de autorización y en
--    el query param que Mercado Pago devuelve al callback).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.mp_oauth_states (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash                TEXT        NOT NULL UNIQUE,
  business_id               UUID        NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  user_id                   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Sensible -- el code_verifier debe recuperarse en claro para el
  -- intercambio con MP, por eso se cifra (no se hashea, a diferencia
  -- del state) con el mismo mecanismo que access_token_ciphertext.
  code_verifier_ciphertext  BYTEA       NOT NULL,

  expires_at                TIMESTAMPTZ NOT NULL,
  consumed_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mp_oauth_states IS
  'MP-OAUTH-1: estado efímero (TTL 10 min) del intercambio Authorization Code + PKCE con Mercado Pago. Solo persiste state_hash (SHA-256 del state real, nunca el valor raw) para lookup en el callback. Single-use: consumed_at se marca de forma atómica (UPDATE ... WHERE consumed_at IS NULL AND expires_at > now()) para impedir replay concurrente del mismo state. RPC-only/service_role-only: sin GRANT de tabla a ningún rol cliente. Sin cleanup automático en esta etapa -- filas expiradas o consumidas quedan como registro de auditoría; limpieza periódica es trabajo futuro, no bloquea MP-OAUTH-1.';
COMMENT ON COLUMN public.mp_oauth_states.state_hash IS
  'SHA-256 (hex) del valor state real generado por mp-oauth-start. El valor raw NUNCA se persiste -- solo viaja en la URL de autorización y vuelve como query param en el callback, donde se vuelve a hashear para el lookup.';

ALTER TABLE public.mp_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mp_oauth_states FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Clave de cifrado — mismo mecanismo que
--    wa_referral_payout_method_encryption_key() (20260818110000), con
--    un secreto de Vault propio y distinto (ver nota de cabecera).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_mp_connection_encryption_key()
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
    WHERE name = 'mp_connection_encryption_key'
    LIMIT 1
  );

  IF v_key IS NULL OR btrim(v_key) = '' THEN
    RAISE EXCEPTION 'MP_CONNECTION_ENCRYPTION_KEY_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_mp_connection_encryption_key() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_mp_connection_encryption_key() IS
  'Lee el secreto de cifrado desde vault.decrypted_secrets (name=''mp_connection_encryption_key'', distinto del secreto de referral_payout_methods a propósito). Lanza MP_CONNECTION_ENCRYPTION_KEY_NOT_CONFIGURED si no está creado -- nunca continúa con un valor por defecto ni permite persistir texto plano como fallback. Helper interno: sin GRANT a ningún rol cliente. Uso previsto: exclusivamente dentro de las Edge Functions de esta feature, vía RPC interna o llamada SQL directa con service_role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. wa_get_my_mp_connection_status() — única forma en que el browser
--    conoce el estado de la conexión. Deriva el negocio EXCLUSIVAMENTE
--    desde auth.uid() (mismo patrón que create-mp-preference), nunca
--    acepta un business_id como parámetro. Nunca devuelve tokens,
--    ciphertext, code_verifier ni ningún dato de otro negocio.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_get_my_mp_connection_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_business_id UUID;
  v_row         public.mp_connections%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  -- Mismo defensivo que getMyBusiness() (src/services/waBusinessService.js):
  -- wa_businesses.user_id no tiene UNIQUE, así que se toma el más antiguo.
  SELECT id INTO v_business_id
  FROM public.wa_businesses
  WHERE user_id = v_user_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RETURN jsonb_build_object('connected', false, 'status', 'no_business');
  END IF;

  SELECT * INTO v_row FROM public.mp_connections WHERE business_id = v_business_id;

  IF NOT FOUND OR v_row.status <> 'connected' THEN
    RETURN jsonb_build_object('connected', false, 'status', COALESCE(v_row.status, 'disconnected'));
  END IF;

  RETURN jsonb_build_object(
    'connected', true,
    'status', v_row.status,
    'providerUserId', v_row.provider_user_id,
    'connectedAt', v_row.connected_at,
    'liveMode', v_row.live_mode
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wa_get_my_mp_connection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_get_my_mp_connection_status() TO authenticated;

COMMENT ON FUNCTION public.wa_get_my_mp_connection_status() IS
  'Lectura self-service del estado de conexión MP del caller (auth.uid() -> wa_businesses.user_id -> wa_businesses.id -- nunca un business_id de parámetro). Devuelve exclusivamente {connected, status, providerUserId, connectedAt, liveMode} o {connected:false, status:''no_business''|''disconnected''}. NUNCA access_token, refresh_token, ciphertext, code_verifier ni client_secret. Restringida a authenticated; anon sin acceso.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPCs service_role-only para las Edge Functions de esta feature.
--
-- IMPORTANTE: pgp_sym_encrypt()/pgp_sym_decrypt() son funciones de pgcrypto
-- (formato OpenPGP simétrico) -- SOLO existen y se ejecutan dentro de
-- Postgres. Las Edge Functions (Deno) NUNCA intentan reimplementar este
-- cifrado con Web Crypto ni ninguna librería JS: todo el cifrado/descifrado
-- ocurre exclusivamente dentro de estas 3 RPCs, que reciben/devuelven
-- texto plano solo en el tramo service_role-a-Postgres (nunca al browser).
--
-- Ninguna de las 3 se GRANTea a `authenticated` -- a diferencia de
-- wa_get_my_mp_connection_status(), estas reciben business_id/user_id como
-- parámetro y por diseño NO derivan identidad de auth.uid() internamente
-- (ya la derivó la Edge Function llamante vía JWT antes de invocarlas). Si
-- se expusieran a `authenticated`, cualquier usuario podría pasar el
-- business_id de otro negocio -- por eso quedan accesibles únicamente por
-- el grant automático de Supabase a `service_role` (el mismo mecanismo por
-- el que wa_referral_payout_method_encryption_key() no necesita GRANT
-- explícito a service_role: Supabase otorga EXECUTE a service_role por
-- default en funciones nuevas del schema public; el REVOKE de abajo solo
-- quita PUBLIC/anon/authenticated, dejando ese default intacto).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_create_mp_oauth_state(
  p_business_id   UUID,
  p_user_id       UUID,
  p_state_hash    TEXT,
  p_code_verifier TEXT,
  p_ttl_seconds   INTEGER DEFAULT 600
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key TEXT;
  v_id  UUID;
BEGIN
  IF p_business_id IS NULL OR p_user_id IS NULL OR p_state_hash IS NULL OR p_code_verifier IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE = 'P0001';
  END IF;

  -- Defensa redundante (mismo estilo que create-mp-preference): el llamador
  -- ya resolvió business_id a partir de auth.uid()=p_user_id, pero se
  -- revalida acá también antes de persistir el estado del intercambio.
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses WHERE id = p_business_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'BUSINESS_OWNERSHIP_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  v_key := public.wa_mp_connection_encryption_key();

  INSERT INTO public.mp_oauth_states (business_id, user_id, state_hash, code_verifier_ciphertext, expires_at)
  VALUES (
    p_business_id,
    p_user_id,
    p_state_hash,
    pgp_sym_encrypt(p_code_verifier, v_key),
    now() + make_interval(secs => p_ttl_seconds)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_create_mp_oauth_state(UUID, UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_create_mp_oauth_state(UUID, UUID, TEXT, TEXT, INTEGER) IS
  'service_role-only. Cifra p_code_verifier con pgp_sym_encrypt() antes de persistir. Revalida business_id/user_id contra wa_businesses (defensa redundante a la resolución ya hecha en mp-oauth-start vía auth.uid()). TTL por defecto 600s (10 min). Nunca expuesta a authenticated/anon: acepta business_id/user_id como parámetro sin derivarlos de auth.uid(), así que exponerla permitiría a cualquier usuario crear un estado para el negocio de otro.';

CREATE OR REPLACE FUNCTION public.wa_consume_mp_oauth_state(p_state_hash TEXT)
RETURNS TABLE(business_id UUID, user_id UUID, code_verifier TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row public.mp_oauth_states%ROWTYPE;
  v_key TEXT;
BEGIN
  -- Consumo atómico: el UPDATE toma el lock de fila; una segunda ejecución
  -- concurrente sobre el MISMO state_hash espera el lock y, al re-evaluar
  -- el WHERE tras el commit de la primera, encuentra consumed_at ya no NULL
  -- -> 0 filas afectadas. Así se garantiza single-use sin race condition,
  -- sin necesitar un advisory lock aparte.
  UPDATE public.mp_oauth_states
  SET consumed_at = now()
  WHERE state_hash = p_state_hash
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN; -- 0 filas: inexistente, expirado o ya consumido -- indistinguible a propósito (no dar oráculo).
  END IF;

  v_key := public.wa_mp_connection_encryption_key();

  RETURN QUERY SELECT v_row.business_id, v_row.user_id, pgp_sym_decrypt(v_row.code_verifier_ciphertext, v_key);
END;
$$;

REVOKE ALL ON FUNCTION public.wa_consume_mp_oauth_state(TEXT) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_consume_mp_oauth_state(TEXT) IS
  'service_role-only. Marca el state como consumido de forma ATÓMICA (UPDATE condicionado, no un SELECT seguido de UPDATE) para impedir replay concurrente del mismo state_hash. Devuelve 0 filas si el state no existe, expiró o ya fue consumido -- el llamador (mp-oauth-callback) trata los 3 casos igual (rechazar), sin distinguir la razón exacta al cliente.';

CREATE OR REPLACE FUNCTION public.wa_upsert_mp_connection(
  p_business_id        UUID,
  p_provider_user_id   TEXT,
  p_access_token       TEXT,
  p_refresh_token      TEXT,
  p_expires_in_seconds INTEGER,
  p_scope              TEXT,
  p_live_mode          BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF p_business_id IS NULL OR p_access_token IS NULL OR btrim(p_access_token) = '' THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE = 'P0001';
  END IF;

  v_key := public.wa_mp_connection_encryption_key();

  INSERT INTO public.mp_connections (
    business_id, provider_user_id,
    access_token_ciphertext, refresh_token_ciphertext,
    token_expires_at, scope, live_mode,
    status, connected_at, disconnected_at
  ) VALUES (
    p_business_id, p_provider_user_id,
    pgp_sym_encrypt(p_access_token, v_key),
    CASE WHEN p_refresh_token IS NULL THEN NULL ELSE pgp_sym_encrypt(p_refresh_token, v_key) END,
    CASE WHEN p_expires_in_seconds IS NULL THEN NULL ELSE now() + make_interval(secs => p_expires_in_seconds) END,
    p_scope, p_live_mode,
    'connected', now(), NULL
  )
  ON CONFLICT (business_id) DO UPDATE SET
    provider_user_id         = EXCLUDED.provider_user_id,
    access_token_ciphertext  = EXCLUDED.access_token_ciphertext,
    refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
    token_expires_at         = EXCLUDED.token_expires_at,
    scope                    = EXCLUDED.scope,
    live_mode                = EXCLUDED.live_mode,
    status                   = 'connected',
    connected_at             = now(),
    disconnected_at          = NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_upsert_mp_connection(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_upsert_mp_connection(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) IS
  'service_role-only, llamada exclusivamente desde mp-oauth-callback tras un intercambio de código exitoso. Cifra access_token/refresh_token con pgp_sym_encrypt() antes de escribir -- nunca recibe ni persiste el llamador un plaintext fuera de esta función. Upsert por business_id (UNIQUE): reconectar reemplaza los tokens y reactiva status=''connected''. p_live_mode se persiste tal cual venga de la API de Mercado Pago -- NULL si la respuesta real no lo incluye, nunca inventado.';

NOTIFY pgrst, 'reload schema';
