-- ============================================================
-- Referral Core — Parte 1: capa de datos exclusivamente.
--
-- Alcance de esta migración: referral_codes, referral_attributions,
-- referral_commissions, sus RLS/índices/constraints, y las funciones
-- SQL estrictamente necesarias para operarlas de forma aislada y
-- testeable. NO conecta nada todavía: ningún trigger, webhook ni
-- flujo de signup existente invoca estas funciones en esta fase.
--
-- Explícitamente NO tocado por esta migración (verificado más abajo
-- con diffs, no solo por intención):
--   - public.wa_businesses      (solo se referencia via FK, no se altera)
--   - public.wa_payments        (solo se referencia via FK, no se altera)
--   - public.wa_payment_events  (no se toca)
--   - public.billing_subscriptions (no se toca)
--   - public.wa_handle_new_user_business() (el trigger de R1, no se toca)
--   - supabase/functions/mp-webhook (no se toca en esta fase)
--
-- Identidad económica: todo ancla a business_id, no a user_id, porque
-- wa_businesses.user_id no tiene UNIQUE (un usuario podría, a nivel de
-- esquema, tener más de un negocio) y business_id es la unidad real de
-- facturación en el resto del sistema (billing_subscriptions, wa_payments).
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. referral_codes — perfil/código del referidor
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.referral_codes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  code        TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_status_check CHECK (status IN ('active', 'disabled')),
  CONSTRAINT referral_codes_code_format_check CHECK (code ~ '^[a-z0-9][a-z0-9-]{2,31}$')
);

-- Un negocio tiene como mucho un código propio; el código es único globalmente
-- (es lo que va en la URL pública).
CREATE UNIQUE INDEX referral_codes_business_id_uq ON public.referral_codes(business_id);
CREATE UNIQUE INDEX referral_codes_code_uq        ON public.referral_codes(code);

COMMENT ON TABLE public.referral_codes IS
  'Código de referido por negocio. Se crea vía wa_get_or_create_my_referral_code(); sin INSERT/UPDATE directo desde cliente.';

DROP TRIGGER IF EXISTS referral_codes_updated_at ON public.referral_codes;
CREATE TRIGGER referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. referral_attributions — vínculo referido↔referidor, fijado una sola vez
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.referral_attributions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_business_id  UUID        NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  referred_user_id      UUID        NOT NULL REFERENCES auth.users(id)           ON DELETE CASCADE,
  referrer_business_id  UUID        NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  referral_code_id      UUID        NOT NULL REFERENCES public.referral_codes(id) ON DELETE RESTRICT,
  code_snapshot         TEXT        NOT NULL,
  click_at              TIMESTAMPTZ NULL,
  attributed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                TEXT        NOT NULL DEFAULT 'pending',
  disqualified_reason   TEXT        NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referral_attributions_status_check
    CHECK (status IN ('pending', 'qualified', 'disqualified')),
  CONSTRAINT referral_attributions_disqualified_reason_check
    CHECK (disqualified_reason IS NULL OR disqualified_reason IN ('self_referral', 'duplicate_person', 'fraud', 'manual')),
  -- Defensa en profundidad: además de la validación en wa_attribute_referral(),
  -- el auto-referido queda bloqueado también a nivel de constraint.
  CONSTRAINT referral_attributions_no_self_referral
    CHECK (referrer_business_id <> referred_business_id)
);

-- Un negocio referido tiene UNA sola atribución, para siempre.
CREATE UNIQUE INDEX referral_attributions_referred_business_uq
  ON public.referral_attributions(referred_business_id);

CREATE INDEX referral_attributions_referrer_idx ON public.referral_attributions(referrer_business_id);
CREATE INDEX referral_attributions_referred_user_idx ON public.referral_attributions(referred_user_id);
CREATE INDEX referral_attributions_status_idx ON public.referral_attributions(status);

COMMENT ON TABLE public.referral_attributions IS
  'Atribución referido->referidor, fijada una sola vez en el signup. Se crea vía wa_attribute_referral(); sin INSERT/UPDATE directo desde cliente.';
