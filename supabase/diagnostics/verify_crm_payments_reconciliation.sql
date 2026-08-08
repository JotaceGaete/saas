-- Verificación MANUAL de 20260808110000_crm_payments_reconciliation.sql
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción (project-ref hxxdketymcntadffmajf)
-- — solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluida esta reconciliación)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_crm_payments_reconciliation.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- Por qué el bloque de backfill se reproduce dentro del test en vez de solo
-- observarlo:
--   Al momento de correr este script, `db reset` YA aplicó la migración
--   completa: payment_number ya es NOT NULL y el trigger de numeración ya
--   está activo. En una base recién creada no hay filas "pre-migración" con
--   payment_number NULL que backfillear — por lo tanto, para probar que el
--   ALGORITMO de backfill (MAX(existente) + ROW_NUMBER() por negocio) es
--   correcto frente a los fixtures pedidos, cada bloque de prueba: (a) quita
--   temporalmente NOT NULL, (b) desactiva el trigger de numeración,
--   (c) inserta filas crudas que simulan el estado real de producción antes
--   de esta migración, (d) corre el MISMO bloque de backfill que aparece en
--   la migración (copiado literal, no reescrito), y (e) restaura NOT NULL +
--   trigger. Todo ocurre dentro de la transacción del script, que termina en
--   ROLLBACK: nada de esto persiste ni se mezcla con datos reales.
--
-- Cubre los 7 casos pedidos: tabla completamente sin numerar, tabla
-- parcialmente numerada, números existentes 1,2,5 + filas NULL (el caso de
-- colisión original), múltiples negocios con distinto MAX, idempotencia en
-- una segunda corrida, cero NULLs después del backfill, cero duplicados en
-- (business_id, payment_number). También verifica trigger de numeración en
-- estado estable, trigger updated_at, UNIQUE real, GRANTs de tabla sobre
-- crm_payments, y que las 9 policies (4 sin prefijo + 4 owner_* + admin_all)
-- coexisten sin regresión.
--
-- Por qué RLS se verifica ESTRUCTURALMENTE (pg_policies) y no con
-- SET ROLE authenticated + SELECT real:
--   Las policies owner_* de crm_payments evalúan un subquery contra
--   public.wa_businesses (business_id IN (SELECT id FROM wa_businesses
--   WHERE user_id = auth.uid())). Ese subquery corre con los privilegios
--   del rol que ejecuta la consulta -- si se prueba con SET LOCAL ROLE
--   authenticated, Postgres exige que authenticated tenga GRANT de tabla
--   sobre wa_businesses también, no solo sobre crm_payments. Este shadow
--   no reproduce los default grants de plataforma sobre wa_businesses (ni
--   sobre ninguna otra tabla fuera de crm_payments), así que un intento
--   real de SELECT como authenticated falla con
--   "permission denied for table wa_businesses" -- un problema de GRANTs
--   de una tabla que esta migración NO toca a propósito (alcance: solo
--   crm_payments). En vez de ampliar la migración con GRANTs sobre
--   wa_businesses (fuera de alcance, abriría la reconciliación de
--   privilegios de todo el esquema), este script verifica RLS de forma
--   estructural: que el qual/with_check de cada policy es EXACTAMENTE el
--   esperado (capturado de producción), sin ejecutarlo como authenticated.

BEGIN;

-- ── Setup: 3 negocios reales vía trigger R1 (wa_handle_new_user_business) ─────
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'crmpay-a@example.test', '{"name": "Negocio A"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'crmpay-b@example.test', '{"name": "Negocio B"}'::jsonb, now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'crmpay-c@example.test', '{"name": "Negocio C"}'::jsonb, now(), 'authenticated', 'authenticated');

