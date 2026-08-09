-- ============================================================
-- Referral / Affiliate Core — corrección user-centric sobre Parte 1
-- (supabase/migrations/20260808100000_referral_core_part1.sql, INTACTA:
-- esta migración no la edita, la evoluciona por encima).
--
-- Decisión de producto que motiva este archivo, en dos capas:
--
-- CAPA 1 — identidad: NO debe ser necesario crear ni poseer un negocio en
-- Walinka para participar como referidor. Parte 1 ancló toda la identidad
-- económica a business_id; esto bloqueaba a cualquier persona sin
-- wa_businesses. Identidad canónica a partir de acá:
--   referrer_user_id / referred_user_id  (auth.users, siempre existen)
--
-- CAPA 2 — calificación económica: la política comercial final es
--   "US$5 cuando el referido complete 2 meses pagos consecutivos en
--   Walinka" — NO "US$5 en el primer pago". Se auditó exhaustivamente
--   intentar inferir "2 meses" contando filas de wa_payments (approved) y
--   se encontraron múltiples colisiones reales e irresolubles dentro de
--   Affiliate Core sin tocar billing/webhooks:
--     - upgrades/downgrades a mitad de período generan filas 'approved'
--       adicionales que no representan un mes nuevo cumplido.
--     - el mismo user_id con 2 negocios puede generar 2 filas 'approved'
--       el mismo día (2 suscripciones distintas, no 2 meses de una).
--     - checkouts duplicados/reintentos pueden generar 2 filas 'approved'
--       para lo que el cliente considera un solo pago.
--     - pagos internos de proration ($0 real, provider='internal_proration')
--       se insertan directo en status='approved' sin que haya pasado dinero.
--     - dLocal (provider='dlocal_go', integración viva en
--       backend/src/services/billing/dlocalWebhookService.js, DISTINTA del
--       stub muerto supabase/functions/dlocal-webhook que responde 410)
--       nunca escribe plan_expires_at en wa_payments, rompiendo cualquier
--       cálculo de límite de período basado en esa columna.
--     - PayPal (proveedor activo real, default para todo país fuera de
--       Chile) JAMÁS escribe en wa_payments -- vive enteramente en
--       billing_subscriptions vía backend/src/services/subscriptions/. Un
--       referido que paga solo por PayPal sería estructuralmente invisible
--       para cualquier lógica basada en wa_payments.
--   Conclusión de la auditoría: Affiliate Core NO puede ni debe intentar
--   reconstruir "cuántos meses pagó este usuario" a partir de wa_payments.
--   Esa responsabilidad se traslada por completo a Billing (hoy no
--   construido) a través de una interfaz mínima:
--     Billing confirma un mes pagado -> wa_register_referral_paid_period()
--     -> Affiliate Core registra el progreso, sin conocer providers,
--        fechas de plan, ni prorrateos.
--   Contrato de confianza explícito: Affiliate Core confía en que Billing
--   solo invoca wa_register_referral_paid_period() para meses reales y
--   consecutivos. Affiliate Core garantiza, y solo garantiza: no duplicar
--   el mismo period_ref, contar el progreso correctamente, y crear la
--   recompensa una sola vez. No valida providers, fechas, planes ni
--   prorrateos -- esa validación es responsabilidad de Billing.
--   dLocal queda explícitamente FUERA del alcance del programa de
--   afiliados (no se adapta, no se elimina del billing general). PayPal
--   permanece conceptualmente parte del programa (el afiliado puede
--   cobrar vía PayPal; un referido que paga vía PayPal sigue siendo un
--   referido válido) -- el gap de detección de sus períodos queda
--   documentado, no resuelto acá.
--
-- Pagos AL AFILIADO (cómo Walinka le paga su recompensa) son un módulo
-- futuro e independiente (método de cobro, saldo, solicitud de retiro,
-- estado, comprobante) -- explícitamente FUERA de esta migración.
--
-- Identidad económica de Parte 1 (todo ancla a business_id porque
-- wa_businesses.user_id no tenía UNIQUE) se reemplaza: ahora ancla a
-- user_id directamente (auth.users.id es la identidad real y siempre
-- existe, sin depender de que exista ningún negocio).
--
-- BACKFILL DEFENSIVO: wa_businesses.user_id NO tiene NOT NULL a nivel de
-- esquema (20260309142017_wa_catalog_app.sql:11). Todo backfill de este
-- archivo valida explícitamente que no queden NULL inesperados y FALLA la
-- migración (RAISE EXCEPTION) si encuentra un caso no migrable, en vez de
-- adivinar. Orden respetado en cada tabla: columna nueva nullable ->
-- backfill -> validar -> FK/UNIQUE nuevos -> SET NOT NULL -> recién ahí
-- eliminar constraints/FK/columnas antiguas.
--
-- FUERA DE ALCANCE, a propósito (sin tocar en este archivo):
--   - mp-webhook / paddle-webhook / backend de billing / PayPal / dLocal:
--     ninguno se toca. wa_register_referral_paid_period() queda lista
--     para que una futura integración de Billing la invoque; nadie la
--     invoca todavía.
--   - Signup/onboarding, R1 (wa_handle_new_user_business), R2, Product
--     Editor, CRM: ninguno se toca.
--   - Frontend: cero cambios (esta migración es solo capa de datos).
--   - Panel de Referidos y módulo de retiros al afiliado: deliberadamente
--     NO incluidos acá -- fases siguientes, después del panel base.
--
-- Parte 1 (20260808100000_referral_core_part1.sql) y su diagnóstico
-- (verify_referral_core_part1.sql) quedan INTACTOS como historia
-- verificable del diseño original -- no se editan ni se borran.
-- ============================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. referral_codes: business_id -> user_id
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.referral_codes
  ADD COLUMN IF NOT EXISTS user_id      UUID NULL,
  ADD COLUMN IF NOT EXISTS display_name TEXT NULL;