COMMENT ON COLUMN public.referral_attributions.status IS
  'pending: nunca debería persistir así (wa_attribute_referral resuelve a qualified/disqualified de inmediato). qualified: cuenta para comisión. disqualified: no genera comisión, se conserva para trazabilidad.';
COMMENT ON COLUMN public.referral_attributions.click_at IS
  'Evidencia de click aportada por el cliente (hoy, localStorage) -- NO verificable server-side en Parte 1. wa_attribute_referral() solo acota su plausibilidad (no futuro, dentro de la ventana de 30 días); no es prueba de autenticidad. NULL es válido: significa que no hubo evidencia de click.';

DROP TRIGGER IF EXISTS referral_attributions_updated_at ON public.referral_attributions;
CREATE TRIGGER referral_attributions_updated_at
  BEFORE UPDATE ON public.referral_attributions
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. referral_commissions — comisión por evento económico real (no por estado
--    de billing_subscriptions, que es mutable/retroactivo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.referral_commissions (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_attribution_id UUID          NOT NULL REFERENCES public.referral_attributions(id) ON DELETE CASCADE,
  referrer_business_id    UUID          NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  referred_business_id    UUID          NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,

  provider                TEXT          NOT NULL,
  provider_payment_ref    TEXT          NOT NULL,
  wa_payment_id           UUID          NULL REFERENCES public.wa_payments(id) ON DELETE SET NULL,

  kind                    TEXT          NOT NULL DEFAULT 'first_payment',
  gross_amount            NUMERIC(12,2) NOT NULL,
  currency_code           TEXT          NOT NULL,
  commission_rate         NUMERIC(5,4)  NOT NULL,
  commission_amount       NUMERIC(12,2) NOT NULL,

  status                  TEXT          NOT NULL DEFAULT 'pending',
  reversed_reason         TEXT          NULL,
  reversed_at             TIMESTAMPTZ   NULL,
  hold_until              TIMESTAMPTZ   NULL,
  approved_at             TIMESTAMPTZ   NULL,
  paid_at                 TIMESTAMPTZ   NULL,

  metadata_json           JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT referral_commissions_provider_check  CHECK (provider IN ('mercado_pago', 'paypal')),
  CONSTRAINT referral_commissions_kind_check      CHECK (kind IN ('first_payment', 'renewal')),
  CONSTRAINT referral_commissions_status_check    CHECK (status IN ('pending', 'approved', 'reversed', 'paid')),
  CONSTRAINT referral_commissions_reversed_reason_check
    CHECK (reversed_reason IS NULL OR reversed_reason IN ('refund', 'chargeback', 'fraud', 'manual')),
  CONSTRAINT referral_commissions_amounts_check
    CHECK (gross_amount >= 0 AND commission_amount >= 0 AND commission_rate >= 0 AND commission_rate <= 1),
  CONSTRAINT referral_commissions_provider_payment_ref_not_blank
    CHECK (btrim(provider_payment_ref) <> '')
);

-- Idempotencia dura: UN pago real (provider + su referencia externa) -> como
-- mucho UNA comisión, sin importar cuántas veces se reprocese el webhook.
CREATE UNIQUE INDEX referral_commissions_provider_payment_uq
  ON public.referral_commissions(provider, provider_payment_ref);

-- Como mucho una comisión "de primer pago" por atribución, para siempre.
CREATE UNIQUE INDEX referral_commissions_first_payment_uq
  ON public.referral_commissions(referral_attribution_id)
  WHERE kind = 'first_payment';

CREATE INDEX referral_commissions_referrer_status_idx ON public.referral_commissions(referrer_business_id, status);
CREATE INDEX referral_commissions_referred_idx        ON public.referral_commissions(referred_business_id);
CREATE INDEX referral_commissions_pending_idx          ON public.referral_commissions(status) WHERE status = 'pending';

COMMENT ON TABLE public.referral_commissions IS
  'Comisión anclada a un pago real (provider + provider_payment_ref), no al estado mutable de billing_subscriptions. Se crea vía wa_create_referral_commission_for_payment(), restringida a service_role -- ningún cliente puede escribir esta tabla directa ni indirectamente.';
COMMENT ON COLUMN public.referral_commissions.provider_payment_ref IS
  'Identificador del pago en el proveedor real (mp_payment_id de Mercado Pago, id de transacción/captura de PayPal). Siempre se origina en el webhook del proveedor -- nunca se acepta desde el cliente.';

DROP TRIGGER IF EXISTS referral_commissions_updated_at ON public.referral_commissions;
CREATE TRIGGER referral_commissions_updated_at
  BEFORE UPDATE ON public.referral_commissions
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.referral_codes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions  ENABLE ROW LEVEL SECURITY;

-- referral_codes: el dueño del negocio ve su propio código; admin ve todos.
-- Sin políticas de INSERT/UPDATE/DELETE: toda escritura pasa por
-- wa_get_or_create_my_referral_code() (SECURITY DEFINER).
CREATE POLICY "referral_codes_owner_select" ON public.referral_codes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.wa_businesses b
    WHERE b.id = referral_codes.business_id AND b.user_id = auth.uid()
  ));