DO $$
DECLARE
  v_biz_a uuid;
  v_biz_b uuid;
  v_biz_c uuid;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000b1';
  SELECT id INTO v_biz_b FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000b2';
  SELECT id INTO v_biz_c FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000b3';

  ASSERT v_biz_a IS NOT NULL AND v_biz_b IS NOT NULL AND v_biz_c IS NOT NULL,
    'FAIL: setup — el trigger R1 no creó los 3 negocios de prueba';

  RAISE NOTICE 'OK: setup — 3 negocios creados via trigger R1 real. A=% B=% C=%', v_biz_a, v_biz_b, v_biz_c;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 1: fixtures crudos que simulan el estado pre-migración de producción
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.crm_payments ALTER COLUMN payment_number DROP NOT NULL;
ALTER TABLE public.crm_payments DISABLE TRIGGER crm_payments_set_payment_number;

DO $$
DECLARE
  v_biz_a uuid; v_biz_b uuid; v_biz_c uuid;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000b1';
  SELECT id INTO v_biz_b FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000b2';
  SELECT id INTO v_biz_c FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000b3';

  -- Caso 1: tabla completamente SIN numerar (negocio A) — 3 filas, todas NULL.
  INSERT INTO public.crm_payments (business_id, amount, payment_method, payment_number, created_at)
  VALUES
    (v_biz_a, 1000, 'cash', NULL, now() - interval '3 days'),
    (v_biz_a, 2000, 'cash', NULL, now() - interval '2 days'),
    (v_biz_a, 3000, 'cash', NULL, now() - interval '1 day');

  -- Caso 2 y 3: tabla PARCIALMENTE numerada (negocio B) — existentes 1,2,5 +
  -- 2 filas NULL. Este es el caso de colisión original: ROW_NUMBER() ingenuo
  -- sobre las NULL asignaría 1 y 2, que ya existen. El resultado correcto es
  -- MAX(5) + 1 = 6 y MAX(5) + 2 = 7.
  INSERT INTO public.crm_payments (business_id, amount, payment_method, payment_number, created_at)
  VALUES
    (v_biz_b, 1000, 'cash', 1,    now() - interval '5 days'),
    (v_biz_b, 2000, 'cash', 2,    now() - interval '4 days'),
    (v_biz_b, 3000, 'cash', 5,    now() - interval '3 days'),
    (v_biz_b, 4000, 'cash', NULL, now() - interval '2 days'),
    (v_biz_b, 5000, 'cash', NULL, now() - interval '1 day');

  -- Caso 4: múltiples negocios con distinto MAX (negocio C) — un solo
  -- existente en 100, más 2 NULL. Debe numerar 101, 102, aislado de A y B.
  INSERT INTO public.crm_payments (business_id, amount, payment_method, payment_number, created_at)
  VALUES
    (v_biz_c, 1000, 'cash', 100,  now() - interval '2 days'),
    (v_biz_c, 2000, 'cash', NULL, now() - interval '1 day'),
    (v_biz_c, 3000, 'cash', NULL, now());

  RAISE NOTICE 'OK: fixtures — negocio A (3 NULL), negocio B (1,2,5 + 2 NULL), negocio C (100 + 2 NULL)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 2: mismo algoritmo de backfill que la migración, corrido sobre los
-- fixtures de arriba (copiado literal de 20260808110000_crm_payments_reconciliation.sql)
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_null_count integer;
BEGIN
  WITH existing_max AS (
    SELECT business_id, MAX(payment_number) AS max_number
    FROM public.crm_payments
    WHERE payment_number IS NOT NULL
    GROUP BY business_id
  ),
  numbered AS (
    SELECT
      p.id,
      COALESCE(m.max_number, 0)
        + ROW_NUMBER() OVER (
            PARTITION BY p.business_id
            ORDER BY p.created_at, p.id
          ) AS new_number
    FROM public.crm_payments p
    LEFT JOIN existing_max m ON m.business_id = p.business_id
    WHERE p.payment_number IS NULL
  )
  UPDATE public.crm_payments p
  SET payment_number = numbered.new_number
  FROM numbered
  WHERE p.id = numbered.id;

  SELECT count(*) INTO v_null_count FROM public.crm_payments WHERE payment_number IS NULL;
  ASSERT v_null_count = 0, 'FAIL: caso 6 — quedan ' || v_null_count || ' filas con payment_number NULL tras el backfill';

  RAISE NOTICE 'OK: caso 6 — cero NULLs en payment_number tras el backfill';