-- Backfill defensivo: business_id (wa_businesses.id) -> wa_businesses.user_id.
UPDATE public.referral_codes rc
SET user_id      = b.user_id,
    display_name = COALESCE(rc.display_name, b.name)
FROM public.wa_businesses b
WHERE rc.business_id = b.id
  AND rc.user_id IS NULL;

DO $$
DECLARE
  v_unresolved_count INTEGER;
BEGIN
  SELECT count(*) INTO v_unresolved_count
  FROM public.referral_codes
  WHERE user_id IS NULL;

  IF v_unresolved_count > 0 THEN
    RAISE EXCEPTION
      'referral_codes: % fila(s) no se pudieron backfillear a user_id (wa_businesses.user_id NULL o business_id huérfano). Migración detenida -- requiere resolución manual, no se adivina.',
      v_unresolved_count;
  END IF;
END $$;

ALTER TABLE public.referral_codes
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.referral_codes
  ADD CONSTRAINT referral_codes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS referral_codes_business_id_uq;
CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_user_id_uq ON public.referral_codes(user_id);
-- referral_codes_code_uq (código único global): sin cambios.

ALTER TABLE public.referral_codes DROP CONSTRAINT IF EXISTS referral_codes_business_id_fkey;

-- La policy de Parte 1 referencia business_id en su USING -- debe caer
-- ANTES del DROP COLUMN, o Postgres rechaza el DROP COLUMN (dependencia
-- real, no CASCADE): "policy referral_codes_owner_select depends on
-- column business_id". Se recrea de inmediato con la condición user-centric.
DROP POLICY IF EXISTS "referral_codes_owner_select" ON public.referral_codes;
CREATE POLICY "referral_codes_owner_select" ON public.referral_codes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- referral_codes_admin_select: no referencia business_id, no bloquea, sin cambios.

ALTER TABLE public.referral_codes DROP COLUMN IF EXISTS business_id;

COMMENT ON TABLE public.referral_codes IS
  'Código de referido por USUARIO (no por negocio). Se crea vía wa_get_or_create_my_referral_code(); sin INSERT/UPDATE directo desde cliente.';
COMMENT ON COLUMN public.referral_codes.user_id IS
  'Identidad canónica del referidor: auth.users.id. Un usuario puede tener 0, 1 o N negocios -- ninguno es requisito para tener código.';
COMMENT ON COLUMN public.referral_codes.display_name IS
  'Snapshot de nombre a mostrar (tomado al crear el código, best-effort desde auth.users). wa_resolve_referral_code() nunca expone email ni user_id.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. referral_attributions: referrer_business_id -> referrer_user_id;
--    referred_user_id pasa a ser el ancla de unicidad;
--    referred_business_id pasa a nullable, deja de ser identidad.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.referral_attributions
  ADD COLUMN IF NOT EXISTS referrer_user_id UUID NULL;

UPDATE public.referral_attributions ra
SET referrer_user_id = b.user_id
FROM public.wa_businesses b
WHERE ra.referrer_business_id = b.id
  AND ra.referrer_user_id IS NULL;

DO $$
DECLARE
  v_unresolved_count INTEGER;
BEGIN
  SELECT count(*) INTO v_unresolved_count
  FROM public.referral_attributions
  WHERE referrer_user_id IS NULL;

  IF v_unresolved_count > 0 THEN
    RAISE EXCEPTION
      'referral_attributions: % fila(s) no se pudieron backfillear referrer_user_id (wa_businesses.user_id NULL o referrer_business_id huérfano). Migración detenida.',
      v_unresolved_count;
  END IF;
END $$;

ALTER TABLE public.referral_attributions
  ALTER COLUMN referrer_user_id SET NOT NULL;

ALTER TABLE public.referral_attributions
  ADD CONSTRAINT referral_attributions_referrer_user_id_fkey
  FOREIGN KEY (referrer_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS referral_attributions_referred_business_uq;
CREATE UNIQUE INDEX IF NOT EXISTS referral_attributions_referred_user_uq
  ON public.referral_attributions(referred_user_id);

DROP INDEX IF EXISTS referral_attributions_referrer_idx;
CREATE INDEX IF NOT EXISTS referral_attributions_referrer_user_idx
  ON public.referral_attributions(referrer_user_id);
-- referral_attributions_referred_user_idx, referral_attributions_status_idx: sin cambios.

ALTER TABLE public.referral_attributions DROP CONSTRAINT IF EXISTS referral_attributions_no_self_referral;
ALTER TABLE public.referral_attributions
  ADD CONSTRAINT referral_attributions_no_self_referral
  CHECK (referrer_user_id <> referred_user_id);

ALTER TABLE public.referral_attributions DROP CONSTRAINT IF EXISTS referral_attributions_referrer_business_id_fkey;

-- La policy de Parte 1 referencia referrer_business_id en su USING --
-- debe caer ANTES del DROP COLUMN por la misma razón que en referral_codes.
DROP POLICY IF EXISTS "referral_attributions_referrer_select" ON public.referral_attributions;
CREATE POLICY "referral_attributions_referrer_select" ON public.referral_attributions
  FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid());
