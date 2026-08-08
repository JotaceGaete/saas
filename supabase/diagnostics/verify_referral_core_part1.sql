-- Verificación MANUAL de 20260808100000_referral_core_part1.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción (project-ref hxxdketymcntadffmajf)
-- — solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluida Referral Core Parte 1)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_referral_core_part1.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- Cubre: creación/idempotencia de código, resolución pública segura, creación
-- de atribución, idempotencia de atribución, auto-referido, duplicado de
-- persona, ownership enforcement, validación server-side de click_at (futuro,
-- expirado, válido), que window_days ya no es un parámetro invocable, que un
-- segundo código no reemplaza una atribución existente, creación de comisión,
-- idempotencia de comisión (por provider_payment_ref y por
-- first_payment-único-por-atribución), y que ningún cliente pueda escribir
-- directamente ni invocar la función de comisión.
--
-- Simula usuarios autenticados vía request.jwt.claim(s) + SET LOCAL ROLE,
-- que es el patrón estándar de Supabase/PostgREST para testear RLS con SQL
-- puro (auth.uid() lee esos GUCs). SET LOCAL solo dura mientras no se haga
-- RESET ROLE / termine la transacción — todo el script corre en una sola
-- transacción con ROLLBACK final.

BEGIN;

-- ── Setup: 7 usuarios/negocios reales (vía INSERT en auth.users, dispara el
--    trigger real de R1 sin tocarlo) ─────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'referrer-test@example.test',  '{"name": "Negocio Referidor"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'referred-test@example.test',  '{"name": "Negocio Referido"}'::jsonb,  now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'dup-user-test@example.test',  '{"name": "Negocio Email Duplicado"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'observer-test@example.test',  '{"name": "Negocio Ajeno"}'::jsonb,     now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a5', 'click-test-test@example.test','{"name": "Negocio Click Test"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a6', 'legacy-param-test@example.test','{"name": "Negocio Parametro Legado"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a7', 'second-referrer-test@example.test','{"name": "Segundo Referidor"}'::jsonb, now(), 'authenticated', 'authenticated');

DO $$
DECLARE
  v_referrer_biz UUID;
  v_referred_biz UUID;
  v_dup_biz      UUID;
  v_observer_biz UUID;
  v_click_biz    UUID;
  v_legacy_biz   UUID;
  v_second_referrer_biz UUID;
BEGIN
  SELECT id INTO v_referrer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
  SELECT id INTO v_referred_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a2';
  SELECT id INTO v_dup_biz      FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a3';
  SELECT id INTO v_observer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a4';
  SELECT id INTO v_click_biz    FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a5';
  SELECT id INTO v_legacy_biz   FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a6';
  SELECT id INTO v_second_referrer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a7';

  ASSERT v_referrer_biz IS NOT NULL, 'FAIL: setup — negocio referidor no se creó (trigger R1 roto?)';
  ASSERT v_referred_biz IS NOT NULL, 'FAIL: setup — negocio referido no se creó';
  ASSERT v_dup_biz      IS NOT NULL, 'FAIL: setup — negocio email-duplicado no se creó';
  ASSERT v_observer_biz IS NOT NULL, 'FAIL: setup — negocio observador no se creó';
  ASSERT v_click_biz    IS NOT NULL, 'FAIL: setup — negocio click-test no se creó';
  ASSERT v_legacy_biz   IS NOT NULL, 'FAIL: setup — negocio parametro-legado no se creó';
  ASSERT v_second_referrer_biz IS NOT NULL, 'FAIL: setup — negocio segundo-referidor no se creó';

  -- Simula "misma persona, distinta cuenta": el email de contacto del negocio
  -- D coincide con el del referidor (auth.users.email real sigue siendo único).
  UPDATE public.wa_businesses SET email = 'referrer-test@example.test' WHERE id = v_dup_biz;

  RAISE NOTICE 'OK: setup — 7 negocios creados via trigger R1 real';
END $$;

-- ── Caso 1: wa_get_or_create_my_referral_code() — creación + idempotencia ──

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);

DO $$
DECLARE
  v_code_1 TEXT;
  v_code_2 TEXT;
BEGIN
  SELECT public.wa_get_or_create_my_referral_code() INTO v_code_1;
  ASSERT v_code_1 IS NOT NULL AND v_code_1 ~ '^[a-z0-9][a-z0-9-]{2,31}$',
    'FAIL: caso 1 — código inválido o nulo: ' || COALESCE(v_code_1, 'NULL');

  SELECT public.wa_get_or_create_my_referral_code() INTO v_code_2;
  ASSERT v_code_1 = v_code_2, 'FAIL: caso 1 — la segunda llamada devolvió un código distinto (no es idempotente)';

  ASSERT (SELECT count(*) FROM public.referral_codes WHERE business_id =
    (SELECT id FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1')) = 1,
    'FAIL: caso 1 — hay más de una fila de referral_codes para el mismo negocio';

  RAISE NOTICE 'OK: caso 1 — wa_get_or_create_my_referral_code() crea y es idempotente. code=%', v_code_1;
END $$;

RESET ROLE;

-- ── Caso 2: wa_resolve_referral_code() — resolución pública segura ─────────
-- El código Y el nombre real se obtienen ANTES de simular anon:
--   - referral_codes solo tiene políticas de SELECT "TO authenticated"
--     (dueño/admin) -- a propósito, es justamente el motivo de que exista
--     wa_resolve_referral_code() como bypass seguro para el público. Leerlo
--     directo como anon devolvería 0 filas por RLS (no un error).
--   - El nombre esperado NO se hardcodea: el trigger real de R1
--     (wa_handle_new_user_business) resuelve wa_businesses.name con su
--     propia cadena de fallback (business_name -> full_name -> prefijo de
--     email -> 'Mi negocio'), que no necesariamente coincide con la clave
--     "name" que usa el fixture de este script en raw_user_meta_data. El
--     valor correcto a comparar es el que R1 realmente escribió en
--     wa_businesses, leído dinámicamente -- no lo que el fixture "quiso decir".
-- Ambos se pasan al bloque anon via GUCs de sesión (mismo mecanismo que ya
-- usa el script para request.jwt.claims), porque los bloques DO no comparten
-- variables plpgsql entre sí.

DO $$
DECLARE
  v_code TEXT;
  v_name TEXT;
BEGIN
  SELECT rc.code, b.name INTO v_code, v_name
  FROM public.referral_codes rc
  JOIN public.wa_businesses b ON b.id = rc.business_id
  WHERE rc.business_id = (SELECT id FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1');

  ASSERT v_code IS NOT NULL, 'FAIL: caso 2 (setup) — no se encontró el código creado en el caso 1';
  ASSERT v_name IS NOT NULL AND v_name <> '', 'FAIL: caso 2 (setup) — wa_businesses.name vino vacío/nulo para el referidor';

  PERFORM set_config('test.referrer_code', v_code, true);
  PERFORM set_config('test.referrer_name', v_name, true);
  RAISE NOTICE 'OK: caso 2 (setup) — nombre real del referidor en wa_businesses: %', v_name;
END $$;

SET LOCAL ROLE anon;

DO $$
DECLARE
  v_code   TEXT := current_setting('test.referrer_code', true);
  v_name   TEXT := current_setting('test.referrer_name', true);
  v_result JSONB;
BEGIN
  ASSERT v_code IS NOT NULL AND v_code <> '', 'FAIL: caso 2 — no se pudo recuperar el código de prueba (bug del script, no de la RPC)';
  ASSERT v_name IS NOT NULL AND v_name <> '', 'FAIL: caso 2 — no se pudo recuperar el nombre real de prueba (bug del script, no de la RPC)';

  SELECT public.wa_resolve_referral_code(v_code) INTO v_result;
  ASSERT (v_result->>'valid')::boolean = true, 'FAIL: caso 2 — código válido resuelto como inválido';
  ASSERT v_result->>'referrerName' = v_name,
    'FAIL: caso 2 — referrerName no coincide con wa_businesses.name real. esperado=' || v_name || ' obtenido=' || (v_result->>'referrerName');
  ASSERT NOT (v_result ? 'business_id') AND NOT (v_result ? 'email'),
    'FAIL: caso 2 — la resolución pública expone datos sensibles';

  SELECT public.wa_resolve_referral_code('no-existe-xyz') INTO v_result;
  ASSERT (v_result->>'valid')::boolean = false, 'FAIL: caso 2 — código inexistente resuelto como válido';

  RAISE NOTICE 'OK: caso 2 — wa_resolve_referral_code() resuelve el nombre real sin exponer datos sensibles, y anon puede llamarla';
END $$;

RESET ROLE;

-- ── Caso 3: wa_attribute_referral() — atribución exitosa ───────────────────

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true);

DO $$
DECLARE
  v_referred_biz UUID;
  v_referrer_biz UUID;
  v_code         TEXT;
  v_result       JSONB;
BEGIN
  SELECT id INTO v_referred_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a2';
  SELECT id INTO v_referrer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
  SELECT code INTO v_code FROM public.referral_codes WHERE business_id = v_referrer_biz;

  SELECT public.wa_attribute_referral(v_referred_biz, v_code) INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = true, 'FAIL: caso 3 — atribución esperada no ocurrió: ' || v_result::text;
  ASSERT v_result->>'status' = 'qualified', 'FAIL: caso 3 — status esperado qualified, fue ' || (v_result->>'status');

  ASSERT (SELECT count(*) FROM public.referral_attributions WHERE referred_business_id = v_referred_biz) = 1,
    'FAIL: caso 3 — no hay exactamente 1 fila de atribución';
  ASSERT (SELECT referrer_business_id FROM public.referral_attributions WHERE referred_business_id = v_referred_biz) = v_referrer_biz,
    'FAIL: caso 3 — referrer_business_id incorrecto en la atribución';

  RAISE NOTICE 'OK: caso 3 — atribución creada correctamente, qualified';
END $$;

-- ── Caso 4: reintento — idempotencia de atribución ──────────────────────────

DO $$
DECLARE
  v_referred_biz UUID;
  v_referrer_biz UUID;
  v_code         TEXT;
  v_result       JSONB;
BEGIN
  SELECT id INTO v_referred_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a2';
  SELECT id INTO v_referrer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
  SELECT code INTO v_code FROM public.referral_codes WHERE business_id = v_referrer_biz;

  SELECT public.wa_attribute_referral(v_referred_biz, v_code) INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = false, 'FAIL: caso 4 — el reintento debía ser rechazado';
  ASSERT v_result->>'reason' = 'already_attributed', 'FAIL: caso 4 — reason esperado already_attributed, fue ' || (v_result->>'reason');

  ASSERT (SELECT count(*) FROM public.referral_attributions WHERE referred_business_id = v_referred_biz) = 1,
    'FAIL: caso 4 — el reintento creó una segunda fila';

  RAISE NOTICE 'OK: caso 4 — reintento de atribución es no-op idempotente';
END $$;

-- ── Caso 5: ownership enforcement — no se puede atribuir un negocio ajeno ──

DO $$
DECLARE
  v_referrer_biz UUID;
  v_code         TEXT;
  v_failed       BOOLEAN := false;
BEGIN
  -- Seguimos autenticados como a2 (referido), intentamos atribuir el negocio del referidor (a1).
  SELECT id INTO v_referrer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
  SELECT code FROM public.referral_codes WHERE business_id = v_referrer_biz INTO v_code;

  BEGIN
    PERFORM public.wa_attribute_referral(v_referrer_biz, v_code);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    ASSERT SQLERRM = 'BUSINESS_NOT_OWNED_BY_CALLER', 'FAIL: caso 5 — excepción inesperada: ' || SQLERRM;
  END;

  ASSERT v_failed, 'FAIL: caso 5 — se permitió atribuir un negocio que no pertenece al caller';
  RAISE NOTICE 'OK: caso 5 — ownership enforcement bloqueó la atribución de un negocio ajeno';
END $$;

RESET ROLE;

-- ── Caso 6: auto-referido ────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);

DO $$
DECLARE
  v_referrer_biz UUID;
  v_code         TEXT;
  v_result       JSONB;
BEGIN
  SELECT id INTO v_referrer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
  SELECT code INTO v_code FROM public.referral_codes WHERE business_id = v_referrer_biz;

  SELECT public.wa_attribute_referral(v_referrer_biz, v_code) INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = false, 'FAIL: caso 6 — el auto-referido debía ser rechazado';
  ASSERT v_result->>'reason' = 'self_referral', 'FAIL: caso 6 — reason esperado self_referral, fue ' || (v_result->>'reason');

  ASSERT NOT EXISTS (SELECT 1 FROM public.referral_attributions WHERE referred_business_id = v_referrer_biz),
    'FAIL: caso 6 — se creó una fila de auto-referido';

  RAISE NOTICE 'OK: caso 6 — auto-referido rechazado, sin fila creada';
END $$;

RESET ROLE;

-- ── Caso 7: duplicado de persona (mismo email de contacto, distinta cuenta) ─

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a3','role','authenticated')::text, true);

DO $$
DECLARE
  v_dup_biz      UUID;
  v_referrer_biz UUID;
  v_code         TEXT;
  v_result       JSONB;
BEGIN
  SELECT id INTO v_dup_biz      FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a3';
  SELECT id INTO v_referrer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
  SELECT code INTO v_code FROM public.referral_codes WHERE business_id = v_referrer_biz;

  SELECT public.wa_attribute_referral(v_dup_biz, v_code) INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = true, 'FAIL: caso 7 — la fila de trazabilidad no se creó: ' || v_result::text;
  ASSERT v_result->>'status' = 'disqualified', 'FAIL: caso 7 — status esperado disqualified, fue ' || (v_result->>'status');

  ASSERT (SELECT disqualified_reason FROM public.referral_attributions WHERE referred_business_id = v_dup_biz) = 'duplicate_person',
    'FAIL: caso 7 — disqualified_reason incorrecto';

  RAISE NOTICE 'OK: caso 7 — duplicado de persona detectado, fila conservada como disqualified (no genera comisión)';
END $$;

RESET ROLE;

-- ── Caso 7b: click_at en el futuro — rechazado, sin fila creada ────────────

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a5','role','authenticated')::text, true);

DO $$
DECLARE
  v_click_biz    UUID;
  v_referrer_biz UUID;
  v_code         TEXT;
  v_result       JSONB;
BEGIN
  SELECT id INTO v_click_biz    FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a5';
  SELECT id INTO v_referrer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
  SELECT code INTO v_code FROM public.referral_codes WHERE business_id = v_referrer_biz;

  SELECT public.wa_attribute_referral(v_click_biz, v_code, now() + interval '2 hours') INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = false, 'FAIL: caso 7b — un click_at futuro no debía atribuir';
  ASSERT v_result->>'reason' = 'click_in_future', 'FAIL: caso 7b — reason esperado click_in_future, fue ' || (v_result->>'reason');
  ASSERT NOT EXISTS (SELECT 1 FROM public.referral_attributions WHERE referred_business_id = v_click_biz),
    'FAIL: caso 7b — se creó una fila con click_at futuro';

  RAISE NOTICE 'OK: caso 7b — click_at futuro rechazado, sin fila creada';
END $$;

-- ── Caso 7c: click_at más viejo que la ventana de 30 días — rechazado ──────

DO $$
DECLARE
  v_click_biz    UUID;
  v_referrer_biz UUID;
  v_code         TEXT;
  v_result       JSONB;
BEGIN
  SELECT id INTO v_click_biz    FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a5';
  SELECT id INTO v_referrer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
  SELECT code INTO v_code FROM public.referral_codes WHERE business_id = v_referrer_biz;

  SELECT public.wa_attribute_referral(v_click_biz, v_code, now() - interval '31 days') INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = false, 'FAIL: caso 7c — un click_at de hace 31 días no debía atribuir';
  ASSERT v_result->>'reason' = 'click_window_expired', 'FAIL: caso 7c — reason esperado click_window_expired, fue ' || (v_result->>'reason');
  ASSERT NOT EXISTS (SELECT 1 FROM public.referral_attributions WHERE referred_business_id = v_click_biz),
    'FAIL: caso 7c — se creó una fila con click_at fuera de ventana';

  RAISE NOTICE 'OK: caso 7c — click_at fuera de la ventana de 30 días rechazado, sin fila creada';
END $$;

-- ── Caso 7d: click_at válido (dentro de ventana, no futuro) — atribución normal

DO $$
DECLARE
  v_click_biz    UUID;
  v_referrer_biz UUID;
  v_code         TEXT;
  v_result       JSONB;
BEGIN
  SELECT id INTO v_click_biz    FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a5';
  SELECT id INTO v_referrer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
  SELECT code INTO v_code FROM public.referral_codes WHERE business_id = v_referrer_biz;

  SELECT public.wa_attribute_referral(v_click_biz, v_code, now() - interval '5 days') INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = true, 'FAIL: caso 7d — un click_at válido debía atribuir: ' || v_result::text;
  ASSERT v_result->>'status' = 'qualified', 'FAIL: caso 7d — status esperado qualified, fue ' || (v_result->>'status');
  ASSERT (SELECT count(*) FROM public.referral_attributions WHERE referred_business_id = v_click_biz) = 1,
    'FAIL: caso 7d — no hay exactamente 1 fila tras una atribución válida';

  RAISE NOTICE 'OK: caso 7d — click_at válido (5 días atrás) produce atribución qualified normal';
END $$;

RESET ROLE;

-- ── Caso 7e: window_days ya no es un parámetro — llamarla con 4 argumentos
--    posicionales debe fallar en el propio SQL (la sobrecarga no existe),
--    no ser simplemente ignorada. Corremos elevados (sin SET ROLE) porque lo
--    que se prueba es la firma de la función, no permisos.

DO $$
DECLARE
  v_legacy_biz   UUID;
  v_referrer_biz UUID;
  v_code         TEXT;
  v_failed       BOOLEAN := false;
BEGIN
  SELECT id INTO v_legacy_biz   FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a6';
  SELECT id INTO v_referrer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
  SELECT code INTO v_code FROM public.referral_codes WHERE business_id = v_referrer_biz;

  BEGIN
    EXECUTE 'SELECT public.wa_attribute_referral($1, $2, $3, $4)'
      USING v_legacy_biz, v_code, now(), 90;
  EXCEPTION WHEN undefined_function THEN
    v_failed := true;
  END;

  ASSERT v_failed, 'FAIL: caso 7e — todavía existe una sobrecarga de 4 argumentos; un cliente podría pedir su propia ventana';
  ASSERT NOT EXISTS (SELECT 1 FROM public.referral_attributions WHERE referred_business_id = v_legacy_biz),
    'FAIL: caso 7e — la llamada inválida igual creó una fila';

  RAISE NOTICE 'OK: caso 7e — no existe ninguna forma de invocar la función pasando una ventana propia';
END $$;

-- ── Caso 7f: un segundo código (de otro referidor) no reemplaza una
--    atribución ya existente ──────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a7', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a7','role','authenticated')::text, true);

DO $$
DECLARE
  v_second_referrer_code TEXT;
BEGIN
  SELECT public.wa_get_or_create_my_referral_code() INTO v_second_referrer_code;
  ASSERT v_second_referrer_code IS NOT NULL, 'FAIL: caso 7f — el segundo referidor no pudo crear su código';
  RAISE NOTICE 'OK: caso 7f (setup) — segundo referidor con código propio: %', v_second_referrer_code;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a5','role','authenticated')::text, true);

DO $$
DECLARE
  v_click_biz           UUID;
  v_original_referrer   UUID;
  v_second_referrer_biz UUID;
  v_second_code         TEXT;
  v_result              JSONB;
  v_final_referrer      UUID;
BEGIN
  SELECT id INTO v_click_biz           FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a5';
  SELECT id INTO v_original_referrer   FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1';
  SELECT id INTO v_second_referrer_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a7';
  SELECT code INTO v_second_code FROM public.referral_codes WHERE business_id = v_second_referrer_biz;

  -- v_click_biz (a5) ya está atribuido a v_original_referrer (a1) desde el caso 7d.
  SELECT public.wa_attribute_referral(v_click_biz, v_second_code) INTO v_result;
  ASSERT (v_result->>'attributed')::boolean = false, 'FAIL: caso 7f — el segundo código no debía poder atribuir';
  ASSERT v_result->>'reason' = 'already_attributed', 'FAIL: caso 7f — reason esperado already_attributed, fue ' || (v_result->>'reason');

  SELECT referrer_business_id INTO v_final_referrer
  FROM public.referral_attributions WHERE referred_business_id = v_click_biz;
  ASSERT v_final_referrer = v_original_referrer,
    'FAIL: caso 7f — el referrer_business_id cambió: el segundo código reemplazó la atribución original';
  ASSERT (SELECT count(*) FROM public.referral_attributions WHERE referred_business_id = v_click_biz) = 1,
    'FAIL: caso 7f — hay más de una fila de atribución para el mismo negocio referido';

  RAISE NOTICE 'OK: caso 7f — un segundo código de otro referidor no reemplaza la atribución existente';
END $$;

RESET ROLE;

-- ── Caso 8: creación de comisión (service_role) ─────────────────────────────
-- Sin SET LOCAL ROLE: corremos como el usuario de conexión del script (con
-- privilegios de service_role/postgres en un stack local `supabase start`).

DO $$
DECLARE
  v_referred_biz UUID;
  v_result       JSONB;
  v_commission_id UUID;
BEGIN
  SELECT id INTO v_referred_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a2';

  SELECT public.wa_create_referral_commission_for_payment(
    v_referred_biz, 'mercado_pago', 'mp-test-payment-001',
    5990, 'CLP', 0.20, 'first_payment', NULL, 7
  ) INTO v_result;

  ASSERT (v_result->>'created')::boolean = true, 'FAIL: caso 8 — no se creó la comisión: ' || v_result::text;
  v_commission_id := (v_result->>'commissionId')::UUID;

  ASSERT (SELECT count(*) FROM public.referral_commissions WHERE referred_business_id = v_referred_biz) = 1,
    'FAIL: caso 8 — no hay exactamente 1 fila de comisión';

  -- Verificación de contenido completa:
  ASSERT (
    SELECT provider = 'mercado_pago'
       AND provider_payment_ref = 'mp-test-payment-001'
       AND kind = 'first_payment'
       AND gross_amount = 5990
       AND currency_code = 'CLP'
       AND commission_rate = 0.20
       AND commission_amount = 1198.00   -- round(5990 * 0.20, 2)
       AND status = 'pending'
       AND hold_until > now()
    FROM public.referral_commissions WHERE id = v_commission_id
  ), 'FAIL: caso 8 — contenido de la comisión incorrecto';

  RAISE NOTICE 'OK: caso 8 — comisión creada con monto/moneda/rate/hold correctos';
END $$;

-- ── Caso 9: reintento con el MISMO provider_payment_ref (duplicado de webhook)

DO $$
DECLARE
  v_referred_biz UUID;
  v_result       JSONB;
BEGIN
  SELECT id INTO v_referred_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a2';

  SELECT public.wa_create_referral_commission_for_payment(
    v_referred_biz, 'mercado_pago', 'mp-test-payment-001',
    5990, 'CLP', 0.20, 'first_payment', NULL, 7
  ) INTO v_result;

  ASSERT (v_result->>'created')::boolean = false, 'FAIL: caso 9 — el reintento debía ser rechazado';
  ASSERT (SELECT count(*) FROM public.referral_commissions WHERE referred_business_id = v_referred_biz) = 1,
    'FAIL: caso 9 — el reintento creó una segunda fila (rompe idempotencia por provider_payment_ref)';

  RAISE NOTICE 'OK: caso 9 — reintento de webhook (mismo provider_payment_ref) es no-op idempotente';
END $$;

-- ── Caso 10: segundo pago DISTINTO, misma atribución (first_payment ya existe)

DO $$
DECLARE
  v_referred_biz UUID;
  v_result       JSONB;
BEGIN
  SELECT id INTO v_referred_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a2';

  SELECT public.wa_create_referral_commission_for_payment(
    v_referred_biz, 'mercado_pago', 'mp-test-payment-002-DIFFERENT-REF',
    5990, 'CLP', 0.20, 'first_payment', NULL, 7
  ) INTO v_result;

  ASSERT (v_result->>'created')::boolean = false, 'FAIL: caso 10 — un segundo first_payment para la misma atribución no debía crearse';
  ASSERT (SELECT count(*) FROM public.referral_commissions WHERE referred_business_id = v_referred_biz) = 1,
    'FAIL: caso 10 — se creó una segunda comisión first_payment para la misma atribución';

  RAISE NOTICE 'OK: caso 10 — como mucho una comisión first_payment por atribución, aunque cambie provider_payment_ref';
END $$;

-- ── Caso 11: ningún cliente puede invocar la función de comisión ───────────

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true);

