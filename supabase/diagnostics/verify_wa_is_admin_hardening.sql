-- Verificación MANUAL de:
--   20260817100000_fix_wa_is_admin_app_metadata_only.sql
--   20260817110000_fix_admin_search_users_app_metadata_only.sql
--   20260817120000_fix_wa_admin_set_daily_message_wa_is_admin.sql
--   20260817130000_fix_wa_admin_get_site_visit_stats_wa_is_admin.sql
--   20260817140000_fix_user_sessions_admin_gates_wa_is_admin.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción.
-- Solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluidos
--                                   estos 5 fixes)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_wa_is_admin_hardening.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- wa_is_admin() lee auth.jwt() -> 'app_metadata'/'user_metadata', NO la
-- tabla auth.users -- por eso cada caso simula el JWT vía
-- set_config('request.jwt.claims', ...), mismo patrón exacto que
-- verify_referral_payout_requests.sql. Todo el script corre en una sola
-- transacción con ROLLBACK final -- nada persiste, nada toca producción.

BEGIN;

-- SOLO DIAGNÓSTICO, se revierte con el ROLLBACK final: 20260604000000_
-- user_sessions_tracking.sql nunca otorgó GRANT SELECT a authenticated
-- sobre user_sessions (las 4 policies dependen de que ese grant exista
-- para que RLS llegue a evaluarse -- sin él, "permission denied" ocurre
-- ANTES de mirar ninguna policy, igual que con las tablas financieras de
-- payouts en fases anteriores). Se otorga acá exclusivamente para poder
-- ejercitar la policy user_sessions_admin_read directamente en los casos
-- 14/15 -- no se toca ninguna migración. Si este grant falta también en
-- producción, la policy es inalcanzable vía PostgREST (más restrictivo de
-- lo que aparenta, no una vulnerabilidad) -- repórtalo aparte para
-- confirmar con una consulta real de grants si hace falta certeza.
GRANT SELECT ON TABLE public.user_sessions TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: usuarios fixture + una fila de referral_attributions ajena (para
-- probar visibilidad cruzada vía RLS admin_select en los casos 5/8).
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'admin-hardening-none@example.test',     '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'admin-hardening-usermeta@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'admin-hardening-appmeta@example.test',  '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c4', 'admin-hardening-mixed@example.test',    '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c5', 'admin-hardening-owner@example.test',    '{}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c6', 'admin-hardening-referred@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated');

-- Fila ajena (dueña: c5/c6, ninguno de los "admins" bajo prueba) para
-- verificar visibilidad cruzada vía la policy referral_attributions_admin_select.
DO $$
DECLARE
  v_code_id UUID;
BEGIN
  INSERT INTO public.referral_codes (user_id, code, display_name)
  VALUES ('00000000-0000-0000-0000-0000000000c5', 'admin-hardening-code', 'Owner de Test')
  RETURNING id INTO v_code_id;

  INSERT INTO public.referral_attributions (referred_user_id, referrer_user_id, referral_code_id, code_snapshot, status)
  VALUES ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000c5', v_code_id, 'admin-hardening-code', 'qualified');
END $$;

-- Fila de user_sessions ajena (dueña: c5, ninguno de los "admins" bajo
-- prueba) con un ip_address de test (rango de documentación TEST-NET-3,
-- RFC 5737 -- nunca una IP real) para probar visibilidad cruzada vía la
-- policy user_sessions_admin_read y admin_get_user_session_detail().
INSERT INTO public.user_sessions (user_id, login_at, last_seen_at, ip_address, user_agent)
VALUES ('00000000-0000-0000-0000-0000000000c5', now(), now(), '203.0.113.42', 'admin-hardening-test-agent');

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 1 — usuario sin ningún metadata de rol -> wa_is_admin() = false.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000c1','role','authenticated')::text, true);

DO $$
BEGIN
  IF public.wa_is_admin() IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL caso 1 — usuario sin metadata debía dar wa_is_admin()=false';
  END IF;
  RAISE NOTICE 'OK: caso 1 — sin metadata -> wa_is_admin() = false';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 2 (REGRESIÓN CENTRAL) — solo user_metadata.role='admin', sin