-- referral_attributions_referred_select (ya usaba referred_user_id) y
-- referral_attributions_admin_select (wa_is_admin()): no bloquean, sin cambios.

ALTER TABLE public.referral_attributions DROP COLUMN IF EXISTS referrer_business_id;

ALTER TABLE public.referral_attributions DROP CONSTRAINT IF EXISTS referral_attributions_referred_business_id_fkey;
ALTER TABLE public.referral_attributions
  ALTER COLUMN referred_business_id DROP NOT NULL;
ALTER TABLE public.referral_attributions
  ADD CONSTRAINT referral_attributions_referred_business_id_fkey
  FOREIGN KEY (referred_business_id) REFERENCES public.wa_businesses(id) ON DELETE SET NULL;

COMMENT ON TABLE public.referral_attributions IS
  'Atribución referido->referidor, identidad EXCLUSIVAMENTE por referred_user_id/referrer_user_id (auth.users). Fijada una sola vez en el signup, sin requerir ningún negocio. Se crea vía wa_attribute_referral(); sin INSERT/UPDATE directo desde cliente.';
COMMENT ON COLUMN public.referral_attributions.referred_business_id IS
  'Histórico/compatibilidad únicamente -- NUNCA se usa para localizar una atribución (eso es referred_user_id). Nullable: un referido puede no tener negocio nunca, o tener más de uno con el tiempo.';
COMMENT ON COLUMN public.referral_attributions.referrer_user_id IS
  'Identidad canónica del referidor: auth.users.id. No requiere wa_businesses.';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. referral_commissions: referrer_business_id -> referrer_user_id
--    (beneficiario). Se retira toda dependencia de provider/pago
--    específico -- la recompensa ya no nace de "un pago", nace de que
--    Affiliate Core cuenta 2 meses en referral_paid_periods (sección 5).
--    referred_business_id y wa_payment_id se CONSERVAN, pero como
--    metadatos NULLABLE opcionales de trazabilidad -- NUNCA participan en
--    unicidad, conteo de meses, resolución de atribución ni calificación.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.referral_commissions
  ADD COLUMN IF NOT EXISTS referrer_user_id UUID NULL;

UPDATE public.referral_commissions rc
SET referrer_user_id = b.user_id
FROM public.wa_businesses b
WHERE rc.referrer_business_id = b.id
  AND rc.referrer_user_id IS NULL;

DO $$
DECLARE
  v_unresolved_count INTEGER;
BEGIN
  SELECT count(*) INTO v_unresolved_count
  FROM public.referral_commissions
  WHERE referrer_user_id IS NULL;

  IF v_unresolved_count > 0 THEN
    RAISE EXCEPTION
      'referral_commissions: % fila(s) no se pudieron backfillear referrer_user_id (wa_businesses.user_id NULL o referrer_business_id huérfano). Migración detenida.',
      v_unresolved_count;
  END IF;
END $$;

ALTER TABLE public.referral_commissions
  ALTER COLUMN referrer_user_id SET NOT NULL;

ALTER TABLE public.referral_commissions
  ADD CONSTRAINT referral_commissions_referrer_user_id_fkey
  FOREIGN KEY (referrer_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS referral_commissions_referrer_status_idx;
CREATE INDEX IF NOT EXISTS referral_commissions_referrer_user_status_idx
  ON public.referral_commissions(referrer_user_id, status);

ALTER TABLE public.referral_commissions DROP CONSTRAINT IF EXISTS referral_commissions_referrer_business_id_fkey;

-- La policy de Parte 1 referencia referrer_business_id en su USING --
-- debe caer ANTES del DROP COLUMN por la misma razón que en las 2 tablas
-- anteriores.
DROP POLICY IF EXISTS "referral_commissions_referrer_select" ON public.referral_commissions;
CREATE POLICY "referral_commissions_referrer_select" ON public.referral_commissions
  FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid());
-- referral_commissions_admin_select (wa_is_admin()): no bloquea, sin cambios.

ALTER TABLE public.referral_commissions DROP COLUMN IF EXISTS referrer_business_id;

-- referred_business_id: pasa a nullable, metadato opcional (qué negocio
-- del referido existía/pagaba en el momento en que Billing confirmó el
-- período, si Billing decide informarlo -- wa_register_referral_paid_period
-- ni siquiera recibe este dato hoy, así que queda NULL en la práctica).
ALTER TABLE public.referral_commissions DROP CONSTRAINT IF EXISTS referral_commissions_referred_business_id_fkey;
ALTER TABLE public.referral_commissions
  ALTER COLUMN referred_business_id DROP NOT NULL;
