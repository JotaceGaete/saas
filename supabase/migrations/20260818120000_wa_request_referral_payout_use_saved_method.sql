-- ============================================================
-- Affiliate Core — Fase C3: wa_request_referral_payout() construye el
-- snapshot server-side desde referral_payout_methods (Fase C2), en vez de
-- confiar en el JSON enviado por el cliente.
--
-- No reabre ninguna migración anterior de Affiliate Core -- todas quedan
-- intactas. Este archivo redefine EXCLUSIVAMENTE wa_request_referral_payout()
-- vía CREATE OR REPLACE. Ninguna otra función, tabla, policy ni grant se
-- toca.
--
-- FUERA DE ALCANCE, a propósito (sin tocar en este archivo):
--   - Atribución, streaks, comisiones, maduración, refunds: intactos --
--     el reclamo de comisiones (FOR UPDATE SKIP LOCKED), el agrupado por
--     moneda, min_payout_amount, y las 4 RPCs de lectura/admin de payouts
--     no cambian ni una línea.
--   - payout_method_snapshot de payouts YA EXISTENTES: no se migra, no se
--     reescribe, no se toca -- referral_payout_requests_immutable_snapshot
--     (trigger de 20260815100000) sigue vigente sin cambios.
--   - referral_payout_methods, sus 3 RPCs self-service y
--     wa_referral_payout_method_encryption_key(): sin cambios (Fase C2,
--     20260818110000) -- este archivo los REUTILIZA, no los reimplementa.
--   - wa_validate_referral_payout_method_snapshot(): modificado en el
--     archivo INMEDIATAMENTE ANTERIOR (20260818115000), no en este --
--     ver nota abajo.
--   - WalinkaRef: cero cambios de frontend.
--
-- NOTA SOBRE account_type Y AR (resuelta en 20260818115000, no acá):
--   wa_validate_referral_payout_method_snapshot() exigía account_type no
--   vacío de forma INCONDICIONAL, para cualquier país -- incompatible
--   con referral_payout_methods.account_type (20260818110000), NULLABLE
--   para AR a propósito (CBU/CVU no tiene el concepto de "tipo de
--   cuenta" que sí tiene la cuenta corriente/ahorro/vista chilena).
--   En vez de resolverlo acá con un valor artificial (p.ej. 'cbu') que
--   no representa un dato real, la migración anterior
--   (20260818115000_referral_payout_method_snapshot_country_conditional_
--   account_type.sql) extiende el validador compartido: account_type
--   sigue siendo obligatorio para country='CL', y pasa a ser opcional/
--   NULL para cualquier otro país. Este archivo, más abajo, construye el
--   snapshot AR SIN la clave account_type cuando el método guardado no
--   la tiene -- nunca con un placeholder.
-- ============================================================

CREATE OR REPLACE FUNCTION public.wa_request_referral_payout(
  p_payout_method_snapshot JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_method    public.referral_payout_methods%ROWTYPE;
  v_key       TEXT;
  v_snapshot  JSONB;
  v_terms     public.referral_program_terms%ROWTYPE;
  v_results   JSONB := '[]'::jsonb;
  v_group     RECORD;
  v_payout_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  -- p_payout_method_snapshot se conserva EXCLUSIVAMENTE por compatibilidad
  -- de firma con clientes que todavía lo envíen (WalinkaRef actual) --
  -- a partir de esta fase se IGNORA por completo, incluso si viene bien
  -- formado. El frontend deja de ser fuente de verdad del snapshot
  -- financiero. No se lee, no se valida, no se usa en ningún punto de
  -- esta función a partir de acá.
  SELECT * INTO v_method FROM public.referral_payout_methods WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('requested', false, 'reason', 'payout_method_not_configured');
  END IF;

  -- Vault SOLO se consulta después de confirmar auth + método existente
  -- (nunca antes). Fail closed: si la clave no está configurada, esto
  -- lanza excepción acá mismo -- antes de crear la tabla temporal de
  -- reclamo o tocar cualquier comisión, así que nada queda parcialmente
  -- mutado.
  v_key := public.wa_referral_payout_method_encryption_key();

  -- account_type y alias son las 2 claves opcionales del snapshot: se
  -- incluyen SOLO cuando el método guardado realmente las tiene, nunca
  -- con un valor artificial. Para CL, account_type siempre viene
  -- poblado desde wa_set_my_referral_payout_method() -- para AR puede
  -- ser NULL (CBU/CVU no tiene ese concepto), y el validador extendido
  -- en 20260818115000 lo acepta ausente exclusivamente para países
  -- distintos de CL.
  v_snapshot := jsonb_build_object(
    'method',         v_method.method_type,
    'country',        v_method.country,
    'holder_name',    pgp_sym_decrypt(v_method.holder_name_ciphertext, v_key),
    'holder_tax_id',  pgp_sym_decrypt(v_method.tax_id_ciphertext, v_key),
    'bank_name',      v_method.bank_name,
    'account_number', pgp_sym_decrypt(v_method.account_number_ciphertext, v_key)
  ) || CASE WHEN v_method.account_type IS NOT NULL
            THEN jsonb_build_object('account_type', v_method.account_type)
            ELSE '{}'::jsonb
       END
    || CASE WHEN v_method.alias IS NOT NULL
            THEN jsonb_build_object('alias', v_method.alias)
            ELSE '{}'::jsonb
       END;

  -- Re-validar el snapshot recién construido con el MISMO helper que ya
  -- protege el CHECK constraint de la tabla -- nunca confiar ciegamente
  -- ni siquiera en datos propios ya construidos server-side. No debería
  -- poder fallar nunca (los datos ya pasaron por wa_set_my_referral_payout_
  -- method), pero si algún día lo hace, es preferible una excepción clara
  -- acá a un INSERT rechazado más abajo por el CHECK constraint con un
  -- mensaje menos útil.
  IF NOT public.wa_validate_referral_payout_method_snapshot(v_snapshot) THEN
    RAISE EXCEPTION 'REFERRAL_PAYOUT_METHOD_SNAPSHOT_BUILD_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_terms FROM public.referral_program_terms LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFERRAL_PROGRAM_TERMS_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  -- Todo lo que sigue, SIN CAMBIOS respecto a la versión anterior
  -- (20260815100000): mismo locking, mismo agrupado por moneda, mismo
  -- min_payout_amount, mismos INSERTs -- únicamente p_payout_method_snapshot
  -- fue reemplazado por v_snapshot (construido server-side arriba).
  DROP TABLE IF EXISTS pg_temp._wa_payout_claim;
  CREATE TEMP TABLE _wa_payout_claim (
    commission_id   UUID,
    reward_amount   NUMERIC(12,2),
    reward_currency TEXT
  ) ON COMMIT DROP;

  INSERT INTO _wa_payout_claim (commission_id, reward_amount, reward_currency)
  SELECT rc.id, rc.reward_amount, rc.reward_currency
  FROM public.referral_commissions rc
  WHERE rc.referrer_user_id = v_user_id
    AND rc.status = 'approved'
    AND NOT EXISTS (
      SELECT 1 FROM public.referral_payout_commissions rpc
      WHERE rpc.commission_id = rc.id AND rpc.released_at IS NULL
    )
  ORDER BY rc.id
  FOR UPDATE OF rc SKIP LOCKED;

  FOR v_group IN
    SELECT reward_currency, array_agg(commission_id) AS commission_ids, sum(reward_amount) AS total
    FROM _wa_payout_claim
    GROUP BY reward_currency
  LOOP
    IF v_group.total < v_terms.min_payout_amount THEN
      v_results := v_results || jsonb_build_object(
        'currency', v_group.reward_currency,
        'created', false,
        'reason', 'below_minimum',
        'amount', v_group.total
      );
      CONTINUE;
    END IF;

    INSERT INTO public.referral_payout_requests (
      referrer_user_id, requested_amount, currency, payout_method_snapshot
    ) VALUES (
      v_user_id, v_group.total, v_group.reward_currency, v_snapshot
    )
    RETURNING id INTO v_payout_id;

    INSERT INTO public.referral_payout_commissions (payout_id, commission_id, reward_amount_snapshot)
    SELECT v_payout_id, c.commission_id, c.reward_amount
    FROM _wa_payout_claim c
    WHERE c.reward_currency = v_group.reward_currency;

    v_results := v_results || jsonb_build_object(
      'currency', v_group.reward_currency,
      'created', true,
      'payoutId', v_payout_id,
      'amount', v_group.total,
      'commissionCount', array_length(v_group.commission_ids, 1)
    );
  END LOOP;

  IF jsonb_array_length(v_results) = 0 THEN
    RETURN jsonb_build_object('requested', true, 'payouts', '[]'::jsonb, 'reason', 'nothing_to_withdraw');
  END IF;

  RETURN jsonb_build_object('requested', true, 'payouts', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.wa_request_referral_payout(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_request_referral_payout(JSONB) TO authenticated;

COMMENT ON FUNCTION public.wa_request_referral_payout(JSONB) IS
  'Autoservicio: reclama atómicamente (FOR UPDATE SKIP LOCKED) todas las comisiones approved libres del caller, agrupadas por moneda, y crea un referral_payout_requests por grupo (respetando min_payout_amount). Fase C3 (2026-08-18): el payout_method_snapshot se construye EXCLUSIVAMENTE server-side desde referral_payout_methods (Fase C2) -- p_payout_method_snapshot se conserva solo por compatibilidad de firma, SIEMPRE se ignora. Sin método guardado -> {requested:false, reason:payout_method_not_configured}, sin reclamar comisiones ni mutar nada. Vault solo se consulta tras confirmar auth+método (fail closed si falta la clave, antes de cualquier mutación). Restringida a authenticated -- re-valida auth.uid() server-side.';

NOTIFY pgrst, 'reload schema';
