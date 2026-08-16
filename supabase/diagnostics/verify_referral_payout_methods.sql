-- Verificación MANUAL de 20260818110000_referral_payout_methods.sql (Fase C2)
-- NO es una migración — no vive en supabase/migrations/ a propósito, para que
-- el CLI de Supabase nunca la levante como parte de `supabase db push`.
-- NO ejecutar contra el proyecto de producción.
-- Solo contra una instancia local/throwaway levantada con `supabase start`.
--
-- Cómo correrlo:
--   1. supabase start
--   2. supabase db reset          (aplica todas las migraciones, incluida
--                                   esta Fase C2)
--   3. psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/diagnostics/verify_referral_payout_methods.sql
--   4. supabase stop              (apaga y descarta todo — nada persiste)
--
-- El secreto real de producción (referral_payout_method_encryption_key)
-- NUNCA se crea acá con un valor real -- este script crea uno de PRUEBA,
-- exclusivo de esta transacción de diagnóstico, con vault.create_secret(),
-- y todo (incluida esa fila de vault.secrets) se revierte con el ROLLBACK
-- final. Nada de esto es el valor que se usaría en producción.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 25 — PRIMERO, antes de crear el secreto: ausencia de clave nunca
-- provoca fallback a texto plano. Debe fallar duro, sin insertar nada.
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'payout-method-a@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM public.wa_set_my_referral_payout_method(
      'CL', 'Juan Perez', '11.111.111-1', 'Banco Estado', 'checking', '1234567890', NULL
    );
    RAISE EXCEPTION 'FAIL caso 25 — sin secreto configurado, debía lanzar REFERRAL_PAYOUT_METHOD_ENCRYPTION_KEY_NOT_CONFIGURED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'REFERRAL_PAYOUT_METHOD_ENCRYPTION_KEY_NOT_CONFIGURED%' THEN
        RAISE EXCEPTION 'FAIL caso 25 — excepción inesperada: %', SQLERRM;
      END IF;
      RAISE NOTICE 'OK: caso 25 — sin clave configurada -> falla duro, nunca fallback a texto plano';
  END;
END $$;

RESET ROLE;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.referral_payout_methods;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL caso 25 — no debía haberse insertado ninguna fila';
  END IF;
  RAISE NOTICE 'OK: caso 25 — cero filas insertadas tras el fallo de clave';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Setup: secreto de PRUEBA (exclusivo de esta transacción) + segundo
-- usuario para los casos de aislamiento entre afiliados.
-- ══════════════════════════════════════════════════════════════════════════

SELECT vault.create_secret('diagnostic-only-test-key-never-used-in-production', 'referral_payout_method_encryption_key');

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role) VALUES
  ('00000000-0000-0000-0000-0000000000d2', 'payout-method-b@example.test', '{}'::jsonb, now(), 'authenticated', 'authenticated');

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 1/2/3 — guardar CL, leer masked, confirmar que NO hay plaintext
-- sensible almacenado en ninguna columna.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE
  v_set    JSONB;
  v_get    JSONB;
BEGIN
  v_set := public.wa_set_my_referral_payout_method(
    'CL', 'Juan Perez', '11.111.111-1', 'Banco Estado', 'checking', '000123456789', NULL
  );
  IF (v_set->>'ok')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL caso 1 — guardar CL válido debía dar ok:true, recibió: %', v_set;
  END IF;
  RAISE NOTICE 'OK: caso 1 — guardar CL exitoso';

  v_get := public.wa_get_my_referral_payout_method();
  IF v_get IS NULL THEN
    RAISE EXCEPTION 'FAIL caso 2 — GET debía devolver el método recién guardado';
  END IF;
  IF v_get->>'country' IS DISTINCT FROM 'CL'
     OR v_get->>'holderName' IS DISTINCT FROM 'Juan Perez'
     OR v_get->>'bankName' IS DISTINCT FROM 'Banco Estado'
     OR v_get->>'accountType' IS DISTINCT FROM 'checking'
     OR v_get->>'maskedTaxId' IS DISTINCT FROM '••••••11-1'
     OR v_get->>'maskedAccountNumber' IS DISTINCT FROM '••••••••6789' THEN
    RAISE EXCEPTION 'FAIL caso 2 — GET no coincide con lo esperado: %', v_get;
  END IF;
  IF v_get ? 'ciphertext' OR v_get ? 'encryptionKey' THEN
    RAISE EXCEPTION 'FAIL caso 2 — GET no debe exponer ciphertext ni clave';
  END IF;
  RAISE NOTICE 'OK: caso 2 — GET devuelve country/holderName/bankName/accountType en claro y tax_id/account_number enmascarados';