ALTER TABLE public.referral_commissions
  ADD CONSTRAINT referral_commissions_referred_business_id_fkey
  FOREIGN KEY (referred_business_id) REFERENCES public.wa_businesses(id) ON DELETE SET NULL;
DROP INDEX IF EXISTS referral_commissions_referred_idx;

-- provider / provider_payment_ref: se ELIMINAN por completo. Affiliate
-- Core no depende de providers -- la idempotencia real vive en
-- referral_paid_periods(referral_attribution_id, period_ref) (sección 5).
DROP INDEX IF EXISTS referral_commissions_provider_payment_uq;
ALTER TABLE public.referral_commissions DROP CONSTRAINT IF EXISTS referral_commissions_provider_check;
ALTER TABLE public.referral_commissions DROP CONSTRAINT IF EXISTS referral_commissions_provider_payment_ref_not_blank;
ALTER TABLE public.referral_commissions DROP COLUMN IF EXISTS provider;
ALTER TABLE public.referral_commissions DROP COLUMN IF EXISTS provider_payment_ref;

-- gross_amount / commission_rate: ya no aplican -- la recompensa es un
-- monto FIJO de política (referral_program_terms), no un porcentaje de
-- ningún pago específico.
ALTER TABLE public.referral_commissions DROP CONSTRAINT IF EXISTS referral_commissions_amounts_check;
ALTER TABLE public.referral_commissions DROP COLUMN IF EXISTS gross_amount;
ALTER TABLE public.referral_commissions DROP COLUMN IF EXISTS commission_rate;

-- commission_amount / currency_code -> reward_amount / reward_currency
-- (mismo slot de columna, renombrado para reflejar la semántica nueva).
ALTER TABLE public.referral_commissions RENAME COLUMN commission_amount TO reward_amount;
ALTER TABLE public.referral_commissions RENAME COLUMN currency_code TO reward_currency;

-- Snapshot de las condiciones aplicadas -- inmutable en cada fila, para
-- que cambiar la política más adelante (UPDATE en referral_program_terms)
-- nunca altere recompensas ya otorgadas.
ALTER TABLE public.referral_commissions
  ADD COLUMN IF NOT EXISTS required_paid_months INTEGER NULL,
  ADD COLUMN IF NOT EXISTS terms_version         INTEGER NULL;

DO $$
DECLARE
  v_unresolved_count INTEGER;
BEGIN
  SELECT count(*) INTO v_unresolved_count
  FROM public.referral_commissions
  WHERE required_paid_months IS NULL OR terms_version IS NULL;

  IF v_unresolved_count > 0 THEN
    RAISE EXCEPTION
      'referral_commissions: % fila(s) preexistentes sin required_paid_months/terms_version -- requiere backfill manual explícito antes de continuar (no hay valor por defecto seguro para inventar).',
      v_unresolved_count;
  END IF;
END $$;

ALTER TABLE public.referral_commissions
  ALTER COLUMN required_paid_months SET NOT NULL,
  ALTER COLUMN terms_version         SET NOT NULL;

-- kind: un solo valor válido -- nace al cumplirse la condición de
-- permanencia (2 meses pagos), no con "el primer pago".
ALTER TABLE public.referral_commissions DROP CONSTRAINT IF EXISTS referral_commissions_kind_check;
ALTER TABLE public.referral_commissions ALTER COLUMN kind SET DEFAULT 'qualification_reward';
ALTER TABLE public.referral_commissions ADD CONSTRAINT referral_commissions_kind_check
  CHECK (kind = 'qualification_reward');

-- Unicidad de recompensa: mismo mecanismo exacto de Parte 1
-- (UNIQUE(referral_attribution_id) WHERE kind = <valor>), solo cambia el
-- predicado al nuevo valor de kind. Como referral_attribution_id ya es
-- 1:1 con referred_user_id, esto es "una recompensa por USUARIO referido,
-- para siempre" -- nunca por negocio, nunca por mes individual.
DROP INDEX IF EXISTS referral_commissions_first_payment_uq;
CREATE UNIQUE INDEX IF NOT EXISTS referral_commissions_qualification_reward_uq
  ON public.referral_commissions(referral_attribution_id)
  WHERE kind = 'qualification_reward';

-- referral_commissions_status_check, referral_commissions_reversed_reason_check,
-- referral_commissions_pending_idx: SIN CAMBIOS.

COMMENT ON TABLE public.referral_commissions IS
  'Recompensa fija (qualification_reward) otorgada cuando Affiliate Core cuenta required_paid_months períodos en referral_paid_periods para la atribución. Beneficiario = referrer_user_id (auth.users, sin requerir negocio). reward_amount/reward_currency/required_paid_months/terms_version son un snapshot inmutable de referral_program_terms al momento de crearse -- cambios futuros de política nunca alteran filas existentes. referred_business_id y wa_payment_id son metadatos OPCIONALES de trazabilidad (nullable, ON DELETE SET NULL): nunca participan en unicidad, conteo ni calificación. Se crea vía wa_register_referral_paid_period(), restringida a service_role.';
COMMENT ON COLUMN public.referral_commissions.referrer_user_id IS
  'Beneficiario de la recompensa: auth.users.id. No requiere wa_businesses.';