-- app_metadata -> wa_is_admin() = false. Este es el escenario de
-- auto-escalación que el fix cierra: user_metadata es editable por el
-- propio usuario vía supabase.auth.updateUser(), sin privilegios especiales.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c2','role','authenticated',
  'user_metadata', json_build_object('role','admin')
)::text, true);

DO $$
BEGIN
  IF public.wa_is_admin() IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL caso 2 — user_metadata.role=admin (sin app_metadata) NO debía otorgar admin';
  END IF;
  RAISE NOTICE 'OK: caso 2 — solo user_metadata.role=admin -> wa_is_admin() = false (auto-escalación bloqueada)';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 3 — solo app_metadata.role='admin' -> wa_is_admin() = true.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c3','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
BEGIN
  IF public.wa_is_admin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL caso 3 — app_metadata.role=admin debía dar wa_is_admin()=true';
  END IF;
  RAISE NOTICE 'OK: caso 3 — app_metadata.role=admin -> wa_is_admin() = true';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 4 — ambos presentes: app_metadata.role NO admin + user_metadata.role
-- SÍ admin -> false. Confirma que app_metadata manda incluso cuando está
-- presente pero no dice 'admin' -- nunca cae de vuelta a user_metadata.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c4','role','authenticated',
  'app_metadata', json_build_object('role','user'),
  'user_metadata', json_build_object('role','admin')
)::text, true);

DO $$
BEGIN
  IF public.wa_is_admin() IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL caso 4 — app_metadata.role=user + user_metadata.role=admin debía dar false (app_metadata manda, sin fallback)';
  END IF;
  RAISE NOTICE 'OK: caso 4 — app_metadata no-admin + user_metadata admin -> wa_is_admin() = false';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 5 — el admin real (app_metadata.role=admin) conserva acceso: puede
-- ver, vía referral_attributions_admin_select, la fila ajena de c5/c6.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c3','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.referral_attributions
  WHERE referrer_user_id = '00000000-0000-0000-0000-0000000000c5';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL caso 5 — admin real (app_metadata) debía poder ver la atribución ajena vía referral_attributions_admin_select, vio % filas', v_count;
  END IF;
  RAISE NOTICE 'OK: caso 5 — admin real conserva acceso de lectura cruzada vía RLS admin_select';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 6 — usuario con SOLO user_metadata admin invoca una RPC admin de
-- payouts real -> forbidden, nunca datos reales.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c2','role','authenticated',
  'user_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.wa_admin_list_referral_payouts(NULL, 30, 0);
  IF (v_result->>'ok')::boolean IS DISTINCT FROM false OR (v_result->>'error') IS DISTINCT FROM 'forbidden' THEN
    RAISE EXCEPTION 'FAIL caso 6 — usuario con solo user_metadata admin debía recibir {ok:false,error:forbidden} de wa_admin_list_referral_payouts, recibió: %', v_result;
  END IF;
  RAISE NOTICE 'OK: caso 6 — solo user_metadata admin -> wa_admin_list_referral_payouts() = forbidden';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 7 — usuario con app_metadata admin SÍ pasa el gate de la misma RPC.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c3','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.wa_admin_list_referral_payouts(NULL, 30, 0);
  IF (v_result->>'ok')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL caso 7 — usuario con app_metadata admin debía pasar el gate de wa_admin_list_referral_payouts, recibió: %', v_result;
  END IF;
  RAISE NOTICE 'OK: caso 7 — app_metadata admin -> wa_admin_list_referral_payouts() pasa el gate (ok:true)';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 8 — la misma RLS admin_select sigue bloqueando al usuario con solo
-- user_metadata admin (complemento del caso 5: confirma ambos lados).
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c2','role','authenticated',
  'user_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.referral_attributions
  WHERE referrer_user_id = '00000000-0000-0000-0000-0000000000c5';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL caso 8 — usuario con solo user_metadata admin NO debía ver la atribución ajena vía RLS, vio % filas', v_count;
  END IF;
  RAISE NOTICE 'OK: caso 8 — solo user_metadata admin -> RLS admin_select sigue bloqueando (0 filas visibles)';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 9 (bonus) — admin_search_users() (gate independiente, no reutiliza
-- wa_is_admin()) también rechaza solo-user_metadata y acepta app_metadata.
--
-- A diferencia de wa_is_admin() (que lee auth.jwt()), admin_search_users()
-- lee raw_app_meta_data directamente de la TABLA auth.users -- por eso acá
-- hace falta un UPDATE real sobre la fila de c2/c3, no solo simular el JWT
-- vía set_config. En producción ambas fuentes están sincronizadas (el JWT
-- se emite a partir de esas mismas columnas), este UPDATE solo replica esa
-- realidad en el fixture local.
-- ══════════════════════════════════════════════════════════════════════════