END $$;

RESET ROLE;

DO $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT * INTO v_row FROM public.referral_payout_methods WHERE user_id = '00000000-0000-0000-0000-0000000000d1';
  -- Ningún valor sensible aparece en texto plano en NINGUNA columna --
  -- ni siquiera accidentalmente en una columna operacional.
  IF v_row.bank_name = '11.111.111-1' OR v_row.bank_name = '000123456789' THEN
    RAISE EXCEPTION 'FAIL caso 3 — dato sensible filtrado a una columna operacional';
  END IF;
  IF pg_typeof(v_row.tax_id_ciphertext)::text <> 'bytea' OR pg_typeof(v_row.account_number_ciphertext)::text <> 'bytea' OR pg_typeof(v_row.holder_name_ciphertext)::text <> 'bytea' THEN
    RAISE EXCEPTION 'FAIL caso 3 — las 3 columnas sensibles deben ser bytea (cifradas)';
  END IF;
  -- El ciphertext crudo nunca debe contener el RUT en claro. Comparación
  -- en hexadecimal (nunca falla por encoding, a diferencia de intentar
  -- decodificar bytes cifrados arbitrarios como texto LATIN1/UTF8 --
  -- pgp_sym_encrypt() incluye relleno/IV no determinístico que puede
  -- producir bytes inválidos para cualquier encoding de texto).
  IF encode(v_row.tax_id_ciphertext, 'hex') LIKE '%' || encode(convert_to('11111111-1', 'UTF8'), 'hex') || '%' THEN
    RAISE EXCEPTION 'FAIL caso 3 — el ciphertext de tax_id parece contener el valor en claro';
  END IF;
  RAISE NOTICE 'OK: caso 3 — holder_name/tax_id/account_number viven exclusivamente cifrados (bytea), sin fuga a columnas operacionales';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 4/5/6 — guardar AR válido, CUIT inválido rechazado, CBU/CVU
-- inválido rechazado.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d2','role','authenticated')::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  -- caso 5: CUIT con 10 dígitos (inválido, faltan dígitos)
  v_result := public.wa_set_my_referral_payout_method(
    'AR', 'Maria Lopez', '2012345678', 'Banco Galicia', NULL, '0110599940000012345678', NULL
  );
  IF (v_result->>'reason') IS DISTINCT FROM 'invalid_tax_id' THEN
    RAISE EXCEPTION 'FAIL caso 5 — CUIT de 10 dígitos debía rechazarse como invalid_tax_id, recibió: %', v_result;
  END IF;
  RAISE NOTICE 'OK: caso 5 — CUIT/CUIL estructuralmente inválido rechazado';

  -- caso 6: CBU con 20 dígitos (inválido, faltan dígitos)
  v_result := public.wa_set_my_referral_payout_method(
    'AR', 'Maria Lopez', '20-12345678-3', 'Banco Galicia', NULL, '01105999400000123456', NULL
  );
  IF (v_result->>'reason') IS DISTINCT FROM 'invalid_cbu' THEN
    RAISE EXCEPTION 'FAIL caso 6 — CBU de 20 dígitos debía rechazarse como invalid_cbu, recibió: %', v_result;
  END IF;
  RAISE NOTICE 'OK: caso 6 — CBU/CVU estructuralmente inválido rechazado';

  -- caso 4: AR válido
  v_result := public.wa_set_my_referral_payout_method(
    'AR', 'Maria Lopez', '20-12345678-3', 'Banco Galicia', NULL, '0110599940000012345678', 'maria.mp'
  );
  IF (v_result->>'ok')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL caso 4 — guardar AR válido debía dar ok:true, recibió: %', v_result;
  END IF;
  RAISE NOTICE 'OK: caso 4 — guardar AR exitoso (CUIT/CBU normalizados y validados)';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 7/8 — aislamiento entre afiliados: A no puede leer el método de B,
-- y ninguna RPC acepta un user_id explícito (no existe ese parámetro).
-- ══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'wa_set_my_referral_payout_method'
      AND pg_get_function_identity_arguments(p.oid) NOT ILIKE '%user_id%'
  ) THEN
    RAISE EXCEPTION 'FAIL caso 8 — wa_set_my_referral_payout_method no debe aceptar ningún parámetro user_id';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('wa_get_my_referral_payout_method','wa_set_my_referral_payout_method','wa_delete_my_referral_payout_method')
      AND pg_get_function_identity_arguments(p.oid) ILIKE '%uuid%user%'
  ) THEN
    RAISE EXCEPTION 'FAIL caso 8 — ninguna de las 3 RPCs debe aceptar un identificador de usuario como parámetro';
  END IF;
  RAISE NOTICE 'OK: caso 8 — ninguna RPC acepta user_id; identidad exclusivamente vía auth.uid()';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE
  v_get JSONB;