COMMENT ON COLUMN public.referral_commissions.referred_business_id IS
  'Metadato opcional de trazabilidad únicamente -- NULL si Billing no lo informa (hoy siempre NULL: wa_register_referral_paid_period no lo recibe). Nunca se usa para calificar ni para la unicidad de la recompensa.';
COMMENT ON COLUMN public.referral_commissions.wa_payment_id IS
  'Metadato opcional de trazabilidad únicamente -- NULL si Billing no lo informa. Nunca se usa para calificar ni para la unicidad de la recompensa.';
COMMENT ON COLUMN public.referral_commissions.required_paid_months IS
  'Snapshot de referral_program_terms.required_paid_months al momento de crear esta fila -- inmutable.';
COMMENT ON COLUMN public.referral_commissions.terms_version IS
  'Snapshot de referral_program_terms.version al momento de crear esta fila -- inmutable.';

-- ═══════════════════════════════════════════════════════════════════════
-- 4. referral_program_terms — configuración explícita del programa, para
--    poder cambiar monto/moneda/meses requeridos/hold sin tocar la RPC.
--
--    Diseño: tabla singleton mutable (índice único sobre una expresión
--    constante garantiza, a nivel de esquema, que nunca hay más de 1
--    fila -- "la política vigente" es siempre inequívoca). Se prefirió
--    sobre una tabla versionada append-only porque cada
--    referral_commissions YA guarda su propio snapshot inmutable
--    (reward_amount/reward_currency/required_paid_months/terms_version):
--    el historial de qué política aplicó a cada recompensa ya queda
--    preservado ahí -- mantener además un historial completo acá sería
--    redundante. Un trigger incrementa version en cada UPDATE, para que
--    nadie tenga que acordarse de hacerlo manualmente.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.referral_program_terms (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  version               INTEGER     NOT NULL DEFAULT 1,
  reward_amount         NUMERIC(12,2) NOT NULL,
  reward_currency       TEXT        NOT NULL,
  required_paid_months  INTEGER     NOT NULL,
  hold_days             INTEGER     NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referral_program_terms_positive_check
    CHECK (reward_amount >= 0 AND required_paid_months >= 1 AND hold_days >= 0)
);

-- Truco estándar de Postgres para "como mucho 1 fila": índice único sobre
-- una expresión constante. Garantiza a nivel de esquema que nunca hay
-- ambigüedad sobre "cuál es la política vigente".
CREATE UNIQUE INDEX referral_program_terms_singleton ON public.referral_program_terms ((true));

CREATE OR REPLACE FUNCTION public.referral_program_terms_bump_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER referral_program_terms_bump_version
  BEFORE UPDATE ON public.referral_program_terms
  FOR EACH ROW EXECUTE FUNCTION public.referral_program_terms_bump_version();

INSERT INTO public.referral_program_terms
  (version, reward_amount, reward_currency, required_paid_months, hold_days)
VALUES (1, 5.00, 'USD', 2, 7);

ALTER TABLE public.referral_program_terms ENABLE ROW LEVEL SECURITY;

-- Términos comerciales públicos del programa (no son datos sensibles) --
-- útil el día que exista un panel mostrando "gana US$5 tras 2 meses".
-- Sin políticas de INSERT/UPDATE/DELETE para ningún rol cliente: cambios
-- de política solo por migración o una futura RPC admin (no construida).
CREATE POLICY "referral_program_terms_public_select" ON public.referral_program_terms
  FOR SELECT TO anon, authenticated
  USING (true);

COMMENT ON TABLE public.referral_program_terms IS
  'Configuración explícita y versionada del programa de afiliados (singleton: como mucho 1 fila, forzado por índice único). version se auto-incrementa en cada UPDATE. Cambiar reward_amount/reward_currency/required_paid_months/hold_days acá NUNCA modifica recompensas ya otorgadas (cada referral_commissions guarda su propio snapshot inmutable).';

-- ═══════════════════════════════════════════════════════════════════════
-- 5. referral_paid_periods — ledger canónico de progreso. Única fuente de
--    verdad para "cuántos meses lleva pagados" un usuario referido.
--    Idempotencia: UNIQUE(referral_attribution_id, period_ref) -- Billing
--    entrega period_ref como clave opaca (Affiliate Core no la
--    interpreta); el mismo evento nunca se cuenta dos veces.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.referral_paid_periods (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_attribution_id UUID        NOT NULL REFERENCES public.referral_attributions(id) ON DELETE CASCADE,
  referred_user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_ref              TEXT        NOT NULL CHECK (btrim(period_ref) <> ''),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX referral_paid_periods_attribution_period_uq
  ON public.referral_paid_periods(referral_attribution_id, period_ref);

CREATE INDEX referral_paid_periods_attribution_idx
  ON public.referral_paid_periods(referral_attribution_id);

ALTER TABLE public.referral_paid_periods ENABLE ROW LEVEL SECURITY;

-- El propio referido ve su progreso.
CREATE POLICY "referral_paid_periods_referred_select" ON public.referral_paid_periods
  FOR SELECT TO authenticated
  USING (referred_user_id = auth.uid());

-- El referidor ve el progreso de las personas que él refirió.
CREATE POLICY "referral_paid_periods_referrer_select" ON public.referral_paid_periods
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.referral_attributions ra
    WHERE ra.id = referral_paid_periods.referral_attribution_id
      AND ra.referrer_user_id = auth.uid()
  ));

