-- ============================================================
-- crm_payments: reconciliación del bloque "seguro" confirmado en
-- producción (introspección de solo lectura, sesión de auditoría
-- del drift de migraciones 2026-06 / 2026-07).
--
-- Objetos que esta migración reproduce, EXACTAMENTE como existen
-- hoy en producción (definiciones capturadas via pg_get_functiondef /
-- pg_get_triggerdef / pg_policies, no inventadas):
--   1. columna crm_payments.payment_number (integer, not null)
--   2. UNIQUE (business_id, payment_number)
--   3. function crm_next_payment_number(uuid)
--   4. function crm_set_payment_number()
--   5. trigger crm_payments_set_payment_number (BEFORE INSERT)
--   6. columna crm_payments.updated_at (timestamptz, default now())
--   7. trigger crm_payments_updated_at (BEFORE UPDATE -> wa_set_updated_at())
--   8. policies owner_* (select/insert/update/delete) -- duplicados
--      funcionales de las policies sin prefijo que ya crea
--      20260530210000_crm_payments.sql; producción los tiene a ambos.
--   9. policy crm_payments_admin_all (wa_is_admin())
--  10. GRANT SELECT, INSERT, UPDATE ON crm_payments TO authenticated --
--      ninguna migración de crm_payments otorgó jamás un privilegio de
--      tabla explícito (ni esta ni ninguna de sus 4 predecesoras: base,
--      missing_columns, void, phase1_stabilization); dependía enteramente
--      del default de plataforma fuera de este repo (mismo fenómeno ya
--      documentado para funciones en 20260808100000_referral_core_part1.sql,
--      líneas 325-329). La validación dinámica confirmó que ese default
--      implícito no se reproduce en el shadow local: authenticated recibía
--      "permission denied for table crm_payments" antes de llegar a RLS.
--      Mínimo exacto requerido por la app (confirmado por grep sobre
--      crmPaymentsService.js / crmService.js: hay .select()/.insert()/
--      .update(), CERO .delete()): SELECT, INSERT, UPDATE. NO se otorga
--      DELETE (la app nunca borra, "anula" via UPDATE de voided_at), NI
--      TRUNCATE/REFERENCES/TRIGGER (que producción sí tiene por herencia
--      genérica del default de plataforma, no por uso real), NI nada a
--      anon (ninguna de las 9 policies RLS es TO anon; RLS ya lo bloquea
--      por completo, dar privilegio de tabla ahí sería puro ruido heredado
--      de producción sin justificación de uso).
--  11. REVOKE ALL PRIVILEGES ON crm_payments FROM anon -- el diagnóstico
--      reveló que anon también hereda privilegios implícitos de plataforma
--      (REFERENCES, TRIGGER, TRUNCATE, y probablemente el resto de ALL)
--      sobre crm_payments, igual que producción por herencia genérica. RLS
--      ya deja a anon en cero filas (ninguna policy es TO anon), pero eso
--      no borra el privilegio de tabla subyacente. Hardening explícito y
--      mínimo: revocar todo de anon, sin tocar service_role ni postgres.
--
-- FUERA DE ALCANCE, a propósito:
--   - crm_payments.order_id / crm_payments.quote_id: producción NO
--     tiene order_id y SÍ tiene quote_id; main sigue insertando
--     order_id vía registerOrderPayment(). Es un incidente operacional
--     separado del drift histórico y NO se toca aquí.
--   - Las 7 versiones huérfanas 20260621000001..20260621000007 no se
--     asignan a esta migración. Este archivo reconstruye un bloque de
--     objetos confirmados en producción; no reclama ser el contenido
--     original de ninguna de esas versiones.
--
-- Anti-regresión: no toca Product Editor, R1 (20260807120000), R2
-- (mp-webhook / billing_subscriptions) ni Referral Core Part 1
-- (20260808100000).
--
-- CONCURRENCIA:
-- El backfill de payment_number necesita una foto consistente de
-- "MAX(payment_number) actual por business_id" que no puede cambiar
-- entre el momento en que se calcula y el momento en que se crea el
-- UNIQUE + se aplica SET NOT NULL; si un INSERT concurrente entrara
-- en esa ventana con un payment_number nuevo (o NULL, numerado por el
-- trigger de otra sesión), podría colisionar con el número que le
-- estamos a punto de asignar a una fila ya existente.
-- Supabase CLI ejecuta cada archivo de migración dentro de una única
-- transacción implícita (por eso CREATE INDEX CONCURRENTLY no está
-- permitido en migraciones). Aprovechamos esa transacción: el
-- LOCK TABLE de más abajo toma SHARE ROW EXCLUSIVE sobre crm_payments
-- antes de calcular el snapshot y lo mantiene hasta el COMMIT de la
-- migración (después de crear el UNIQUE y aplicar SET NOT NULL).
-- SHARE ROW EXCLUSIVE bloquea INSERT/UPDATE/DELETE (que piden
-- ROW EXCLUSIVE) pero NO bloquea SELECT (ACCESS SHARE): la app sigue
-- pudiendo leer crm_payments durante la migración, solo se bloquean
-- escrituras nuevas hasta que el bloque numeración+UNIQUE+NOT NULL
-- quede consistente.
--
-- IDEMPOTENCIA:
-- Todo el archivo es reproducible sin efectos secundarios en una
-- segunda corrida: los ADD COLUMN usan IF NOT EXISTS, el backfill
-- solo toca filas con payment_number IS NULL (después de la primera
-- corrida no quedan filas así, por lo que el UPDATE afecta 0 filas),
-- el UNIQUE se crea solo si no existe ya sobre public.crm_payments,
-- SET NOT NULL es un no-op si la columna ya es NOT NULL, y los
-- DROP TRIGGER/DROP POLICY seguidos de CREATE TRIGGER/CREATE POLICY
-- son idempotentes EN RESULTADO: no significan "no hacer nada" en la
-- segunda corrida, significan que el objeto se elimina y se vuelve a
-- crear con la misma definición, dejando el mismo estado final.
-- ============================================================