BEGIN
  -- d1 (afiliado A) sigue viendo SU propio método (CL), nunca el de d2 (B, AR).
  v_get := public.wa_get_my_referral_payout_method();
  IF v_get->>'country' IS DISTINCT FROM 'CL' THEN
    RAISE EXCEPTION 'FAIL caso 7 — A debía seguir viendo su propio método (CL), obtuvo: %', v_get;
  END IF;
  RAISE NOTICE 'OK: caso 7 — cada afiliado ve exclusivamente su propio método, nunca el de otro';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 9/10 — un segundo SET reemplaza al primero; a lo sumo una fila por
-- user_id (garantizado por PK, pero se prueba el comportamiento real).
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE
  v_get JSONB;
BEGIN
  PERFORM public.wa_set_my_referral_payout_method(
    'CL', 'Juan Perez', '22.222.222-2', 'Banco Santander', 'savings', '999888777666', NULL
  );
  v_get := public.wa_get_my_referral_payout_method();
  IF v_get->>'bankName' IS DISTINCT FROM 'Banco Santander' OR v_get->>'accountType' IS DISTINCT FROM 'savings' THEN
    RAISE EXCEPTION 'FAIL caso 9 — el segundo SET debía reemplazar al primero, obtuvo: %', v_get;
  END IF;
  RAISE NOTICE 'OK: caso 9 — segundo SET reemplaza al primero (upsert)';
END $$;

RESET ROLE;

DO $$
DECLARE
  v_count_d1 INTEGER;
  v_count_total INTEGER;
BEGIN
  SELECT count(*) INTO v_count_d1 FROM public.referral_payout_methods WHERE user_id = '00000000-0000-0000-0000-0000000000d1';
  SELECT count(*) INTO v_count_total FROM public.referral_payout_methods;
  IF v_count_d1 <> 1 THEN
    RAISE EXCEPTION 'FAIL caso 10 — debía haber exactamente 1 fila para d1, hay %', v_count_d1;
  END IF;
  IF v_count_total <> 2 THEN
    RAISE EXCEPTION 'FAIL caso 10 — se esperaban exactamente 2 filas totales (d1 + d2), hay %', v_count_total;
  END IF;
  RAISE NOTICE 'OK: caso 10 — máximo una fila por user_id, garantizado por PK';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Fixture de payouts/comisiones históricos (independiente de
-- referral_payout_methods) para probar los casos 11/12/13.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_code_id UUID;
  v_attribution_id UUID;
  v_commission_id UUID;
BEGIN
  INSERT INTO public.referral_codes (user_id, code, display_name)
  VALUES ('00000000-0000-0000-0000-0000000000d1', 'payout-method-diag', 'Diag')
  RETURNING id INTO v_code_id;

  INSERT INTO public.referral_attributions (referred_user_id, referrer_user_id, referral_code_id, code_snapshot, status)
  VALUES ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', v_code_id, 'payout-method-diag', 'qualified')
  RETURNING id INTO v_attribution_id;

  INSERT INTO public.referral_commissions (referral_attribution_id, referrer_user_id, reward_amount, reward_currency, required_paid_months, terms_version, status)
  VALUES (v_attribution_id, '00000000-0000-0000-0000-0000000000d1', 5.00, 'USD', 2, 1, 'approved')
  RETURNING id INTO v_commission_id;

  PERFORM set_config('test.fixture_commission_id', v_commission_id::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  -- payout_method_snapshot histórico -- construido a mano, EXACTAMENTE
  -- como lo sigue haciendo hoy el formulario real de WalinkaRef (Fase C2
  -- no lo toca).
  v_result := public.wa_request_referral_payout(jsonb_build_object(
    'method', 'bank_transfer', 'country', 'CL', 'holder_name', 'Juan Perez Historico',
    'bank_name', 'Banco Historico', 'account_type', 'checking', 'account_number', '111222333'
  ));
  PERFORM set_config('test.fixture_payout_id', (v_result->'payouts'->0->>'payoutId'), true);
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 11 — DELETE elimina solo el propio método (d1), nunca el de d2.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);

DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.wa_delete_my_referral_payout_method();
  IF (v_result->>'ok')::boolean IS DISTINCT FROM true OR (v_result->>'deleted')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL caso 11 — DELETE del propio método debía dar ok:true,deleted:true, recibió: %', v_result;
  END IF;