CREATE POLICY "referral_paid_periods_admin_select" ON public.referral_paid_periods
  FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- Sin políticas de INSERT/UPDATE/DELETE para ningún rol cliente: solo
-- wa_register_referral_paid_period() (service_role) escribe acá.

COMMENT ON TABLE public.referral_paid_periods IS
  'Ledger canónico de progreso hacia la recompensa: un período pagado real y consecutivo, confirmado por Billing, es una fila. paid_months se DERIVA con COUNT(*) sobre esta tabla -- no existe un contador mutable en ningún otro lado. Se crea exclusivamente vía wa_register_referral_paid_period() (service_role).';
COMMENT ON COLUMN public.referral_paid_periods.period_ref IS
  'Clave idempotente OPACA que Billing entrega (puede ser un wa_payments.id, un "<provider>:<payment_ref>", una etiqueta de mes, lo que Billing decida). Affiliate Core no la interpreta -- solo garantiza que el mismo (referral_attribution_id, period_ref) nunca se cuenta dos veces.';

-- (Sección 6 -- reemplazo de las 3 policies de Parte 1 que dependían de
-- columnas legacy -- ya se aplicó inline en las secciones 1-3, justo
-- antes de cada DROP COLUMN correspondiente. No puede diferirse hasta acá:
-- Postgres rechaza DROP COLUMN mientras una policy siga referenciando esa
-- columna en su USING/WITH CHECK, y este archivo no usa CASCADE en
-- ningún DROP.)

-- ═══════════════════════════════════════════════════════════════════════
-- 6b. Privilegios base de TABLA. RLS nunca es lo primero que evalúa
--    Postgres: sin GRANT de tabla, cualquier SELECT falla con
--    "permission denied for table ..." antes de que ninguna policy
--    llegue a mirarse. En un proyecto Supabase hosteado, el default
--    grant de la plataforma (ALTER DEFAULT PRIVILEGES fuera de este
--    repo) ya cubre esto de forma implícita para tablas nuevas -- el
--    shadow local de `supabase db reset` no lo replica, por eso el
--    diagnóstico lo destapó. Mínimo exacto, coherente con las policies
--    ya creadas: SELECT únicamente, ningún otro privilegio. Ninguna
--    policy es TO anon salvo la de referral_program_terms (términos
--    públicos del programa) -- por eso es la única tabla de esta lista
--    que también recibe SELECT para anon.
-- ═══════════════════════════════════════════════════════════════════════

GRANT SELECT ON TABLE public.referral_codes TO authenticated;
GRANT SELECT ON TABLE public.referral_attributions TO authenticated;
GRANT SELECT ON TABLE public.referral_commissions TO authenticated;
GRANT SELECT ON TABLE public.referral_paid_periods TO authenticated;

GRANT SELECT ON TABLE public.referral_program_terms TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. RPCs
-- ═══════════════════════════════════════════════════════════════════════

-- 7.1 wa_resolve_referral_code(p_code) — misma firma y contrato público
-- ({valid, referrerName}), ya no hace JOIN a wa_businesses.
CREATE OR REPLACE FUNCTION public.wa_resolve_referral_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := lower(btrim(COALESCE(p_code, '')));
  v_display_name TEXT;
BEGIN
  IF v_code = '' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT display_name INTO v_display_name
  FROM public.referral_codes
  WHERE code = v_code AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object('valid', true, 'referrerName', COALESCE(v_display_name, 'Alguien'));
END;
$$;