UPDATE auth.users SET raw_user_meta_data = '{"role":"admin"}'::jsonb
  WHERE id = '00000000-0000-0000-0000-0000000000c2';
UPDATE auth.users SET raw_app_meta_data = '{"role":"admin"}'::jsonb
  WHERE id = '00000000-0000-0000-0000-0000000000c3';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c2','role','authenticated',
  'user_metadata', json_build_object('role','admin')
)::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM public.admin_search_users('', 10, 0);
    RAISE EXCEPTION 'FAIL caso 9a — admin_search_users() con solo user_metadata admin debía lanzar Forbidden';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Forbidden%' THEN
        RAISE EXCEPTION 'FAIL caso 9a — excepción inesperada: %', SQLERRM;
      END IF;
      RAISE NOTICE 'OK: caso 9a — admin_search_users() con solo user_metadata admin -> Forbidden';
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c3','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.admin_search_users('', 10, 0);
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'FAIL caso 9b — admin_search_users() con app_metadata admin no debía lanzar excepción';
  END IF;
  RAISE NOTICE 'OK: caso 9b — admin_search_users() con app_metadata admin pasa el gate';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos 10-11 — wa_admin_set_daily_message() (20260817120000).
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c2','role','authenticated',
  'user_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.wa_admin_set_daily_message('mensaje-hostil');
  IF (v_result->>'error') IS DISTINCT FROM 'forbidden' THEN
    RAISE EXCEPTION 'FAIL caso 10 — solo user_metadata admin debía recibir forbidden de wa_admin_set_daily_message, recibió: %', v_result;
  END IF;
  -- wa_admin_settings no tiene GRANT directo a authenticated (solo acceso
  -- vía RPC SECURITY DEFINER) -- se verifica la no-escritura a través de
  -- wa_get_daily_message(), la RPC pública de lectura.
  IF public.wa_get_daily_message() = 'mensaje-hostil' THEN
    RAISE EXCEPTION 'FAIL caso 10 — el mensaje hostil NO debía escribirse';
  END IF;
  RAISE NOTICE 'OK: caso 10 — solo user_metadata admin -> wa_admin_set_daily_message() = forbidden, nada escrito';
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c3','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.wa_admin_set_daily_message('mensaje-legitimo');
  IF (v_result->>'ok')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL caso 11 — app_metadata admin debía poder escribir el mensaje, recibió: %', v_result;
  END IF;
  IF public.wa_get_daily_message() IS DISTINCT FROM 'mensaje-legitimo' THEN
    RAISE EXCEPTION 'FAIL caso 11 — el mensaje legítimo debía quedar escrito';
  END IF;
  RAISE NOTICE 'OK: caso 11 — app_metadata admin -> wa_admin_set_daily_message() escribe correctamente';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos 12-13 — wa_admin_get_site_visit_stats() (20260817130000).
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c2','role','authenticated',
  'user_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.wa_admin_get_site_visit_stats();
  IF (v_result->>'error') IS DISTINCT FROM 'forbidden' THEN
    RAISE EXCEPTION 'FAIL caso 12 — solo user_metadata admin debía recibir forbidden de wa_admin_get_site_visit_stats, recibió: %', v_result;
  END IF;
  RAISE NOTICE 'OK: caso 12 — solo user_metadata admin -> wa_admin_get_site_visit_stats() = forbidden';
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c3','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.wa_admin_get_site_visit_stats();
  IF v_result ? 'error' THEN
    RAISE EXCEPTION 'FAIL caso 13 — app_metadata admin no debía recibir error de wa_admin_get_site_visit_stats, recibió: %', v_result;
  END IF;
  IF NOT (v_result ? 'total30d') THEN
    RAISE EXCEPTION 'FAIL caso 13 — respuesta real esperada con total30d, recibió: %', v_result;
  END IF;
  RAISE NOTICE 'OK: caso 13 — app_metadata admin -> wa_admin_get_site_visit_stats() pasa el gate';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos 14-15 — RLS user_sessions_admin_read (20260817140000). c5 es dueño