END $$;

-- Caso 1: negocio A quedó numerado 1,2,3 en orden de created_at (no había
-- números previos, MAX=0).
DO $$
DECLARE
  v_biz_a uuid;
  v_numbers integer[];
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000b1';
  SELECT array_agg(payment_number ORDER BY created_at) INTO v_numbers
  FROM public.crm_payments WHERE business_id = v_biz_a;

  ASSERT v_numbers = ARRAY[1,2,3], 'FAIL: caso 1 — negocio A (fully-unnumbered) esperaba {1,2,3}, obtuvo ' || v_numbers::text;
  RAISE NOTICE 'OK: caso 1 — tabla completamente sin numerar → backfill asigna 1,2,3 en orden de created_at';
END $$;

-- Casos 2 y 3: negocio B — las 2 filas antes-NULL deben quedar en 6 y 7,
-- NUNCA en 1 o 2 (que ya existían). Los 3 números pre-existentes (1,2,5) no
-- deben tocarse.
DO $$
DECLARE
  v_biz_b uuid;
  v_numbers integer[];
BEGIN
  SELECT id INTO v_biz_b FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000b2';
  SELECT array_agg(payment_number ORDER BY created_at) INTO v_numbers
  FROM public.crm_payments WHERE business_id = v_biz_b;

  ASSERT v_numbers = ARRAY[1,2,5,6,7],
    'FAIL: caso 2/3 — negocio B (1,2,5 + NULL,NULL) esperaba {1,2,5,6,7}, obtuvo ' || v_numbers::text;
  RAISE NOTICE 'OK: caso 2/3 — tabla parcialmente numerada con huecos (1,2,5): las filas NULL continúan en 6,7, sin colisión ni reutilizar huecos';
END $$;

-- Caso 4: negocio C — aislado de A y B, continúa desde 100.
DO $$
DECLARE
  v_biz_c uuid;
  v_numbers integer[];
BEGIN
  SELECT id INTO v_biz_c FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000b3';
  SELECT array_agg(payment_number ORDER BY created_at) INTO v_numbers
  FROM public.crm_payments WHERE business_id = v_biz_c;

  ASSERT v_numbers = ARRAY[100,101,102],
    'FAIL: caso 4 — negocio C esperaba {100,101,102}, obtuvo ' || v_numbers::text;
  RAISE NOTICE 'OK: caso 4 — múltiples negocios con distinto MAX quedan numerados de forma aislada (C continúa desde 100, sin interferir con A ni B)';
END $$;

-- Caso 7: cero duplicados en (business_id, payment_number) entre los 3 negocios.
DO $$
DECLARE
  v_dupes integer;
BEGIN
  SELECT count(*) INTO v_dupes
  FROM (
    SELECT business_id, payment_number
    FROM public.crm_payments
    GROUP BY business_id, payment_number
    HAVING count(*) > 1
  ) d;

  ASSERT v_dupes = 0, 'FAIL: caso 7 — hay ' || v_dupes || ' pares (business_id, payment_number) duplicados';
  RAISE NOTICE 'OK: caso 7 — cero duplicados en (business_id, payment_number) tras el backfill';
END $$;