REVOKE ALL ON FUNCTION public.wa_resolve_referral_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_resolve_referral_code(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.wa_resolve_referral_code(TEXT) IS
  'Resolución pública de un código de referido. Solo devuelve nombre a mostrar + validez, nunca user_id/email/business.';

-- 7.2 wa_get_or_create_my_referral_code() — misma firma (sin parámetros).
-- Deja de tocar wa_businesses por completo: funciona con auth.uid() solo.
CREATE OR REPLACE FUNCTION public.wa_get_or_create_my_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_display   TEXT;
  v_existing  TEXT;
  v_base_slug TEXT;
  v_code      TEXT;
  v_suffix    TEXT;
  v_counter   INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT code INTO v_existing FROM public.referral_codes WHERE user_id = v_user_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT COALESCE(
    NULLIF(btrim(raw_user_meta_data->>'full_name'), ''),
    NULLIF(btrim(raw_user_meta_data->>'name'), ''),
    NULLIF(btrim(split_part(COALESCE(email, ''), '@', 1)), ''),
    'ref'
  ) INTO v_display
  FROM auth.users
  WHERE id = v_user_id;

  v_base_slug := lower(regexp_replace(COALESCE(v_display, 'ref'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN
    v_base_slug := 'ref';
  END IF;
  v_base_slug := left(v_base_slug, 20);

  v_suffix := substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 5);
  v_code   := v_base_slug || '-' || v_suffix;

  WHILE EXISTS (SELECT 1 FROM public.referral_codes WHERE code = v_code) LOOP
    v_counter := v_counter + 1;
    v_code := v_base_slug || '-' || v_suffix || v_counter::TEXT;
  END LOOP;

  -- ON CONFLICT cubre la carrera de dos llamadas concurrentes del mismo
  -- usuario: la segunda no falla, devuelve el código que ya ganó la primera.
  INSERT INTO public.referral_codes (user_id, code, display_name)
  VALUES (v_user_id, v_code, v_display)
  ON CONFLICT (user_id) DO UPDATE SET code = public.referral_codes.code
  RETURNING code INTO v_code;

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_get_or_create_my_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_get_or_create_my_referral_code() TO authenticated;

COMMENT ON FUNCTION public.wa_get_or_create_my_referral_code() IS
  'Autoservicio: devuelve el código del USUARIO caller, creándolo si no existe. No requiere wa_businesses. Idempotente bajo concurrencia via ON CONFLICT.';

-- 7.3 wa_attribute_referral(p_code, p_click_at) — el referido es
-- auth.uid() directo, sin business_id. Elimina explícitamente el overload
-- de 3 argumentos de Parte 1 para que PostgREST no exponga dos versiones.
DROP FUNCTION IF EXISTS public.wa_attribute_referral(UUID, TEXT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.wa_attribute_referral(
  p_code TEXT,
  p_click_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attribution_window_days CONSTANT INTEGER := 30; -- server-side; no configurable por el cliente
  v_referred_user_id UUID := auth.uid();
  v_code             TEXT := lower(btrim(COALESCE(p_code, '')));
  v_code_row         public.referral_codes%ROWTYPE;
  v_referrer_email   TEXT;
  v_referred_email   TEXT;
  v_status           TEXT := 'qualified';
  v_reason           TEXT := NULL;
  v_attribution_id   UUID;
BEGIN
  IF v_referred_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'empty_code');
  END IF;

  -- UNIQUE(referred_user_id): un usuario referido, una sola atribución,
  -- para siempre -- ya no depende de que exista ningún negocio.
  IF EXISTS (
    SELECT 1 FROM public.referral_attributions WHERE referred_user_id = v_referred_user_id
  ) THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'already_attributed');
  END IF;

  SELECT * INTO v_code_row FROM public.referral_codes WHERE code = v_code AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'invalid_code');
  END IF;

  -- Auto-referido: comparación directa de user_id, sin indirección de negocio.
  IF v_code_row.user_id = v_referred_user_id THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'self_referral');
  END IF;

  -- click_at es evidencia de cliente no confiable (localStorage): solo se
  -- acota su plausibilidad contra la ventana server-side, igual que Parte 1.
  IF p_click_at IS NOT NULL THEN
    IF p_click_at > now() THEN
      RETURN jsonb_build_object('attributed', false, 'reason', 'click_in_future');
    END IF;
    IF p_click_at < (now() - make_interval(days => v_attribution_window_days)) THEN
      RETURN jsonb_build_object('attributed', false, 'reason', 'click_window_expired');
    END IF;
  END IF;

  -- Duplicate-person: identidad real de auth.users, nunca wa_businesses.email.
  SELECT lower(btrim(email)) INTO v_referrer_email FROM auth.users WHERE id = v_code_row.user_id;
  SELECT lower(btrim(email)) INTO v_referred_email FROM auth.users WHERE id = v_referred_user_id;

  IF v_referrer_email IS NOT NULL AND v_referrer_email = v_referred_email THEN
    v_status := 'disqualified';
    v_reason := 'duplicate_person';
  END IF;

  INSERT INTO public.referral_attributions (
    referred_user_id, referrer_user_id,
    referral_code_id, code_snapshot, click_at, status, disqualified_reason
  ) VALUES (
    v_referred_user_id, v_code_row.user_id,
    v_code_row.id, v_code, p_click_at, v_status, v_reason
  )
  RETURNING id INTO v_attribution_id;

  RETURN jsonb_build_object('attributed', true, 'status', v_status, 'attributionId', v_attribution_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'already_attributed');
END;
$$;

REVOKE ALL ON FUNCTION public.wa_attribute_referral(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_attribute_referral(TEXT, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION public.wa_attribute_referral(TEXT, TIMESTAMPTZ) IS
  'Crea la atribución de referido inmediatamente tras el signup, sin requerir ningún negocio. Re-valida server-side: ya-atribuido, código válido, auto-referido (por user_id), duplicado de persona (por auth.users.email) y ventana de 30 días (constante server-side). click_at es evidencia no confiable (localStorage): solo se acota su plausibilidad. No conectada a ningún flujo todavía.';

-- 7.4 wa_create_referral_commission_for_payment (Parte 1 + mi corrección
-- anterior, basada en contar wa_payments) se RETIRA por completo -- la
-- auditoría de providers demostró que Affiliate Core no puede inferir
-- "2 meses pagos" desde wa_payments sin caer en colisiones reales
-- (upgrades, 2 negocios, dLocal sin plan_expires_at, PayPal invisible,
-- pagos internos de proration a $0). Se reemplaza por
-- wa_register_referral_paid_period(), que no mira wa_payments en absoluto.
DROP FUNCTION IF EXISTS public.wa_create_referral_commission_for_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, UUID, INTEGER);

-- wa_register_referral_paid_period(p_referred_user_id, p_period_ref) —
-- ÚNICA interfaz entre Billing y Affiliate Core. Billing (hoy no
-- construido) confirma que un mes fue pagado, real y consecutivo, y
-- llama esta función con una clave idempotente opaca (period_ref) que
-- Affiliate Core no interpreta. Restringida a service_role: ningún
-- cliente puede alcanzarla bajo ninguna circunstancia.
--
-- Contrato de confianza: Affiliate Core CONFÍA en que Billing solo
-- invoca esta función para meses reales y consecutivos. Affiliate Core
-- garantiza, y solo garantiza: (a) no duplicar el mismo period_ref para
-- la misma atribución, (b) contar el progreso correctamente vía
-- referral_paid_periods, (c) crear la recompensa una sola vez al llegar
-- a required_paid_months. No valida providers, fechas de plan, tipos de
-- cambio de plan ni prorrateos -- cero de eso es responsabilidad de
-- Affiliate Core.
CREATE OR REPLACE FUNCTION public.wa_register_referral_paid_period(
  p_referred_user_id UUID,
  p_period_ref TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_ref    TEXT := btrim(COALESCE(p_period_ref, ''));
  v_attribution   public.referral_attributions%ROWTYPE;
  v_paid_months   INTEGER;
  v_terms         public.referral_program_terms%ROWTYPE;
  v_commission_id UUID;
BEGIN
  IF p_referred_user_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_REFERRED_USER_ID' USING ERRCODE = 'P0001';
  END IF;
  IF v_period_ref = '' THEN
    RAISE EXCEPTION 'MISSING_PERIOD_REF' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_attribution
  FROM public.referral_attributions
  WHERE referred_user_id = p_referred_user_id
    AND status = 'qualified';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('registered', false, 'reason', 'no_qualified_attribution');
  END IF;

  -- Idempotencia dura: el mismo (referral_attribution_id, period_ref)
  -- nunca se cuenta dos veces, sin importar cuántas veces Billing
  -- reintente la misma confirmación de pago.
  BEGIN
    INSERT INTO public.referral_paid_periods (referral_attribution_id, referred_user_id, period_ref)
    VALUES (v_attribution.id, p_referred_user_id, v_period_ref);
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('registered', false, 'reason', 'duplicate_period');
  END;

  -- paid_months se DERIVA del ledger -- no hay contador mutable que pueda
  -- desincronizarse.
  SELECT count(*) INTO v_paid_months
  FROM public.referral_paid_periods
  WHERE referral_attribution_id = v_attribution.id;

  SELECT * INTO v_terms FROM public.referral_program_terms LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFERRAL_PROGRAM_TERMS_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  IF v_paid_months < v_terms.required_paid_months THEN
    RETURN jsonb_build_object('registered', true, 'paidMonths', v_paid_months, 'rewardCreated', false);
  END IF;

  -- Ya se otorgó la recompensa antes (llamadas posteriores tras alcanzar
  -- el umbral no deben crear una segunda) -- chequeo explícito, además
  -- del UNIQUE parcial de más abajo como backstop de carrera.
  IF EXISTS (
    SELECT 1 FROM public.referral_commissions
    WHERE referral_attribution_id = v_attribution.id AND kind = 'qualification_reward'
  ) THEN
    RETURN jsonb_build_object('registered', true, 'paidMonths', v_paid_months, 'rewardCreated', false, 'reason', 'already_rewarded');
  END IF;

  INSERT INTO public.referral_commissions (
    referral_attribution_id, referrer_user_id, kind,
    reward_amount, reward_currency, required_paid_months, terms_version,
    status, hold_until
  ) VALUES (
    v_attribution.id, v_attribution.referrer_user_id, 'qualification_reward',
    v_terms.reward_amount, v_terms.reward_currency, v_terms.required_paid_months, v_terms.version,
    'pending', now() + make_interval(days => v_terms.hold_days)
  )
  RETURNING id INTO v_commission_id;

  RETURN jsonb_build_object('registered', true, 'paidMonths', v_paid_months, 'rewardCreated', true, 'commissionId', v_commission_id);
EXCEPTION
  WHEN unique_violation THEN
    -- Carrera entre dos llamadas concurrentes que ambas vieron
    -- paid_months >= required_paid_months al mismo tiempo: no-op
    -- idempotente, no error.
    RETURN jsonb_build_object('registered', true, 'rewardCreated', false, 'reason', 'already_rewarded');
END;
$$;

REVOKE ALL ON FUNCTION public.wa_register_referral_paid_period(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_register_referral_paid_period(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.wa_register_referral_paid_period(UUID, TEXT) IS
  'Única interfaz entre Billing y Affiliate Core. Billing confirma un mes pagado y llama esta función con una clave idempotente opaca (period_ref); Affiliate Core no la interpreta. Registra el progreso en referral_paid_periods y crea qualification_reward al llegar a referral_program_terms.required_paid_months. Restringida a service_role. No conectada a ningún flujo de Billing todavía -- Billing no está construido en esta fase.';

NOTIFY pgrst, 'reload schema';
