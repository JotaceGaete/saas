-- User session tracking table
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.wa_businesses(id) ON DELETE SET NULL,
  login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_business_id_idx ON public.user_sessions(business_id);
CREATE INDEX IF NOT EXISTS user_sessions_login_at_idx ON public.user_sessions(login_at DESC);
CREATE INDEX IF NOT EXISTS user_sessions_last_seen_at_idx ON public.user_sessions(last_seen_at DESC);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
DROP POLICY IF EXISTS "user_sessions_own_read" ON public.user_sessions;
CREATE POLICY "user_sessions_own_read" ON public.user_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own sessions
DROP POLICY IF EXISTS "user_sessions_own_insert" ON public.user_sessions;
CREATE POLICY "user_sessions_own_insert" ON public.user_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions
DROP POLICY IF EXISTS "user_sessions_own_update" ON public.user_sessions;
CREATE POLICY "user_sessions_own_update" ON public.user_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Admin can see all sessions
DROP POLICY IF EXISTS "user_sessions_admin_read" ON public.user_sessions;
CREATE POLICY "user_sessions_admin_read" ON public.user_sessions
  FOR SELECT USING (
    (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- RPC: start_user_session
CREATE OR REPLACE FUNCTION public.start_user_session(
  p_business_id UUID DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_session_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_sessions (user_id, business_id, user_agent, login_at, last_seen_at)
  VALUES (v_user_id, p_business_id, p_user_agent, now(), now())
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

-- RPC: touch_user_session
CREATE OR REPLACE FUNCTION public.touch_user_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.user_sessions
  SET
    last_seen_at = now(),
    duration_seconds = EXTRACT(EPOCH FROM now() - login_at)::INTEGER
  WHERE id = p_session_id
    AND user_id = v_user_id
    AND logout_at IS NULL;
END;
$$;

-- RPC: end_user_session
CREATE OR REPLACE FUNCTION public.end_user_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.user_sessions
  SET
    logout_at = now(),
    last_seen_at = now(),
    duration_seconds = EXTRACT(EPOCH FROM now() - login_at)::INTEGER
  WHERE id = p_session_id
    AND user_id = v_user_id
    AND logout_at IS NULL;
END;
$$;

-- RPC: admin_get_users_with_session_stats
-- Returns user list with session stats for admin panel
CREATE OR REPLACE FUNCTION public.admin_get_users_with_session_stats()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  business_id UUID,
  business_name TEXT,
  plan_slug TEXT,
  created_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  sessions_30d BIGINT,
  total_duration_30d_seconds BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check admin role
  IF (auth.jwt() ->> 'role') != 'admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin'
    AND (auth.jwt() -> 'user_metadata' ->> 'role') != 'admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::TEXT,
    b.id AS business_id,
    b.name AS business_name,
    b.plan_slug::TEXT,
    u.created_at,
    MAX(s.last_seen_at) AS last_seen_at,
    COUNT(s.id) FILTER (WHERE s.login_at >= now() - INTERVAL '30 days') AS sessions_30d,
    COALESCE(SUM(s.duration_seconds) FILTER (WHERE s.login_at >= now() - INTERVAL '30 days'), 0)::BIGINT AS total_duration_30d_seconds
  FROM auth.users u
  LEFT JOIN public.wa_businesses b ON b.user_id = u.id
  LEFT JOIN public.user_sessions s ON s.user_id = u.id
  GROUP BY u.id, u.email, b.id, b.name, b.plan_slug, u.created_at;
END;
$$;

-- RPC: admin_get_user_session_detail
CREATE OR REPLACE FUNCTION public.admin_get_user_session_detail(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  login_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  logout_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  ip_address TEXT,
  user_agent TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (auth.jwt() ->> 'role') != 'admin'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin'
    AND (auth.jwt() -> 'user_metadata' ->> 'role') != 'admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT s.id, s.login_at, s.last_seen_at, s.logout_at, s.duration_seconds, s.ip_address, s.user_agent
  FROM public.user_sessions s
  WHERE s.user_id = p_user_id
  ORDER BY s.login_at DESC
  LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_user_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_user_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_user_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_users_with_session_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_session_detail(UUID) TO authenticated;
