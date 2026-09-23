-- POINT-OAUTH-1: conexión OAuth independiente para Mercado Pago Point.
-- No modifica mp_connections/mp_oauth_states ni las RPC del Checkout Pro.
-- Reutiliza únicamente la misma clave de cifrado de Vault ya existente.

CREATE TABLE public.mp_point_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mercado_pago_point',
  provider_user_id TEXT,
  access_token_ciphertext BYTEA NOT NULL,
  refresh_token_ciphertext BYTEA,
  token_expires_at TIMESTAMPTZ,
  scope TEXT,
  live_mode BOOLEAN,
  status TEXT NOT NULL DEFAULT 'connected',
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mp_point_connections_business_unique UNIQUE (business_id),
  CONSTRAINT mp_point_connections_provider_check CHECK (provider = 'mercado_pago_point'),
  CONSTRAINT mp_point_connections_status_check CHECK (status IN ('connected','disconnected'))
);

CREATE TRIGGER mp_point_connections_updated_at
  BEFORE UPDATE ON public.mp_point_connections
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

ALTER TABLE public.mp_point_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mp_point_connections FROM PUBLIC, anon, authenticated;

CREATE TABLE public.mp_point_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash TEXT NOT NULL UNIQUE,
  business_id UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier_ciphertext BYTEA NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mp_point_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mp_point_oauth_states FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.wa_create_mp_point_oauth_state(
  p_business_id UUID, p_user_id UUID, p_state_hash TEXT,
  p_code_verifier TEXT, p_ttl_seconds INTEGER DEFAULT 600
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_key TEXT; v_id UUID;
BEGIN
  IF p_business_id IS NULL OR p_user_id IS NULL OR p_state_hash IS NULL OR p_code_verifier IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE='P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wa_businesses WHERE id=p_business_id AND user_id=p_user_id) THEN
    RAISE EXCEPTION 'BUSINESS_OWNERSHIP_MISMATCH' USING ERRCODE='P0001';
  END IF;
  v_key := public.wa_mp_connection_encryption_key();
  INSERT INTO public.mp_point_oauth_states(
    business_id,user_id,state_hash,code_verifier_ciphertext,expires_at
  ) VALUES (
    p_business_id,p_user_id,p_state_hash,
    pgp_sym_encrypt(p_code_verifier,v_key),
    now()+make_interval(secs=>p_ttl_seconds)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.wa_create_mp_point_oauth_state(UUID,UUID,TEXT,TEXT,INTEGER) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wa_consume_mp_point_oauth_state(p_state_hash TEXT)
RETURNS TABLE(business_id UUID,user_id UUID,code_verifier TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_row public.mp_point_oauth_states%ROWTYPE; v_key TEXT;
BEGIN
  UPDATE public.mp_point_oauth_states
  SET consumed_at=now()
  WHERE state_hash=p_state_hash AND consumed_at IS NULL AND expires_at>now()
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN; END IF;
  v_key := public.wa_mp_connection_encryption_key();
  RETURN QUERY SELECT v_row.business_id,v_row.user_id,
    pgp_sym_decrypt(v_row.code_verifier_ciphertext,v_key);
END;
$$;
REVOKE ALL ON FUNCTION public.wa_consume_mp_point_oauth_state(TEXT) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wa_upsert_mp_point_connection(
  p_business_id UUID, p_provider_user_id TEXT, p_access_token TEXT,
  p_refresh_token TEXT, p_expires_in_seconds INTEGER, p_scope TEXT, p_live_mode BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_key TEXT;
BEGIN
  IF p_business_id IS NULL OR p_access_token IS NULL OR btrim(p_access_token)='' THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE='P0001';
  END IF;
  v_key := public.wa_mp_connection_encryption_key();
  INSERT INTO public.mp_point_connections(
    business_id,provider_user_id,access_token_ciphertext,refresh_token_ciphertext,
    token_expires_at,scope,live_mode,status,connected_at,disconnected_at
  ) VALUES (
    p_business_id,p_provider_user_id,pgp_sym_encrypt(p_access_token,v_key),
    CASE WHEN p_refresh_token IS NULL THEN NULL ELSE pgp_sym_encrypt(p_refresh_token,v_key) END,
    CASE WHEN p_expires_in_seconds IS NULL THEN NULL ELSE now()+make_interval(secs=>p_expires_in_seconds) END,
    p_scope,p_live_mode,'connected',now(),NULL
  )
  ON CONFLICT (business_id) DO UPDATE SET
    provider_user_id=EXCLUDED.provider_user_id,
    access_token_ciphertext=EXCLUDED.access_token_ciphertext,
    refresh_token_ciphertext=EXCLUDED.refresh_token_ciphertext,
    token_expires_at=EXCLUDED.token_expires_at,
    scope=EXCLUDED.scope,live_mode=EXCLUDED.live_mode,status='connected',
    connected_at=now(),disconnected_at=NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.wa_upsert_mp_point_connection(UUID,TEXT,TEXT,TEXT,INTEGER,TEXT,BOOLEAN) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wa_get_mp_point_connection(p_business_id UUID)
RETURNS TABLE(access_token TEXT,token_expires_at TIMESTAMPTZ,provider_user_id TEXT,live_mode BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_key TEXT;
BEGIN
  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_PARAMETER' USING ERRCODE='P0001';
  END IF;
  v_key := public.wa_mp_connection_encryption_key();
  RETURN QUERY
  SELECT pgp_sym_decrypt(mc.access_token_ciphertext,v_key),mc.token_expires_at,
         mc.provider_user_id,mc.live_mode
  FROM public.mp_point_connections mc
  WHERE mc.business_id=p_business_id AND mc.status='connected';
END;
$$;
REVOKE ALL ON FUNCTION public.wa_get_mp_point_connection(UUID) FROM PUBLIC,anon,authenticated;

NOTIFY pgrst, 'reload schema';