CREATE POLICY "referral_codes_admin_select" ON public.referral_codes
  FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- referral_attributions: el referidor ve sus referidos; el propio referido ve
-- su propia atribución; admin ve todo. Sin políticas de INSERT/UPDATE/DELETE:
-- toda escritura pasa por wa_attribute_referral() (SECURITY DEFINER).
CREATE POLICY "referral_attributions_referrer_select" ON public.referral_attributions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.wa_businesses b
    WHERE b.id = referral_attributions.referrer_business_id AND b.user_id = auth.uid()
  ));

CREATE POLICY "referral_attributions_referred_select" ON public.referral_attributions
  FOR SELECT TO authenticated
  USING (referred_user_id = auth.uid());

CREATE POLICY "referral_attributions_admin_select" ON public.referral_attributions
  FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- referral_commissions: solo el referidor ve sus propias comisiones; admin ve
-- todo. CERO políticas de INSERT/UPDATE/DELETE para authenticated/anon -- la
-- única vía de escritura es wa_create_referral_commission_for_payment(),
-- cuyo EXECUTE está restringido a service_role (que además bypassa RLS).
CREATE POLICY "referral_commissions_referrer_select" ON public.referral_commissions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.wa_businesses b
    WHERE b.id = referral_commissions.referrer_business_id AND b.user_id = auth.uid()
  ));