-- de una sesión ajena con ip_address de test.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c2','role','authenticated',
  'user_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.user_sessions
  WHERE user_id = '00000000-0000-0000-0000-0000000000c5';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL caso 14 — solo user_metadata admin NO debía ver sesiones ajenas (ni su IP), vio % filas', v_count;
  END IF;
  RAISE NOTICE 'OK: caso 14 — solo user_metadata admin -> 0 sesiones ajenas visibles (IP protegida)';
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c3','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_ip TEXT;
BEGIN
  SELECT ip_address INTO v_ip
  FROM public.user_sessions
  WHERE user_id = '00000000-0000-0000-0000-0000000000c5';

  IF v_ip IS DISTINCT FROM '203.0.113.42' THEN
    RAISE EXCEPTION 'FAIL caso 15 — app_metadata admin debía ver la sesión ajena vía RLS (ip_address=203.0.113.42), obtuvo: %', v_ip;
  END IF;
  RAISE NOTICE 'OK: caso 15 — app_metadata admin conserva acceso de lectura cruzada vía RLS (ip_address visible)';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos 16-17 — admin_get_users_with_session_stats() (20260817140000).
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c2','role','authenticated',
  'user_metadata', json_build_object('role','admin')
)::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.admin_get_users_with_session_stats();
    RAISE EXCEPTION 'FAIL caso 16 — solo user_metadata admin debía recibir Not authorized de admin_get_users_with_session_stats';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Not authorized%' THEN
        RAISE EXCEPTION 'FAIL caso 16 — excepción inesperada: %', SQLERRM;
      END IF;
      RAISE NOTICE 'OK: caso 16 — solo user_metadata admin -> admin_get_users_with_session_stats() = Not authorized';
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c3','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.admin_get_users_with_session_stats();
  IF v_count < 1 THEN
    RAISE EXCEPTION 'FAIL caso 17 — app_metadata admin debía poder listar usuarios con estadísticas de sesión';
  END IF;
  RAISE NOTICE 'OK: caso 17 — app_metadata admin -> admin_get_users_with_session_stats() pasa el gate (% filas)', v_count;
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Casos 18-19 — admin_get_user_session_detail() (20260817140000). Es el
-- caso más sensible: expone ip_address de un usuario puntual.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c2','role','authenticated',
  'user_metadata', json_build_object('role','admin')
)::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.admin_get_user_session_detail('00000000-0000-0000-0000-0000000000c5');
    RAISE EXCEPTION 'FAIL caso 18 — solo user_metadata admin debía recibir Not authorized de admin_get_user_session_detail (nunca la IP ajena)';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Not authorized%' THEN
        RAISE EXCEPTION 'FAIL caso 18 — excepción inesperada: %', SQLERRM;
      END IF;
      RAISE NOTICE 'OK: caso 18 — solo user_metadata admin -> admin_get_user_session_detail() = Not authorized, IP nunca expuesta';
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-0000000000c3','role','authenticated',
  'app_metadata', json_build_object('role','admin')
)::text, true);

DO $$
DECLARE
  v_ip TEXT;
BEGIN
  SELECT ip_address INTO v_ip
  FROM public.admin_get_user_session_detail('00000000-0000-0000-0000-0000000000c5')
  LIMIT 1;

  IF v_ip IS DISTINCT FROM '203.0.113.42' THEN
    RAISE EXCEPTION 'FAIL caso 19 — app_metadata admin debía obtener ip_address=203.0.113.42 de admin_get_user_session_detail, obtuvo: %', v_ip;
  END IF;
  RAISE NOTICE 'OK: caso 19 — app_metadata admin -> admin_get_user_session_detail() pasa el gate (ip_address visible legítimamente)';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TODOS LOS CASOS DEL HARDENING DE wa_is_admin()/admin_search_users()/wa_admin_set_daily_message()/wa_admin_get_site_visit_stats()/user_sessions PASARON.';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