DO $$
DECLARE
  v_referred_biz UUID;
  v_failed       BOOLEAN := false;
BEGIN
  SELECT id INTO v_referred_biz FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a2';

  BEGIN
    PERFORM public.wa_create_referral_commission_for_payment(
      v_referred_biz, 'mercado_pago', 'client-forged-ref', 999999, 'CLP', 1.0, 'first_payment', NULL, 0
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;

  ASSERT v_failed, 'FAIL: caso 11 — un cliente autenticado pudo invocar wa_create_referral_commission_for_payment()';
  RAISE NOTICE 'OK: caso 11 — la función de comisión es inalcanzable para authenticated (permission denied)';
END $$;

-- ── Caso 12: ningún cliente puede INSERT directo en referral_commissions ───

DO $$
DECLARE
  v_failed BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO public.referral_commissions (
      referral_attribution_id, referrer_business_id, referred_business_id,
      provider, provider_payment_ref, kind, gross_amount, currency_code,
      commission_rate, commission_amount
    ) VALUES (
      (SELECT id FROM public.referral_attributions LIMIT 1),
      (SELECT id FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a1'),
      (SELECT id FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000a2'),
      'mercado_pago', 'client-direct-insert', 'first_payment', 999999, 'CLP', 1.0, 999999
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;

  ASSERT v_failed, 'FAIL: caso 12 — un cliente autenticado pudo insertar directamente en referral_commissions';
  RAISE NOTICE 'OK: caso 12 — INSERT directo en referral_commissions bloqueado (sin policy de INSERT bajo RLS)';
END $$;

-- ── Caso 13: aislamiento RLS — un tercero ajeno no ve las filas de otros ───

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a4','role','authenticated')::text, true);

DO $$
DECLARE
  v_visible_commissions  INTEGER;
  v_visible_attributions INTEGER;
BEGIN
  SELECT count(*) INTO v_visible_commissions FROM public.referral_commissions;
  SELECT count(*) INTO v_visible_attributions FROM public.referral_attributions;

  ASSERT v_visible_commissions = 0, 'FAIL: caso 13 — el negocio observador ve comisiones ajenas (' || v_visible_commissions || ')';
  ASSERT v_visible_attributions = 0, 'FAIL: caso 13 — el negocio observador ve atribuciones ajenas (' || v_visible_attributions || ')';

  RAISE NOTICE 'OK: caso 13 — RLS aísla correctamente: un tercero no ve comisiones ni atribuciones ajenas';
END $$;

RESET ROLE;

-- Revertir todo — este script nunca deja datos de prueba en la base.
ROLLBACK;