-- Caso 5: idempotencia en una segunda corrida. Re-ejecutar el mismo bloque
-- de backfill sobre datos que ya no tienen NULL debe ser un no-op: 0 filas
-- afectadas y ningún número cambia.
DO $$
DECLARE
  v_before jsonb;
  v_after  jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('id', id, 'payment_number', payment_number) ORDER BY id)
  INTO v_before FROM public.crm_payments;

  WITH existing_max AS (
    SELECT business_id, MAX(payment_number) AS max_number
    FROM public.crm_payments
    WHERE payment_number IS NOT NULL
    GROUP BY business_id
  ),
  numbered AS (
    SELECT
      p.id,
      COALESCE(m.max_number, 0)
        + ROW_NUMBER() OVER (PARTITION BY p.business_id ORDER BY p.created_at, p.id) AS new_number
    FROM public.crm_payments p
    LEFT JOIN existing_max m ON m.business_id = p.business_id
    WHERE p.payment_number IS NULL
  )
  UPDATE public.crm_payments p
  SET payment_number = numbered.new_number
  FROM numbered
  WHERE p.id = numbered.id;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'payment_number', payment_number) ORDER BY id)
  INTO v_after FROM public.crm_payments;

  ASSERT v_before = v_after, 'FAIL: caso 5 — una segunda corrida del backfill modificó datos ya numerados';
  RAISE NOTICE 'OK: caso 5 — segunda corrida del backfill es idempotente (0 filas afectadas, ningún número cambia)';
END $$;

-- Restaurar NOT NULL + trigger, tal como hace la migración real.
ALTER TABLE public.crm_payments ALTER COLUMN payment_number SET NOT NULL;
ALTER TABLE public.crm_payments ENABLE TRIGGER crm_payments_set_payment_number;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 3: UNIQUE real bloquea duplicados (con el trigger + NOT NULL ya activos)
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz_b uuid;
BEGIN
  SELECT id INTO v_biz_b FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000b2';

  BEGIN
    INSERT INTO public.crm_payments (business_id, amount, payment_method, payment_number)
    VALUES (v_biz_b, 999, 'cash', 1); -- 1 ya existe para v_biz_b
    RAISE EXCEPTION 'FAIL: caso 7b — el INSERT duplicado (business_id, payment_number) no fue bloqueado por el UNIQUE';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'OK: caso 7b — UNIQUE (business_id, payment_number) bloquea un INSERT explícito duplicado';
  END;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 4: trigger de numeración en estado estable (INSERT nuevo, sin
-- especificar payment_number, debe autonumerar correctamente)
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_biz_a uuid;
  v_new_id uuid;
  v_new_number integer;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000b1';
  -- negocio A ya tiene 1,2,3 (backfill). Un INSERT nuevo sin payment_number
  -- debe quedar en 4 automáticamente vía crm_payments_set_payment_number.
  INSERT INTO public.crm_payments (business_id, amount, payment_method)
  VALUES (v_biz_a, 4000, 'cash')
  RETURNING id, payment_number INTO v_new_id, v_new_number;

  ASSERT v_new_number = 4, 'FAIL: caso trigger — esperaba payment_number=4 autonumerado, obtuvo ' || v_new_number;
  RAISE NOTICE 'OK: trigger crm_payments_set_payment_number autonumera en estado estable (4 tras 1,2,3)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 5: trigger updated_at
-- ══════════════════════════════════════════════════════════════════════════

-- NOTA: wa_set_updated_at() usa NEW.updated_at = now(). En PostgreSQL now()
-- es alias de transaction_timestamp(): queda CONSTANTE durante toda la
-- transacción (todo este script corre en un único BEGIN...ROLLBACK). Un
-- before/after con pg_sleep() de por medio siempre da el mismo valor —no
-- es una forma válida de detectar si el trigger disparó. En vez de eso,
-- fijamos manualmente un updated_at viejo (desactivando el trigger para que
-- no lo sobreescriba al hacerlo) y verificamos que el UPDATE real, con el
-- trigger reactivado, lo mueve hacia adelante respecto de ese valor viejo.
DO $$
DECLARE
  v_biz_a uuid;
  v_id uuid;
  v_old_updated_at timestamptz := now() - interval '10 days';
  v_updated_after  timestamptz;
