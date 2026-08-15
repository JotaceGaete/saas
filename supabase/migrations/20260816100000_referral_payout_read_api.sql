-- ============================================================
-- Affiliate Core — Fase 5D.1: capa de lectura segura para payouts.
--
-- No reabre 20260815100000_referral_payout_requests.sql (Fase 5C) ni
-- ninguna migración anterior de Affiliate Core -- todas quedan intactas
-- como historia verificable. Este archivo es exclusivamente de LECTURA:
-- ninguna función de acá escribe en referral_payout_requests,
-- referral_payout_commissions ni referral_commissions. Las 3 RPCs de
-- escritura de 5C (wa_request_referral_payout,
-- wa_admin_mark_referral_payout_paid, wa_admin_reject_referral_payout)
-- no se tocan.
--
-- Alcance:
--   0. Hardening de grants de tabla sobre referral_payout_requests y
--      referral_payout_commissions (ver justificación detallada abajo).
--   1. wa_mask_account_number(text) -- helper interno de masking,
--      reutilizado por las 2 RPCs de listado.
--   2. wa_list_my_referral_payouts() -- historial propio del afiliado.
--   3. wa_admin_list_referral_payouts() -- listado admin, con
--      identidad del afiliado resuelta server-side (auth.users no es
--      accesible vía PostgREST) y datos bancarios enmascarados/omitidos.
--   4. wa_admin_get_referral_payout_detail() -- único lugar donde el
--      snapshot bancario completo se expone, estrictamente read-only.
--   5. wa_get_my_referral_stats(): único ajuste a una RPC existente --
--      agrega pendingPayoutsByCurrency (array agrupado por moneda,
--      NUNCA sumado entre monedas distintas). pendingAmount/
--      availableAmount/totalEarnedAmount/rewardCurrency y el resto de
--      campos existentes quedan EXACTAMENTE iguales -- ver análisis de
--      moneda más abajo, sección 5.
--
-- FUERA DE ALCANCE, a propósito (sin tocar en este archivo):
--   - Frontend: cero cambios (src/, Routes.jsx, BusinessSidebar,
--     RequireAdmin, referralService.js -- ninguno se toca).
--   - Edge Functions (mp-webhook incluido): ninguna se toca.
--   - /afiliados sigue detrás de RequireAdmin, sin abrir.
--   - Ninguna policy INSERT/UPDATE/DELETE nueva -- las 3 RPCs de este
--     archivo son las 3 únicas formas nuevas de acceder a estos datos,
--     y las 3 son de solo lectura.
--   - Las 3 RPCs de escritura de 5C no se tocan -- siguen escribiendo
--     porque son SECURITY DEFINER (ejecutan con los privilegios del
--     OWNER de la función, no del invocador), así que el hardening de
--     grants de la sección 0 no las afecta en absoluto.
--   - service_role: sin cambios -- ninguna prueba demostró que hiciera
--     falta tocarlo, y las RPCs SECURITY DEFINER no lo necesitan para
--     escribir (ver punto anterior).
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Hardening de grants — las tablas financieras de payouts NO deben
--    depender exclusivamente de RLS para impedir escrituras directas.
--
--    HALLAZGO (validación de 5D.1, no introducido por esta migración):
--    referral_payout_requests y referral_payout_commissions -- creadas en
--    20260815100000 (Fase 5C) -- recibieron, a nivel de plataforma (fuera
--    de este repo, mismo mecanismo ya documentado para funciones en
--    20260808100000: "Supabase otorga... de forma directa... no vía
--    PUBLIC"), privilegios de tabla mucho más amplios que el
--    "GRANT SELECT" explícito que documentan los comentarios de 5C:
--    anon Y authenticated tenían INSERT/UPDATE/DELETE/TRUNCATE/
--    REFERENCES/TRIGGER, verificado con has_table_privilege() contra
--    Supabase local real. La única razón por la que nunca hubo una
--    escritura real es que RLS, sin ninguna policy de INSERT/UPDATE/
--    DELETE, hace que esas sentencias afecten 0 filas -- un UPDATE nunca
--    lanzaba error, simplemente no matcheaba nada. Correcto en el
--    resultado, pero una sola capa de defensa para datos financieros con
--    snapshot bancario.
--
--    Este bloque REVOCA explícitamente esos privilegios de escritura
--    (nunca necesarios: toda escritura real pasa por las 3 RPCs
--    SECURITY DEFINER de 5C) de PUBLIC, anon y authenticated, dejando
--    únicamente SELECT para authenticated -- la mínima concesión que las
--    4 policies SELECT de 5C necesitan para poder evaluarse (sin GRANT de
--    tabla, ninguna policy llega a mirarse: "permission denied for
--    table" ocurre antes). service_role NO se toca -- ninguna prueba
--    demostró que hiciera falta, y las RPCs de escritura corren como su
--    owner (postgres), no como service_role, así que no dependen de este
--    grant para funcionar.
--
--    Resultado: ahora hay DOS capas independientes bloqueando la
--    escritura directa -- el GRANT (bloquea antes de que RLS se evalúe
--    siquiera) y RLS (bloquearía igual aunque el GRANT fallara). Ninguna
--    policy nueva, ninguna policy existente tocada, ninguna semántica de
--    tabla cambiada.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.referral_payout_requests
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.referral_payout_commissions
  FROM PUBLIC, anon, authenticated;

-- "Conserva únicamente SELECT para authenticated": el mismo hallazgo de
-- grants amplios de plataforma también le había dado SELECT a anon (no
-- solo los privilegios de escritura) -- ninguna de las 4 policies RLS de
-- 5C es TO anon, así que anon nunca debió tener SELECT en absoluto.
-- Se revoca explícitamente, dejando SELECT únicamente para authenticated.
REVOKE SELECT
  ON TABLE public.referral_payout_requests
  FROM PUBLIC, anon;

REVOKE SELECT
  ON TABLE public.referral_payout_commissions
  FROM PUBLIC, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. wa_mask_account_number(text) — enmascara todo salvo los últimos 4
--    caracteres. Helper interno: mismo trato que wa_referral_current_
--    streak_months (5A.1) y wa_validate_referral_payout_method_snapshot
--    (5C) -- sin GRANT a ningún rol cliente, el masking SIEMPRE ocurre
--    server-side, nunca depende de que el frontend recuerde enmascarar.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_mask_account_number(p_account_number TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_account_number IS NULL OR btrim(p_account_number) = '' THEN NULL
    WHEN length(btrim(p_account_number)) <= 4 THEN repeat('•', length(btrim(p_account_number)))
    ELSE repeat('•', length(btrim(p_account_number)) - 4) || right(btrim(p_account_number), 4)
  END;
$$;

REVOKE ALL ON FUNCTION public.wa_mask_account_number(TEXT) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.wa_mask_account_number(TEXT) IS
  'Enmascara un número de cuenta dejando visibles como mucho los últimos 4 caracteres (p.ej. "••••6789"). NULL/vacío -> NULL. Cadenas de 4 caracteres o menos quedan completamente enmascaradas (nunca se muestran enteras). Helper interno: sin GRANT a ningún rol cliente -- lo usan exclusivamente wa_list_my_referral_payouts() y wa_admin_list_referral_payouts(), nunca se expone como API pública.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wa_list_my_referral_payouts(p_limit, p_offset) — historial propio
--    del afiliado. Autoservicio, mismo patrón exacto de clamping que
--    wa_list_my_referrals() (5A.1).
--
--    Justificación de qué SÍ se expone del snapshot propio: aunque RLS
--    ya autoriza al dueño a leer su propio payout_method_snapshot
--    completo (referral_payout_requests_owner_select), este historial
--    solo necesita que el afiliado reconozca CUÁL solicitud es cuál
--    (method + últimos 4 dígitos de la cuenta) -- no hace falta
--    reenviar holder_tax_id, el email de contacto del snapshot, ni el
--    account_number completo en cada fetch de una lista. Minimizar qué
--    dato sensible cruza la red, incluso siendo del propio dueño, es
--    más seguro que exponerlo íntegro solo porque RLS lo permitiría.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_list_my_referral_payouts(
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_limit   INTEGER;
  v_offset  INTEGER;
  v_result  JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  -- Límites razonables, server-side -- el cliente no puede pedir más de
  -- 100 ni un offset negativo, sin importar lo que envíe.
  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'payoutId',            pr.id,
      'status',               pr.status,
      'requestedAmount',      pr.requested_amount,
      'currency',             pr.currency,
      'requestedAt',          pr.requested_at,
      'paidAt',               pr.paid_at,
      'rejectedAt',           pr.rejected_at,
      'externalReference',    pr.external_reference,
      'rejectedReason',       pr.rejected_reason,
      'payoutMethod',         pr.payout_method_snapshot->>'method',
      'maskedAccountNumber',  public.wa_mask_account_number(pr.payout_method_snapshot->>'account_number')
    ) AS row_data
    FROM public.referral_payout_requests pr
    WHERE pr.referrer_user_id = v_user_id
    ORDER BY pr.requested_at DESC
    LIMIT v_limit OFFSET v_offset
  ) sub;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_list_my_referral_payouts(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_list_my_referral_payouts(INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.wa_list_my_referral_payouts(INTEGER, INTEGER) IS
  'Historial paginado (p_limit default 20, máximo 100; p_offset >= 0, clamp server-side) de los retiros del caller (auth.uid()), más reciente primero. Expone únicamente payoutMethod + maskedAccountNumber del snapshot (nunca holder_tax_id, el email del snapshot, ni el account_number completo) -- ver comentario de la función sobre por qué se minimiza incluso para el propio dueño. Nunca datos de otro usuario: filtra por referrer_user_id = auth.uid() exclusivamente. Restringida a authenticated. Estrictamente read-only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. wa_admin_list_referral_payouts(p_status, p_limit, p_offset) —
--    listado admin. Resuelve identidad del afiliado vía JOIN a
--    auth.users (inaccesible por PostgREST directamente -- por eso este
--    archivo declaró en la auditoría que hacía falta una RPC nueva, no
--    una vista bare ni acceso directo a tabla desde el frontend admin).
--    Mismo patrón de autorización que wa_admin_mark_referral_payout_paid/
--    wa_admin_reject_referral_payout (5C): GRANT a authenticated, guarda
--    interna wa_is_admin(), respuesta {ok:false, error:...} en vez de
--    excepción -- consistente con el resto del dominio de payouts.
--
--    NUNCA devuelve: payout_method_snapshot completo, holder_tax_id, ni
--    account_number sin enmascarar. Solo campos explícitamente
--    listados abajo -- lo que no está en el SELECT no puede filtrarse
--    por accidente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_admin_list_referral_payouts(
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit   INTEGER;
  v_offset  INTEGER;
  v_total   INTEGER;
  v_payouts JSONB;
BEGIN
  IF NOT public.wa_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Validado contra los 3 valores REALES de
  -- referral_payout_requests_status_check (20260815100000) -- nunca se
  -- inventa un cuarto estado ni se acepta un valor arbitrario del cliente.
  IF p_status IS NOT NULL AND p_status NOT IN ('requested', 'paid', 'rejected') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT count(*) INTO v_total
  FROM public.referral_payout_requests pr
  WHERE p_status IS NULL OR pr.status = p_status;

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_payouts
  FROM (
    SELECT jsonb_build_object(
      'payoutId',            pr.id,
      'referrerUserId',      pr.referrer_user_id,
      'referrerEmail',       u.email,
      'status',               pr.status,
      'requestedAmount',      pr.requested_amount,
      'currency',             pr.currency,
      'requestedAt',          pr.requested_at,
      'paidAt',               pr.paid_at,
      'rejectedAt',           pr.rejected_at,
      'externalReference',    pr.external_reference,
      'rejectedReason',       pr.rejected_reason,
      -- Representación segura para listado -- NUNCA el snapshot
      -- completo, NUNCA holder_tax_id, NUNCA account_number sin enmascarar.
      'payoutMethod',         pr.payout_method_snapshot->>'method',
      'country',              pr.payout_method_snapshot->>'country',
      'holderName',           pr.payout_method_snapshot->>'holder_name',
      'bankName',             pr.payout_method_snapshot->>'bank_name',
      'accountType',          pr.payout_method_snapshot->>'account_type',
      'maskedAccountNumber',  public.wa_mask_account_number(pr.payout_method_snapshot->>'account_number')
    ) AS row_data
    FROM public.referral_payout_requests pr
    LEFT JOIN auth.users u ON u.id = pr.referrer_user_id
    WHERE p_status IS NULL OR pr.status = p_status
    ORDER BY pr.requested_at DESC
    LIMIT v_limit OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object('ok', true, 'totalCount', v_total, 'payouts', v_payouts);
END;
$$;

REVOKE ALL ON FUNCTION public.wa_admin_list_referral_payouts(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_admin_list_referral_payouts(TEXT, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.wa_admin_list_referral_payouts(TEXT, INTEGER, INTEGER) IS
  'Listado admin de retiros (p_status opcional: requested|paid|rejected, valida contra el CHECK real; p_limit default 30 máximo 100; p_offset >= 0). Restringida por wa_is_admin() -- GRANT a authenticated, autorización real vía guarda interna, mismo patrón que wa_admin_mark_referral_payout_paid/wa_admin_reject_referral_payout. Resuelve referrerEmail vía JOIN a auth.users (inaccesible por PostgREST). NUNCA devuelve payout_method_snapshot completo, holder_tax_id ni account_number sin enmascarar -- el masking ocurre acá, server-side, no depende del frontend. Incluye totalCount (mismo filtro de status, sin limit/offset) para paginación. Estrictamente read-only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. wa_admin_get_referral_payout_detail(payout_id) — único lugar donde
--    se expone el snapshot bancario COMPLETO: el admin lo necesita
--    íntegro para efectivamente hacer la transferencia. Estrictamente
--    read-only: ni un solo INSERT/UPDATE/DELETE en todo el cuerpo, no
--    recalcula ningún monto (a diferencia de
--    wa_admin_mark_referral_payout_paid, que sí recalcula para decidir
--    si puede pagar -- acá solo se lee y se muestra el estado actual tal
--    cual está, sin ninguna lógica de negocio).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_admin_get_referral_payout_detail(
  p_payout_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout         public.referral_payout_requests%ROWTYPE;
  v_referrer_email TEXT;
  v_commissions    JSONB;
BEGIN
  IF NOT public.wa_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_payout FROM public.referral_payout_requests WHERE id = p_payout_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_not_found');
  END IF;

  SELECT email INTO v_referrer_email FROM auth.users WHERE id = v_payout.referrer_user_id;

  -- Comisiones vinculadas -- activas (released_at IS NULL) y liberadas
  -- por igual, para que el admin vea el historial completo de qué se
  -- intentó incluir en este retiro, no solo lo que sigue vigente.
  -- commissionStatus es el status ACTUAL de referral_commissions (solo
  -- lectura, informativo) -- nunca se recalcula ni se compara contra
  -- requested_amount acá; esa lógica de negocio vive exclusivamente en
  -- wa_admin_mark_referral_payout_paid.
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_commissions
  FROM (
    SELECT jsonb_build_object(
      'commissionId',         rpc.commission_id,
      'rewardAmountSnapshot', rpc.reward_amount_snapshot,
      'releasedAt',            rpc.released_at,
      'releasedReason',        rpc.released_reason,
      'active',                rpc.released_at IS NULL,
      'commissionStatus',      rc.status
    ) AS row_data
    FROM public.referral_payout_commissions rpc
    JOIN public.referral_commissions rc ON rc.id = rpc.commission_id
    WHERE rpc.payout_id = v_payout.id
    ORDER BY rpc.created_at
  ) sub;

  RETURN jsonb_build_object(
    'ok', true,
    'payout', jsonb_build_object(
      'payoutId',              v_payout.id,
      'referrerUserId',        v_payout.referrer_user_id,
      'referrerEmail',         v_referrer_email,
      'status',                 v_payout.status,
      'requestedAmount',        v_payout.requested_amount,
      'currency',                v_payout.currency,
      'requestedAt',             v_payout.requested_at,
      'paidAt',                  v_payout.paid_at,
      'rejectedAt',              v_payout.rejected_at,
      'externalReference',       v_payout.external_reference,
      'rejectedReason',          v_payout.rejected_reason,
      'adminUserId',             v_payout.admin_user_id,
      -- Única RPC de todo Affiliate Core que devuelve el snapshot
      -- íntegro -- el admin lo necesita completo para transferir.
      'payoutMethodSnapshot',    v_payout.payout_method_snapshot
    ),
    'commissions', v_commissions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wa_admin_get_referral_payout_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_admin_get_referral_payout_detail(UUID) TO authenticated;

COMMENT ON FUNCTION public.wa_admin_get_referral_payout_detail(UUID) IS
  'Detalle admin completo de un retiro: payout + payout_method_snapshot ÍNTEGRO (única RPC que lo expone así -- el admin lo necesita para transferir) + comisiones vinculadas (activas y liberadas, con commissionStatus informativo). Restringida por wa_is_admin(). payout_id inexistente -> {ok:false, error:payout_not_found}. Estrictamente read-only: no recalcula ni modifica ningún monto ni status -- esa lógica vive exclusivamente en wa_admin_mark_referral_payout_paid.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. wa_get_my_referral_stats() — agrega pendingPayoutsByCurrency.
--
--    Análisis de moneda (por qué NO es un número único): referral_program_terms
--    es un singleton, pero su reward_currency puede cambiar de política a
--    lo largo del tiempo (columna mutable, sin RPC que la cambie hoy, pero
--    el esquema no lo impide -- exactamente la misma razón por la que
--    wa_request_referral_payout, en Fase 5C, agrupa por moneda y crea UN
--    payout POR moneda en vez de asumir una sola). referral_commissions.
--    reward_currency y referral_payout_requests.currency son snapshots
--    inmutables tomados en el momento de cada fila -- un mismo afiliado
--    PUEDE, estructuralmente, tener retiros 'requested' en más de una
--    moneda simultánea. Sumarlos en un solo NUMERIC sería matemáticamente
--    inválido (ej. "15.00" que en realidad es "10 USD + 5 CLP"). Por eso
--    pendingPayoutsByCurrency es un ARRAY agrupado por currency, nunca
--    sumado entre monedas -- mismo principio que ya aplicó 5C.
--
--    pendingAmount/availableAmount/totalEarnedAmount/rewardCurrency y el
--    resto de campos NO se tocan -- conservan exactamente su cálculo y
--    semántica actuales (siguen siendo sumas ciegas sobre
--    referral_commissions, tal como ya estaban desde 5A.1/5C; esa es una
--    simplificación preexistente que esta migración NO extiende ni
--    corrige, por instrucción explícita de mantenerlos intactos).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_get_my_referral_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id                    UUID := auth.uid();
  v_code                       TEXT;
  v_terms                       public.referral_program_terms%ROWTYPE;
  v_invited_count               INTEGER;
  v_one_month_count             INTEGER;
  v_qualified_count             INTEGER;
  v_pending_amount               NUMERIC(12,2);
  v_available_amount             NUMERIC(12,2);
  v_total_earned_amount          NUMERIC(12,2);
  v_pending_payouts_by_currency  JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT public.wa_get_or_create_my_referral_code() INTO v_code;

  SELECT * INTO v_terms FROM public.referral_program_terms LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFERRAL_PROGRAM_TERMS_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_invited_count
  FROM public.referral_attributions
  WHERE referrer_user_id = v_user_id AND status <> 'disqualified';

  SELECT
    count(*) FILTER (WHERE progress.paid_months = 1),
    count(*) FILTER (WHERE progress.paid_months >= v_terms.required_paid_months)
  INTO v_one_month_count, v_qualified_count
  FROM (
    SELECT ra.id, public.wa_referral_current_streak_months(ra.id) AS paid_months
    FROM public.referral_attributions ra
    WHERE ra.referrer_user_id = v_user_id AND ra.status <> 'disqualified'
  ) progress;

  -- SIN CAMBIOS (5A.1/5C): pendingAmount/availableAmount/totalEarnedAmount
  -- conservan exactamente su cálculo actual.
  SELECT
    COALESCE(SUM(reward_amount) FILTER (WHERE status = 'pending'), 0),
    COALESCE(SUM(reward_amount) FILTER (
      WHERE status = 'approved'
        AND NOT EXISTS (
          SELECT 1 FROM public.referral_payout_commissions rpc
          WHERE rpc.commission_id = referral_commissions.id AND rpc.released_at IS NULL
        )
    ), 0),
    COALESCE(SUM(reward_amount) FILTER (WHERE status IN ('approved', 'paid')), 0)
  INTO v_pending_amount, v_available_amount, v_total_earned_amount
  FROM public.referral_commissions
  WHERE referrer_user_id = v_user_id;

  -- NUEVO (5D.1): pendingPayoutsByCurrency -- agrupado por moneda, jamás
  -- sumado entre monedas. [] si no hay ningún retiro 'requested' (nunca
  -- null). Ordenado por currency para respuesta determinista.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('currency', grouped.currency, 'amount', grouped.total)
      ORDER BY grouped.currency
    ),
    '[]'::jsonb
  )
  INTO v_pending_payouts_by_currency
  FROM (
    SELECT currency, SUM(requested_amount) AS total
    FROM public.referral_payout_requests
    WHERE referrer_user_id = v_user_id AND status = 'requested'
    GROUP BY currency
  ) grouped;

  RETURN jsonb_build_object(
    'code',                    v_code,
    'rewardAmount',            v_terms.reward_amount,
    'rewardCurrency',          v_terms.reward_currency,
    'requiredPaidMonths',      v_terms.required_paid_months,
    'invitedCount',            v_invited_count,
    'oneMonthCount',           v_one_month_count,
    'qualifiedCount',          v_qualified_count,
    'pendingAmount',           v_pending_amount,
    'availableAmount',         v_available_amount,
    'totalEarnedAmount',       v_total_earned_amount,
    'pendingPayoutsByCurrency', v_pending_payouts_by_currency
  );
END;
$$;

COMMENT ON FUNCTION public.wa_get_my_referral_stats() IS
  'Resumen agregado del programa de afiliados para el caller (auth.uid()) como referidor. availableAmount (Fase 5C) excluye comisiones approved ya reservadas en un retiro activo. pendingPayoutsByCurrency (Fase 5D.1) es un array [{currency, amount}] de la suma de requested_amount de retiros status=''requested'', agrupado por currency -- NUNCA combina monedas distintas en un solo número (ver análisis de moneda en 20260816100000). Todos los demás campos (pendingAmount/availableAmount/totalEarnedAmount/rewardCurrency/etc.) conservan exactamente su semántica y cálculo previos, sin cambios. Mismo contrato externo desde Fase 5A.1, extendido de forma aditiva.';

NOTIFY pgrst, 'reload schema';
