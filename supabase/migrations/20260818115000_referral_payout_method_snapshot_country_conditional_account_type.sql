-- ============================================================
-- Affiliate Core — Fase C3 (parte 1/2): account_type deja de ser
-- obligatorio de forma incondicional en wa_validate_referral_payout_
-- method_snapshot(). Pasa a depender del país del snapshot.
--
-- MOTIVACIÓN:
--   La versión original (20260815100000) exige account_type no vacío
--   para CUALQUIER país. Esto fue correcto mientras el único país
--   soportado era CL (cuenta corriente/ahorro/vista SIEMPRE tiene un
--   "tipo"). Fase C2 (20260818110000) agregó Argentina, donde el pago
--   es por CBU/CVU -- un identificador de cuenta único, sin el concepto
--   de "tipo de cuenta" -- por lo que referral_payout_methods.account_type
--   es NULLABLE para AR a propósito.
--
--   Sin este cambio, la única forma de que un snapshot AR pase el
--   validador (y por lo tanto el CHECK constraint de la tabla) sería
--   inventar un account_type artificial (p.ej. 'cbu') que no representa
--   un dato real capturado del usuario. Eso es exactamente lo que este
--   archivo evita.
--
-- CAMBIO EXACTO:
--   CL  -> account_type sigue siendo obligatorio y no vacío (SIN CAMBIOS
--          de comportamiento para CL, ver diagnóstico caso 0 de
--          verify_referral_payout_requests.sql, 100% CL-scoped).
--   AR (o cualquier país no-CL) -> account_type puede estar ausente o
--          ser NULL. Si está PRESENTE como string, igual debe ser no
--          vacío (nunca se acepta una cadena en blanco disfrazando una
--          ausencia real -- ni para CL ni para ningún otro país).
--
-- QUÉ NO CAMBIA (auditado antes de tocar esta función; único hallazgo
-- fue el propio placeholder 'cbu' de la migración C3 uncommitted, que
-- se corrige en el archivo siguiente):
--   - El resto de los campos (method, country, holder_name, bank_name,
--     account_number): idéntica validación, sin cambios.
--   - El CHECK constraint referral_payout_requests_snapshot_valid_check
--     (20260815100000) invoca esta función por nombre -- hereda el
--     nuevo comportamiento automáticamente vía CREATE OR REPLACE, sin
--     necesidad de tocar la tabla ni el constraint.
--   - wa_request_referral_payout() histórico (20260815100000, sin
--     tocar): construye siempre snapshots con country='CL' con
--     account_type poblado -- sigue siendo válido sin cambios.
--   - Ningún payout existente se re-valida ni se re-escribe: el CHECK
--     solo se evalúa en INSERT/UPDATE del propio payout_method_snapshot,
--     que ya es inmutable por trigger. Los snapshots históricos
--     guardados en filas ya existentes NUNCA pasan de nuevo por esta
--     función.
--   - Ninguna lógica financiera (montos, comisiones, locking, streak,
--     maduración, refunds, atribución) se toca.
--
-- IMMUTABLE se preserva: el resultado depende exclusivamente del valor
-- de p_snapshot pasado como argumento.
-- ============================================================

CREATE OR REPLACE FUNCTION public.wa_validate_referral_payout_method_snapshot(p_snapshot JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    p_snapshot IS NOT NULL
    AND jsonb_typeof(p_snapshot) = 'object'
    AND p_snapshot->>'method' = 'bank_transfer'
    AND COALESCE(btrim(p_snapshot->>'country'),        '') <> ''
    AND COALESCE(btrim(p_snapshot->>'holder_name'),     '') <> ''
    AND COALESCE(btrim(p_snapshot->>'bank_name'),       '') <> ''
    AND COALESCE(btrim(p_snapshot->>'account_number'),  '') <> ''
    AND CASE
          WHEN p_snapshot->>'country' = 'CL'
            THEN COALESCE(btrim(p_snapshot->>'account_type'), '') <> ''
          ELSE
            p_snapshot->>'account_type' IS NULL
            OR btrim(p_snapshot->>'account_type') <> ''
        END,
    false
  );
$$;

COMMENT ON FUNCTION public.wa_validate_referral_payout_method_snapshot(JSONB) IS
  'Valida la forma de un payout_method_snapshot bank_transfer: method/country/holder_name/bank_name/account_number siempre obligatorios y no vacíos. account_type es obligatorio y no vacío SOLO cuando country=''CL'' (cuentas chilenas siempre tienen un tipo); para cualquier otro país puede estar ausente/NULL (p.ej. AR, donde el pago es por CBU/CVU y no existe ese concepto) -- si está presente como string igual debe ser no vacío. holder_tax_id y email siguen siendo opcionales. NULL siempre inválido (nunca ambiguo vía CHECK constraint). IMMUTABLE: depende exclusivamente de p_snapshot.';