BEGIN
  SELECT id INTO v_biz_a FROM public.wa_businesses WHERE user_id = '00000000-0000-0000-0000-0000000000b1';

  INSERT INTO public.crm_payments (business_id, amount, payment_method)
  VALUES (v_biz_a, 500, 'cash')
  RETURNING id INTO v_id;

  ALTER TABLE public.crm_payments DISABLE TRIGGER crm_payments_updated_at;
  UPDATE public.crm_payments SET updated_at = v_old_updated_at WHERE id = v_id;
  ALTER TABLE public.crm_payments ENABLE TRIGGER crm_payments_updated_at;

  UPDATE public.crm_payments SET notes = 'test-update' WHERE id = v_id
  RETURNING updated_at INTO v_updated_after;

  ASSERT v_updated_after > v_old_updated_at,
    'FAIL: caso updated_at — el trigger no actualizó updated_at en UPDATE (antes=' || v_old_updated_at || ', después=' || v_updated_after || ')';
  RAISE NOTICE 'OK: trigger crm_payments_updated_at (wa_set_updated_at) actualiza updated_at en cada UPDATE (antes=%, después=%)', v_old_updated_at, v_updated_after;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 6: REVOKE ALL de anon + GRANT SELECT, INSERT, UPDATE a
-- authenticated (sin el GRANT, Postgres deniega el acceso antes de que
-- RLS llegue a evaluarse)
-- ══════════════════════════════════════════════════════════════════════════

-- anon: ninguno de SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER.
-- El diagnóstico anterior (sin el REVOKE explícito) encontró que anon
-- heredaba REFERENCES/TRIGGER/TRUNCATE por default implícito de
-- plataforma, igual que producción; el REVOKE ALL de la migración debe
-- dejarlo en cero privilegios, sin excepción.
DO $$
DECLARE
  v_anon_privs text[];
BEGIN
  SELECT array_agg(privilege_type ORDER BY privilege_type) INTO v_anon_privs
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'crm_payments' AND grantee = 'anon';

  ASSERT v_anon_privs IS NULL,
    'FAIL: GRANT — anon todavía tiene privilegios sobre crm_payments tras el REVOKE (' || COALESCE(v_anon_privs::text, '') || ')';
  RAISE NOTICE 'OK: GRANT — anon no tiene NINGÚN privilegio sobre crm_payments (ni SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER)';
END $$;

-- authenticated tiene EXACTAMENTE SELECT, INSERT, UPDATE — nada de
-- DELETE/TRUNCATE/REFERENCES/TRIGGER (esos los tiene producción solo por
-- herencia genérica del default de plataforma, no por uso real de la app).
DO $$
DECLARE
  v_auth_privs text[];
BEGIN
  SELECT array_agg(privilege_type ORDER BY privilege_type) INTO v_auth_privs
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'crm_payments' AND grantee = 'authenticated';

  ASSERT v_auth_privs = ARRAY['INSERT','SELECT','UPDATE'],
    'FAIL: GRANT — authenticated debería tener exactamente {INSERT,SELECT,UPDATE}, tiene ' || COALESCE(v_auth_privs::text, 'NULL');
  RAISE NOTICE 'OK: GRANT — authenticated tiene exactamente SELECT, INSERT, UPDATE (sin DELETE/TRUNCATE/REFERENCES/TRIGGER)';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- BLOQUE 7: RLS — verificación ESTRUCTURAL (pg_policies), sin SET ROLE.
-- 9 policies coexisten (4 sin prefijo + 4 owner_* + admin_all) sin
-- regresión sobre las que ya creaba 20260530210000_crm_payments.sql; las
-- 4 owner_* tienen exactamente el qual/with_check esperado (capturado de
-- producción); admin_all usa wa_is_admin().
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_policy_count integer;
BEGIN
  SELECT count(*) INTO v_policy_count
  FROM pg_policies WHERE schemaname='public' AND tablename='crm_payments';

  ASSERT v_policy_count = 9,
    'FAIL: RLS — se esperaban 9 policies en crm_payments (4 base + 4 owner_* + admin_all), hay ' || v_policy_count;
  RAISE NOTICE 'OK: crm_payments tiene 9 policies (sin regresión sobre las 4 base de 20260530210000)';
END $$;

