-- Verificación MANUAL de 20260621000000_isolate_auth_users_metadata_update.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción (project-ref hxxdketymcntadffmajf)
-- — solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start                        (levanta stack local con Docker)
--   2. supabase db reset                     (aplica todas las migraciones, incluida la de aislamiento)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_wa_handle_new_user_business_metadata_isolation.sql
--   4. supabase stop                         (apaga y descarta todo — nada persiste)
--
-- Insertamos directo en auth.users vía SQL, que es exactamente lo que dispara
-- el trigger `wa_on_auth_user_created` (AFTER INSERT ON auth.users) — mismo
-- mecanismo que usa GoTrue internamente en un signup real.

BEGIN;

-- ── Caso 1: camino feliz (regresión) ────────────────────────────────────────
-- Confirma que la refactorización no rompió nada del comportamiento normal.

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'happy-path-test@example.test',
  '{"name": "Negocio De Prueba"}'::jsonb,
  now(),
  'authenticated',
  'authenticated'
);

DO $$
DECLARE
  v_biz_id UUID;
  v_meta   JSONB;
BEGIN
  SELECT id INTO v_biz_id FROM public.wa_businesses
   WHERE user_id = '00000000-0000-0000-0000-000000000001';
  ASSERT v_biz_id IS NOT NULL, 'FAIL: caso 1 — wa_businesses no se creó en el camino feliz';

  ASSERT EXISTS (
    SELECT 1 FROM public.billing_subscriptions WHERE business_id = v_biz_id
  ), 'FAIL: caso 1 — billing_subscriptions no se creó en el camino feliz';

  SELECT raw_app_meta_data INTO v_meta FROM auth.users
   WHERE id = '00000000-0000-0000-0000-000000000001';
  ASSERT v_meta->>'plan_slug' = 'pro', 'FAIL: caso 1 — raw_app_meta_data.plan_slug no se seteó en el camino feliz';
  ASSERT (v_meta->>'trial_active')::boolean = true, 'FAIL: caso 1 — raw_app_meta_data.trial_active no se seteó';

  RAISE NOTICE 'OK: caso 1 (camino feliz) — negocio, suscripción y metadata, los tres correctos';
END $$;

-- ── Caso 2: fallo forzado del UPDATE de auth.users ──────────────────────────
-- Simula el fallo con un trigger BEFORE UPDATE temporal que solo actúa sobre
-- el email de prueba — no toca permisos reales ni afecta otras filas.

CREATE OR REPLACE FUNCTION pg_temp.force_fail_on_test_email()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email = 'forced-failure-test@example.test' THEN
    RAISE EXCEPTION 'FORCED_TEST_FAILURE: simulando fallo del UPDATE de metadata';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER force_fail_before_update
  BEFORE UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION pg_temp.force_fail_on_test_email();

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'forced-failure-test@example.test',
  '{"name": "Negocio Con Update Forzado A Fallar"}'::jsonb,
  now(),
  'authenticated',
  'authenticated'
);

DO $$
DECLARE
  v_biz_id UUID;
  v_meta   JSONB;
BEGIN
  -- LA ASERCIÓN CLAVE: el negocio y la suscripción deben existir A PESAR de
  -- que el UPDATE de auth.users falló deterministicamente arriba.
  SELECT id INTO v_biz_id FROM public.wa_businesses
   WHERE user_id = '00000000-0000-0000-0000-000000000002';
  ASSERT v_biz_id IS NOT NULL,
    'FAIL: caso 2 — el fallo del UPDATE de metadata SÍ revirtió wa_businesses (regresión del bug original)';

  ASSERT EXISTS (
    SELECT 1 FROM public.billing_subscriptions WHERE business_id = v_biz_id
  ), 'FAIL: caso 2 — el fallo del UPDATE de metadata SÍ revirtió billing_subscriptions';

  -- Confirma que el fallo realmente ocurrió donde se espera: la metadata
  -- NO quedó seteada (si esto no se cumple, el trigger de fallo forzado no
  -- disparó y el test no está probando lo que dice probar).
  SELECT raw_app_meta_data INTO v_meta FROM auth.users
   WHERE id = '00000000-0000-0000-0000-000000000002';
  ASSERT v_meta IS NULL OR v_meta->>'plan_slug' IS NULL,
    'FAIL: caso 2 — raw_app_meta_data se seteó igual; el trigger de fallo forzado no disparó, el test es inválido';

  RAISE NOTICE 'OK: caso 2 (fallo forzado del UPDATE) — negocio y suscripción SÍ se conservaron, metadata quedó sin setear como se esperaba';
END $$;

DROP TRIGGER force_fail_before_update ON auth.users;

-- Revertir todo — este script nunca deja datos de prueba en la base.
ROLLBACK;
