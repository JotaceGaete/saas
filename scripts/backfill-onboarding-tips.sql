-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL: onboarding_tip_sequence
--
-- Para usuarios ya registrados que no tienen ningún tip en email_queue.
--
-- COMPORTAMIENTO:
--   - Solo actúa sobre negocios que NO tienen ningún onboarding_tip_* en cola.
--   - Programa desde NOW() + delay (no desde created_at) para evitar
--     enviar todos los tips de golpe para usuarios antiguos.
--   - Es idempotente: ON CONFLICT DO NOTHING, seguro de ejecutar varias veces.
--
-- CÓMO EJECUTAR:
--   En Supabase Studio → SQL Editor, ejecutar este script completo.
--   O bien: psql -d $DATABASE_URL -f scripts/backfill-onboarding-tips.sql
--
-- IMPORTANTE:
--   Revisar primero cuántos negocios se verán afectados con la query
--   de estimación al final de este archivo antes de ejecutar el INSERT.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r             record;
  v_tip_num     int;
  v_type        text;
  v_delay       interval;
  v_email       text;
  v_name        text;
  v_inserted    int := 0;
  v_skipped     int := 0;
BEGIN

  -- Iterar sobre negocios activos sin ningún tip de onboarding
  FOR r IN
    SELECT
      b.id          AS business_id,
      b.user_id,
      b.name        AS business_name,
      b.email       AS business_email,
      u.email       AS auth_email
    FROM public.wa_businesses b
    LEFT JOIN auth.users u ON u.id = b.user_id
    WHERE b.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.email_queue eq
        WHERE eq.business_id = b.id
          AND eq.type LIKE 'onboarding_tip_%'
      )
    ORDER BY b.created_at ASC
  LOOP

    v_email := COALESCE(
      NULLIF(trim(r.business_email), ''),
      r.auth_email
    );

    IF v_email IS NULL THEN
      RAISE NOTICE 'Backfill: sin email para business %, saltando', r.business_id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_name := COALESCE(NULLIF(trim(r.business_name), ''), split_part(v_email, '@', 1));

    FOR v_tip_num IN 1..10 LOOP
      v_type := 'onboarding_tip_' || lpad(v_tip_num::text, 2, '0');

      IF v_tip_num = 1 THEN
        v_delay := interval '24 hours';
      ELSE
        v_delay := make_interval(days => v_tip_num);
      END IF;

      INSERT INTO public.email_queue (
        user_id,
        business_id,
        type,
        template,
        to_email,
        subject,
        payload,
        next_attempt_at,
        status,
        retry_count
      )
      VALUES (
        r.user_id,
        r.business_id,
        v_type,
        v_type,
        v_email,
        NULL,
        jsonb_build_object(
          'name',          NULLIF(trim(r.business_name), ''),
          'business_name', v_name,
          'user_email',    v_email,
          'created_at',    now()
        ),
        now() + v_delay,
        'pending',
        0
      )
      ON CONFLICT (business_id, type) DO NOTHING;

    END LOOP;

    v_inserted := v_inserted + 1;

  END LOOP;

  RAISE NOTICE 'Backfill completado: % negocios procesados, % sin email saltados.',
    v_inserted, v_skipped;

END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- QUERY DE ESTIMACIÓN — ejecutar ANTES del backfill para saber el impacto
-- ─────────────────────────────────────────────────────────────────────────────
--
-- SELECT count(*) AS negocios_sin_tips
-- FROM public.wa_businesses b
-- WHERE b.is_active = true
--   AND NOT EXISTS (
--     SELECT 1 FROM public.email_queue eq
--     WHERE eq.business_id = b.id
--       AND eq.type LIKE 'onboarding_tip_%'
--   );
--
-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-BACKFILL
-- ─────────────────────────────────────────────────────────────────────────────
--
-- SELECT
--   type,
--   count(*)        AS total,
--   min(next_attempt_at) AS primer_envio,
--   max(next_attempt_at) AS ultimo_envio
-- FROM public.email_queue
-- WHERE type LIKE 'onboarding_tip_%'
--   AND status = 'pending'
-- GROUP BY type
-- ORDER BY type;