DO $$
DECLARE
  v_qual text;
  v_expected_owner_qual text := $q$(business_id IN ( SELECT wa_businesses.id
   FROM wa_businesses
  WHERE (wa_businesses.user_id = auth.uid())))$q$;
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
  WHERE schemaname='public' AND tablename='crm_payments' AND policyname='crm_payments_owner_select';
  ASSERT v_qual = v_expected_owner_qual,
    'FAIL: crm_payments_owner_select.qual no coincide con el esperado. obtuvo: ' || COALESCE(v_qual, 'NULL');
  RAISE NOTICE 'OK: crm_payments_owner_select.qual coincide exactamente con el esperado (aislamiento por business_id/wa_businesses.user_id=auth.uid())';
END $$;

DO $$
DECLARE
  v_with_check text;
  v_expected_owner_check text := $q$(business_id IN ( SELECT wa_businesses.id
   FROM wa_businesses
  WHERE (wa_businesses.user_id = auth.uid())))$q$;
BEGIN
  SELECT with_check INTO v_with_check FROM pg_policies
  WHERE schemaname='public' AND tablename='crm_payments' AND policyname='crm_payments_owner_insert';
  ASSERT v_with_check = v_expected_owner_check,
    'FAIL: crm_payments_owner_insert.with_check no coincide con el esperado. obtuvo: ' || COALESCE(v_with_check, 'NULL');
  RAISE NOTICE 'OK: crm_payments_owner_insert.with_check coincide exactamente con el esperado';
END $$;

DO $$
DECLARE
  v_qual text;
  v_with_check text;
  v_expected text := $q$(business_id IN ( SELECT wa_businesses.id
   FROM wa_businesses
  WHERE (wa_businesses.user_id = auth.uid())))$q$;
BEGIN
  SELECT qual, with_check INTO v_qual, v_with_check FROM pg_policies
  WHERE schemaname='public' AND tablename='crm_payments' AND policyname='crm_payments_owner_update';
  ASSERT v_qual = v_expected,
    'FAIL: crm_payments_owner_update.qual no coincide con el esperado. obtuvo: ' || COALESCE(v_qual, 'NULL');
  ASSERT v_with_check = v_expected,
    'FAIL: crm_payments_owner_update.with_check no coincide con el esperado. obtuvo: ' || COALESCE(v_with_check, 'NULL');
  RAISE NOTICE 'OK: crm_payments_owner_update.qual y with_check coinciden exactamente con lo esperado';
END $$;

DO $$
DECLARE
  v_qual text;
  v_expected text := $q$(business_id IN ( SELECT wa_businesses.id
   FROM wa_businesses
  WHERE (wa_businesses.user_id = auth.uid())))$q$;
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
  WHERE schemaname='public' AND tablename='crm_payments' AND policyname='crm_payments_owner_delete';
  ASSERT v_qual = v_expected,
    'FAIL: crm_payments_owner_delete.qual no coincide con el esperado. obtuvo: ' || COALESCE(v_qual, 'NULL');
  RAISE NOTICE 'OK: crm_payments_owner_delete.qual coincide exactamente con el esperado';
END $$;

DO $$
DECLARE
  v_cmd text;
  v_qual text;
  v_with_check text;
BEGIN
  SELECT cmd, qual, with_check INTO v_cmd, v_qual, v_with_check FROM pg_policies
  WHERE schemaname='public' AND tablename='crm_payments' AND policyname='crm_payments_admin_all';

  ASSERT v_cmd = 'ALL', 'FAIL: crm_payments_admin_all.cmd debería ser ALL, es ' || COALESCE(v_cmd, 'NULL');
  ASSERT v_qual = 'wa_is_admin()',
    'FAIL: crm_payments_admin_all.qual debería ser wa_is_admin(), es ' || COALESCE(v_qual, 'NULL');
  ASSERT v_with_check = 'wa_is_admin()',
    'FAIL: crm_payments_admin_all.with_check debería ser wa_is_admin(), es ' || COALESCE(v_with_check, 'NULL');
  RAISE NOTICE 'OK: crm_payments_admin_all usa wa_is_admin() en qual y with_check, FOR ALL';
END $$;

-- Revertir todo — este script nunca deja datos de prueba en la base.
ROLLBACK;