-- ── 1. Columna payment_number (nullable por ahora; NOT NULL al final) ──────────
ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS payment_number INTEGER;

-- ── 2. Backfill + UNIQUE + NOT NULL, bajo lock exclusivo de escritura ──────────
DO $$
BEGIN
  -- Bloquea INSERT/UPDATE/DELETE concurrentes sobre crm_payments hasta
  -- el COMMIT de esta migración. No bloquea SELECT.
  LOCK TABLE public.crm_payments IN SHARE ROW EXCLUSIVE MODE;
END $$;

DO $$
DECLARE
  v_null_count integer;
BEGIN
  -- Snapshot consistente: el CTE existing_max se evalúa una sola vez,
  -- dentro de esta misma sentencia, bajo el lock tomado arriba. Cada
  -- fila NULL recibe MAX(payment_number existente para su business_id)
  -- + ROW_NUMBER() dentro de ese business_id: nunca reutiliza huecos
  -- históricos, siempre continúa desde MAX + 1 en adelante.
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

  SELECT count(*) INTO v_null_count
  FROM public.crm_payments
  WHERE payment_number IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'crm_payments backfill incompleto: % filas siguen con payment_number NULL',
      v_null_count;
  END IF;
END $$;

-- UNIQUE (business_id, payment_number) -- existencia comprobada contra
-- public.crm_payments explícitamente (conrelid), no solo por conname,
-- para no confundirla con un constraint homónimo en otra tabla.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.crm_payments'::regclass
      AND conname  = 'crm_payments_business_payment_number_unique'
  ) THEN
    ALTER TABLE public.crm_payments
      ADD CONSTRAINT crm_payments_business_payment_number_unique
      UNIQUE (business_id, payment_number);
  END IF;
END $$;

-- No-op si ya es NOT NULL (segunda corrida).
ALTER TABLE public.crm_payments
  ALTER COLUMN payment_number SET NOT NULL;