END $$;

RESET ROLE;

DO $$
DECLARE
  v_count_d1 INTEGER;
  v_count_d2 INTEGER;
BEGIN
  SELECT count(*) INTO v_count_d1 FROM public.referral_payout_methods WHERE user_id = '00000000-0000-0000-0000-0000000000d1';
  SELECT count(*) INTO v_count_d2 FROM public.referral_payout_methods WHERE user_id = '00000000-0000-0000-0000-0000000000d2';
  IF v_count_d1 <> 0 THEN
    RAISE EXCEPTION 'FAIL caso 11 — el método de d1 debía haberse eliminado';
  END IF;
  IF v_count_d2 <> 1 THEN
    RAISE EXCEPTION 'FAIL caso 11 — el método de d2 (otro afiliado) NO debía verse afectado';
  END IF;
  RAISE NOTICE 'OK: caso 11 — DELETE afecta exclusivamente el método propio, el de otro afiliado permanece intacto';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 12/13 — payouts y commissions históricos permanecen intactos tras
-- guardar/reemplazar/eliminar métodos.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_payout_status TEXT;
  v_payout_snapshot JSONB;
  v_commission_status TEXT;
BEGIN
  SELECT status, payout_method_snapshot INTO v_payout_status, v_payout_snapshot
  FROM public.referral_payout_requests
  WHERE id = current_setting('test.fixture_payout_id')::uuid;

  IF v_payout_status IS DISTINCT FROM 'requested' OR v_payout_snapshot->>'bank_name' IS DISTINCT FROM 'Banco Historico' THEN
    RAISE EXCEPTION 'FAIL caso 12 — el payout histórico cambió: status=%, snapshot=%', v_payout_status, v_payout_snapshot;
  END IF;
  RAISE NOTICE 'OK: caso 12 — payout_method_snapshot histórico permanece intacto, sin relación con referral_payout_methods';

  SELECT status INTO v_commission_status
  FROM public.referral_commissions
  WHERE id = current_setting('test.fixture_commission_id')::uuid;

  IF v_commission_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'FAIL caso 13 — la comisión histórica cambió de estado: %', v_commission_status;
  END IF;
  RAISE NOTICE 'OK: caso 13 — referral_commissions permanece intacta';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 14/15/16 — acceso directo de tabla bloqueado (2 capas: GRANT antes
-- que RLS).
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d2','role','authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.referral_payout_methods LIMIT 1;
    RAISE EXCEPTION 'FAIL caso 14 — authenticated NO debía poder leer referral_payout_methods directamente';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: caso 14 — authenticated SELECT directo bloqueado (permission denied)';
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.referral_payout_methods LIMIT 1;
    RAISE EXCEPTION 'FAIL caso 15 — anon NO debía poder leer referral_payout_methods directamente';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: caso 15 — anon SELECT directo bloqueado (permission denied)';
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d2','role','authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.referral_payout_methods (user_id, country, bank_name, holder_name_ciphertext, tax_id_ciphertext, account_number_ciphertext)
    VALUES ('00000000-0000-0000-0000-0000000000d2', 'CL', 'x', '\x00'::bytea, '\x00'::bytea, '\x00'::bytea);
    RAISE EXCEPTION 'FAIL caso 16a — authenticated NO debía poder INSERT directo';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: caso 16a — authenticated INSERT directo bloqueado';
  END;

  BEGIN
    UPDATE public.referral_payout_methods SET bank_name = 'hacked' WHERE user_id = '00000000-0000-0000-0000-0000000000d2';
    RAISE EXCEPTION 'FAIL caso 16b — authenticated NO debía poder UPDATE directo';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: caso 16b — authenticated UPDATE directo bloqueado';
  END;

  BEGIN
    DELETE FROM public.referral_payout_methods WHERE user_id = '00000000-0000-0000-0000-0000000000d2';
    RAISE EXCEPTION 'FAIL caso 16c — authenticated NO debía poder DELETE directo';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: caso 16c — authenticated DELETE directo bloqueado';
  END;
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 17/18 — anon no puede ejecutar las RPCs; authenticated sí.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.wa_get_my_referral_payout_method()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.wa_set_my_referral_payout_method(text,text,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.wa_delete_my_referral_payout_method()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL caso 17 — anon no debe poder ejecutar ninguna de las 3 RPCs';
  END IF;
  RAISE NOTICE 'OK: caso 17 — anon sin EXECUTE en ninguna de las 3 RPCs';

  IF NOT (
    has_function_privilege('authenticated', 'public.wa_get_my_referral_payout_method()', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.wa_set_my_referral_payout_method(text,text,text,text,text,text,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.wa_delete_my_referral_payout_method()', 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'FAIL caso 18 — authenticated debe poder ejecutar las 3 RPCs';
  END IF;
  RAISE NOTICE 'OK: caso 18 — authenticated con EXECUTE en las 3 RPCs';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 19/20/21 — SECURITY DEFINER, search_path correcto, owner correcto.
-- ══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_bad_count INTEGER;
BEGIN
  SELECT count(*) INTO v_bad_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'wa_get_my_referral_payout_method',
      'wa_set_my_referral_payout_method',
      'wa_delete_my_referral_payout_method',
      'wa_referral_payout_method_encryption_key'
    )
    AND (
      NOT p.prosecdef                                        -- debe ser SECURITY DEFINER
      OR p.proconfig IS NULL                                  -- debe tener SET search_path
      OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
    );

  IF v_bad_count <> 0 THEN
    RAISE EXCEPTION 'FAIL caso 19/20 — % función(es) sin SECURITY DEFINER o sin search_path fijo', v_bad_count;
  END IF;
  RAISE NOTICE 'OK: caso 19/20 — las 4 funciones son SECURITY DEFINER con search_path fijo';

  -- caso 21: owner debe ser el mismo rol que posee el resto de las RPCs de
  -- Affiliate Core (consistencia -- no un rol distinto/menos privilegiado
  -- ni uno accidentalmente más privilegiado).
  SELECT count(*) INTO v_bad_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_roles r ON r.oid = p.proowner
  WHERE n.nspname = 'public'
    AND p.proname IN ('wa_get_my_referral_payout_method', 'wa_set_my_referral_payout_method', 'wa_delete_my_referral_payout_method', 'wa_referral_payout_method_encryption_key')
    AND r.rolname <> (
      SELECT r2.rolname FROM pg_proc p2
      JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      JOIN pg_roles r2 ON r2.oid = p2.proowner
      WHERE n2.nspname = 'public' AND p2.proname = 'wa_request_referral_payout'
      LIMIT 1
    );

  IF v_bad_count <> 0 THEN
    RAISE EXCEPTION 'FAIL caso 21 — el owner de las funciones nuevas difiere del owner de wa_request_referral_payout (%s funciones distintas)', v_bad_count;
  END IF;
  RAISE NOTICE 'OK: caso 21 — mismo owner que el resto de las RPCs de Affiliate Core';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Caso 22/23/24 — GET nunca devuelve ciphertext, tax_id completo ni
-- account_number completo.
-- ══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000d2','role','authenticated')::text, true);

DO $$
DECLARE
  v_get JSONB;
BEGIN
  v_get := public.wa_get_my_referral_payout_method();

  IF v_get ? 'taxIdCiphertext' OR v_get ? 'accountNumberCiphertext' OR v_get ? 'holderNameCiphertext' THEN
    RAISE EXCEPTION 'FAIL caso 22 — GET no debe exponer ninguna clave de ciphertext';
  END IF;

  IF v_get->>'maskedTaxId' = '20-12345678-3' OR v_get->>'maskedTaxId' = '20123456783' THEN
    RAISE EXCEPTION 'FAIL caso 23 — maskedTaxId no debe ser el CUIT completo, recibió: %', v_get->>'maskedTaxId';
  END IF;
  IF (v_get->>'maskedTaxId') !~ '•' THEN
    RAISE EXCEPTION 'FAIL caso 23 — maskedTaxId debe contener caracteres de enmascarado, recibió: %', v_get->>'maskedTaxId';
  END IF;
  RAISE NOTICE 'OK: caso 22/23 — GET sin ciphertext, maskedTaxId enmascarado';

  IF v_get->>'maskedAccountNumber' = '0110599940000012345678' THEN
    RAISE EXCEPTION 'FAIL caso 24 — maskedAccountNumber no debe ser el CBU completo';
  END IF;
  IF (v_get->>'maskedAccountNumber') !~ '•' THEN
    RAISE EXCEPTION 'FAIL caso 24 — maskedAccountNumber debe contener caracteres de enmascarado, recibió: %', v_get->>'maskedAccountNumber';
  END IF;
  RAISE NOTICE 'OK: caso 24 — maskedAccountNumber enmascarado, nunca el CBU/CVU completo';
END $$;

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TODOS LOS CASOS DE FASE C2 (referral_payout_methods) PASARON.';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;

ROLLBACK;