CREATE POLICY "referral_commissions_admin_select" ON public.referral_commissions
  FOR SELECT TO authenticated
  USING (public.wa_is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- 5.1 wa_resolve_referral_code(code) — resolución pública y segura de un código.
-- Callable por anon (para la landing pública antes del signup) y authenticated.
-- Nunca expone business_id, email ni ningún dato sensible: solo un nombre para
-- mostrar y un booleano de validez.
CREATE OR REPLACE FUNCTION public.wa_resolve_referral_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := lower(btrim(COALESCE(p_code, '')));
  v_business_name TEXT;
BEGIN
  IF v_code = '' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT b.name INTO v_business_name
  FROM public.referral_codes rc
  JOIN public.wa_businesses b ON b.id = rc.business_id
  WHERE rc.code = v_code AND rc.status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object('valid', true, 'referrerName', v_business_name);
END;
$$;

REVOKE ALL ON FUNCTION public.wa_resolve_referral_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_resolve_referral_code(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.wa_resolve_referral_code(TEXT) IS
  'Resolución pública de un código de referido. Solo devuelve nombre a mostrar + validez, nunca business_id/email.';

-- 5.2 wa_get_or_create_my_referral_code() — autoservicio: el negocio del
-- usuario autenticado obtiene (o crea, si no existe) su propio código.
CREATE OR REPLACE FUNCTION public.wa_get_or_create_my_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id   UUID;
  v_business_name TEXT;
  v_existing      TEXT;
  v_base_slug     TEXT;
  v_code          TEXT;
  v_suffix        TEXT;
  v_counter       INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  -- wa_businesses.user_id no tiene UNIQUE: si el usuario tuviera más de un
  -- negocio (no debería, pero el esquema no lo impide), se usa el más antiguo
  -- de forma determinística.
  SELECT id, name INTO v_business_id, v_business_name
  FROM public.wa_businesses
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'NO_BUSINESS_FOR_USER' USING ERRCODE = 'P0001';
  END IF;

  SELECT code INTO v_existing FROM public.referral_codes WHERE business_id = v_business_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_base_slug := lower(regexp_replace(COALESCE(v_business_name, 'ref'), '[^a-zA-Z0-9]+', '-', 'g'));
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

  -- ON CONFLICT cubre la carrera de dos llamadas concurrentes para el mismo
  -- negocio: la segunda no falla, devuelve el código que ya ganó la primera.
  INSERT INTO public.referral_codes (business_id, code)
  VALUES (v_business_id, v_code)
  ON CONFLICT (business_id) DO UPDATE SET code = public.referral_codes.code
  RETURNING code INTO v_code;

  RETURN v_code;
END;
$$;

-- Supabase otorga EXECUTE por default a anon/authenticated/service_role de
-- forma directa (ALTER DEFAULT PRIVILEGES a nivel de plataforma, fuera de
-- este repo) sobre cada función nueva en el schema public -- no vía PUBLIC.
-- Revocar solo de PUBLIC no alcanza para restringir el acceso real; hay que
-- nombrar explícitamente los roles que Supabase ya le otorgó por su cuenta.
REVOKE ALL ON FUNCTION public.wa_get_or_create_my_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_get_or_create_my_referral_code() TO authenticated;

COMMENT ON FUNCTION public.wa_get_or_create_my_referral_code() IS
  'Autoservicio: devuelve el código del negocio del caller, creándolo si no existe. Idempotente bajo concurrencia via ON CONFLICT.';

-- 5.3 wa_attribute_referral(referred_business_id, code, click_at)
-- Crea la atribución en el momento del signup. Diseñada para ser llamada por
-- el propio usuario recién registrado (authenticated), pero NUNCA confía en
-- el business_id recibido sin verificar que pertenece a auth.uid(): todas las
-- reglas de negocio se re-validan server-side, no se asume nada del cliente.
-- No se conecta a ningún flujo de signup en esta fase (Parte 1 es solo la
-- capa de datos); queda lista para que una fase posterior la invoque.
--
-- Sobre click_at y la ventana de atribución:
--   - La ventana de atribución (30 días) es una CONSTANTE server-side
--     (v_attribution_window_days más abajo), no un parámetro de la función.
--     Un cliente no puede pedir una ventana distinta ni por accidente ni
--     a propósito -- ese parámetro directamente no existe en la firma.
--   - click_at es evidencia que hoy solo puede originarse en localStorage del
--     navegador (no hay tracking de click server-side en Parte 1, y esta fase
--     deliberadamente no lo construye). Por lo tanto NO es un dato confiable:
--     el servidor no puede verificar que ese timestamp corresponda a un click
--     real ni que no haya sido manipulado. Lo único que el servidor puede
--     hacer -- y hace -- es acotar su plausibilidad: rechazar cualquier
--     click_at en el futuro o más viejo que la ventana. Pasar esas dos
--     validaciones NO es una prueba de autenticidad, es solo un filtro de
--     sanidad sobre un dato no confiable.
--   - "first-click-wins" en Parte 1 es una garantía de UX/cliente (el
--     navegador guarda el primer código visto y no lo sobreescribe), NO una
--     garantía verificable por el servidor: si un cliente decide enviar un
--     código distinto con un click_at igualmente plausible, el servidor no
--     tiene forma de saber cuál click fue realmente el primero. Cerrar esa
--     brecha requeriría un log de clicks server-side (con o sin sesión), que
--     es tracking anónimo adicional -- explícitamente fuera de alcance de
--     esta fase. Lo que SÍ es una garantía dura del servidor, sin importar
--     qué diga click_at: un negocio referido tiene una sola atribución para
--     siempre (UNIQUE(referred_business_id)) -- ningún código posterior
--     puede reemplazar una atribución ya creada.
CREATE OR REPLACE FUNCTION public.wa_attribute_referral(
  p_referred_business_id UUID,
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

  -- El negocio referido debe pertenecer a quien llama.
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_businesses
    WHERE id = p_referred_business_id AND user_id = v_referred_user_id
  ) THEN
    RAISE EXCEPTION 'BUSINESS_NOT_OWNED_BY_CALLER' USING ERRCODE = 'P0001';
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'empty_code');
  END IF;

  -- UNIQUE(referred_business_id): un negocio referido, una sola atribución,
  -- para siempre. Chequeo explícito primero (mensaje claro) + catch de
  -- unique_violation al final (defensa ante carrera). Esta es la garantía
  -- dura de "first-attribution-wins" a nivel de servidor -- ningún código
  -- enviado después, con el click_at que sea, puede reemplazar esta fila.
  IF EXISTS (
    SELECT 1 FROM public.referral_attributions WHERE referred_business_id = p_referred_business_id
  ) THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'already_attributed');
  END IF;

  SELECT * INTO v_code_row FROM public.referral_codes WHERE code = v_code AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'invalid_code');
  END IF;

  -- Auto-referido: mismo negocio, o mismo user_id dueño de ambos negocios.
  IF v_code_row.business_id = p_referred_business_id THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'self_referral');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wa_businesses
    WHERE id = v_code_row.business_id AND user_id = v_referred_user_id
  ) THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'self_referral');
  END IF;

  -- click_at es evidencia no confiable (ver comentario de la función): NULL
  -- (sin evidencia de click) no bloquea nada. Si el cliente sí manda un
  -- valor, se acota su plausibilidad contra la ventana server-side -- nunca
  -- en el futuro, nunca más viejo que v_attribution_window_days. Ninguno de
  -- los dos casos genera una atribución qualified ni ninguna fila.
  IF p_click_at IS NOT NULL THEN
    IF p_click_at > now() THEN
      RETURN jsonb_build_object('attributed', false, 'reason', 'click_in_future');
    END IF;
    IF p_click_at < (now() - make_interval(days => v_attribution_window_days)) THEN
      RETURN jsonb_build_object('attributed', false, 'reason', 'click_window_expired');
    END IF;
  END IF;

  SELECT lower(btrim(email)) INTO v_referrer_email FROM public.wa_businesses WHERE id = v_code_row.business_id;
  SELECT lower(btrim(email)) INTO v_referred_email FROM public.wa_businesses WHERE id = p_referred_business_id;

  IF v_referrer_email IS NOT NULL AND v_referrer_email = v_referred_email THEN
    v_status := 'disqualified';
    v_reason := 'duplicate_person';
  END IF;

  INSERT INTO public.referral_attributions (
    referred_business_id, referred_user_id, referrer_business_id,
    referral_code_id, code_snapshot, click_at, status, disqualified_reason
  ) VALUES (
    p_referred_business_id, v_referred_user_id, v_code_row.business_id,
    v_code_row.id, v_code, p_click_at, v_status, v_reason
  )
  RETURNING id INTO v_attribution_id;

  RETURN jsonb_build_object('attributed', true, 'status', v_status, 'attributionId', v_attribution_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('attributed', false, 'reason', 'already_attributed');
END;
$$;

-- Mismo motivo que wa_get_or_create_my_referral_code() más arriba: hay que
-- nombrar anon explícitamente, PUBLIC no alcanza.
REVOKE ALL ON FUNCTION public.wa_attribute_referral(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_attribute_referral(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION public.wa_attribute_referral(UUID, TEXT, TIMESTAMPTZ) IS
  'Crea la atribución de referido en el signup. Re-valida server-side ownership, auto-referido, duplicado de persona y ventana de 30 días (constante server-side, no parametrizable) -- nunca confía en el cliente. click_at es evidencia no confiable (localStorage): solo se acota su plausibilidad, no se verifica su autenticidad. No está conectada a ningún flujo todavía (Parte 1).';

-- 5.4 wa_create_referral_commission_for_payment(...) — crea la comisión a
-- partir de un pago real. Restringida a service_role: ningún cliente puede
-- alcanzar esta función bajo ninguna circunstancia (REVOKE explícito de
-- PUBLIC/authenticated/anon). provider_payment_ref se trata como evidencia
-- externa del proveedor, nunca como algo que el llamador declara sin más:
-- el hecho de que solo service_role pueda invocarla ya impide que un
-- cliente fabrique una referencia de pago falsa. No está conectada a
-- mp-webhook ni a PayPal todavía (Parte 1 es solo la capa de datos).
CREATE OR REPLACE FUNCTION public.wa_create_referral_commission_for_payment(
  p_referred_business_id UUID,
  p_provider TEXT,
  p_provider_payment_ref TEXT,
  p_gross_amount NUMERIC,
  p_currency_code TEXT,
  p_commission_rate NUMERIC,
  p_kind TEXT DEFAULT 'first_payment',
  p_wa_payment_id UUID DEFAULT NULL,
  p_hold_days INTEGER DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attribution       public.referral_attributions%ROWTYPE;
  v_commission_id     UUID;
  v_commission_amount NUMERIC(12,2);
BEGIN
  IF p_provider_payment_ref IS NULL OR btrim(p_provider_payment_ref) = '' THEN
    RAISE EXCEPTION 'MISSING_PROVIDER_PAYMENT_REF' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_attribution
  FROM public.referral_attributions
  WHERE referred_business_id = p_referred_business_id
    AND status = 'qualified';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('created', false, 'reason', 'no_qualified_attribution');
  END IF;

  v_commission_amount := round(p_gross_amount * p_commission_rate, 2);

  INSERT INTO public.referral_commissions (
    referral_attribution_id, referrer_business_id, referred_business_id,
    provider, provider_payment_ref, wa_payment_id, kind,
    gross_amount, currency_code, commission_rate, commission_amount,
    status, hold_until
  ) VALUES (
    v_attribution.id, v_attribution.referrer_business_id, p_referred_business_id,
    p_provider, p_provider_payment_ref, p_wa_payment_id, p_kind,
    p_gross_amount, p_currency_code, p_commission_rate, v_commission_amount,
    'pending', now() + make_interval(days => p_hold_days)
  )
  RETURNING id INTO v_commission_id;

  RETURN jsonb_build_object('created', true, 'commissionId', v_commission_id);
EXCEPTION
  WHEN unique_violation THEN
    -- Cubre tanto un mp_payment_id/transacción reprocesado (duplicados de
    -- webhook) como un segundo intento de comisión "first_payment" para la
    -- misma atribución: en ambos casos, no-op idempotente, no error.
    RETURN jsonb_build_object('created', false, 'reason', 'duplicate_payment_or_first_payment_exists');
END;
$$;

-- Crítico: esta es la función que crea comisiones. PUBLIC no alcanza --
-- Supabase ya le otorgó EXECUTE directo a anon Y a authenticated por su
-- cuenta (mismo motivo documentado arriba); hay que revocárselo a ambos
-- explícitamente, o cualquier cliente autenticado podría invocarla.
REVOKE ALL ON FUNCTION public.wa_create_referral_commission_for_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_create_referral_commission_for_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, UUID, INTEGER) TO service_role;

COMMENT ON FUNCTION public.wa_create_referral_commission_for_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, UUID, INTEGER) IS
  'Crea una comisión a partir de un pago real aprobado. Restringida a service_role. Idempotente por (provider, provider_payment_ref) y por "first_payment" único por atribución. No conectada a ningún webhook todavía (Parte 1).';

NOTIFY pgrst, 'reload schema';