-- ── 3. crm_next_payment_number(uuid) — cuerpo exacto de producción ─────────────
CREATE OR REPLACE FUNCTION public.crm_next_payment_number(p_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_next_number INTEGER;
BEGIN
  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'business_id is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_business_id::TEXT));

  SELECT COALESCE(MAX(payment_number), 0) + 1
  INTO v_next_number
  FROM public.crm_payments
  WHERE business_id = p_business_id;

  RETURN v_next_number;
END;
$function$;

-- ── 4. crm_set_payment_number() — cuerpo exacto de producción ──────────────────
CREATE OR REPLACE FUNCTION public.crm_set_payment_number()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.payment_number IS NULL THEN
    NEW.payment_number := public.crm_next_payment_number(NEW.business_id);
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 5. Trigger de numeración ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS crm_payments_set_payment_number ON public.crm_payments;
CREATE TRIGGER crm_payments_set_payment_number
  BEFORE INSERT ON public.crm_payments
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_payment_number();

-- ── 6. Columna updated_at ────────────────────────────────────────────────────
ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── 7. Trigger updated_at, reutilizando wa_set_updated_at() existente ─────────
DROP TRIGGER IF EXISTS crm_payments_updated_at ON public.crm_payments;
CREATE TRIGGER crm_payments_updated_at
  BEFORE UPDATE ON public.crm_payments
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- ── 8. Policies owner_* (duplicados funcionales de las policies sin ───────────
--       prefijo creadas en 20260530210000_crm_payments.sql; producción
--       tiene ambos juegos, este archivo solo reproduce los owner_*)
DROP POLICY IF EXISTS "crm_payments_owner_select" ON public.crm_payments;
CREATE POLICY "crm_payments_owner_select"
  ON public.crm_payments FOR SELECT TO authenticated
  USING (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "crm_payments_owner_insert" ON public.crm_payments;
CREATE POLICY "crm_payments_owner_insert"
  ON public.crm_payments FOR INSERT TO authenticated
  WITH CHECK (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "crm_payments_owner_update" ON public.crm_payments;
CREATE POLICY "crm_payments_owner_update"
  ON public.crm_payments FOR UPDATE TO authenticated
  USING (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "crm_payments_owner_delete" ON public.crm_payments;
CREATE POLICY "crm_payments_owner_delete"
  ON public.crm_payments FOR DELETE TO authenticated
  USING (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

-- ── 9. Policy admin ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "crm_payments_admin_all" ON public.crm_payments;
CREATE POLICY "crm_payments_admin_all"
  ON public.crm_payments FOR ALL TO authenticated
  USING (public.wa_is_admin())
  WITH CHECK (public.wa_is_admin());

-- ── 10. GRANT mínimo de tabla para authenticated ───────────────────────────────
-- Explícito y acotado a propósito: sin este GRANT, RLS nunca llega a
-- evaluarse (el chequeo de privilegio de tabla de Postgres ocurre antes).
-- No se otorga nada a service_role ni postgres, y no se otorgan
-- DELETE/TRUNCATE/REFERENCES/TRIGGER: no hay uso real de la app que los
-- requiera hoy.

-- ── 11. Hardening: revocar TODO de anon ─────────────────────────────────────
-- anon heredaba privilegios implícitos de plataforma (REFERENCES, TRIGGER,
-- TRUNCATE, etc.) sobre crm_payments, igual que producción. Ninguna policy
-- es TO anon (RLS ya lo deja en cero filas), pero el privilegio de tabla
-- subyacente no depende de RLS -- se revoca explícitamente. No se toca
-- service_role ni postgres.
REVOKE ALL PRIVILEGES
  ON TABLE public.crm_payments
  FROM anon;

-- authenticated también heredaba privilegios implícitos de plataforma
-- adicionales (REFERENCES, TRIGGER, TRUNCATE) sobre crm_payments, igual que
-- producción. Se revoca todo primero y se vuelve a otorgar exactamente el
-- mínimo real de la app a continuación.
REVOKE ALL PRIVILEGES
  ON TABLE public.crm_payments
  FROM authenticated;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.crm_payments
  TO authenticated;

-- ── 12. Refrescar schema cache de PostgREST ────────────────────────────────────
NOTIFY pgrst, 'reload schema';
