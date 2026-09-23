#!/usr/bin/env bash
# Verificación MANUAL de concurrencia REAL (dos conexiones) para
# 20260923100000_crm_cash_close_idempotent.sql -- doble submit / reintento
# que llega mientras el primer cierre todavía no hizo COMMIT.
#
# NO ejecutar contra producción (project-ref hxxdketymcntadffmajf) — solo
# contra una instancia local/throwaway (`supabase start` + `supabase db reset`):
#
#   DB_URL="$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
#     bash supabase/diagnostics/verify_crm_cash_close_idempotent_concurrency.sh
#
# Escenario:
#   A: cierra la caja y se queda 3s con la transacción abierta (pg_sleep).
#   B: 0,5s después intenta el MISMO cierre -> queda bloqueado en FOR UPDATE,
#      y al hacer COMMIT A debe devolver el snapshot con already_closed=true.
#   C: 0,5s después intenta un cierre con OTRO monto -> debe fallar con
#      CASH_SESSION_ALREADY_CLOSED_DIFFERENT (nunca 23505).
#   Al final debe existir exactamente 1 fila de conciliación.
# Crea datos de prueba propios y los borra al terminar.
set -euo pipefail

: "${DB_URL:?Definir DB_URL (instancia local)}"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAtX)
USER_ID='00000000-0000-0000-0000-0000000000c1'
TMP="$(mktemp -d)"

cleanup() {
  "${PSQL[@]}" <<SQL >/dev/null || true
DELETE FROM public.crm_cash_sessions WHERE business_id IN (SELECT id FROM public.wa_businesses WHERE user_id = '$USER_ID');
DELETE FROM public.wa_businesses WHERE user_id = '$USER_ID';
DELETE FROM auth.users WHERE id = '$USER_ID';
SQL
  rm -rf "$TMP"
}
trap cleanup EXIT

SESSION_ID="$("${PSQL[@]}" <<SQL
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES ('$USER_ID', 'cierreconc@example.test', '{"name": "Negocio Concurrencia"}'::jsonb, now(), 'authenticated', 'authenticated');
INSERT INTO public.crm_cash_sessions (business_id, date, initial_amount)
SELECT id, CURRENT_DATE, 1000 FROM public.wa_businesses WHERE user_id = '$USER_ID'
RETURNING id;
SQL
)"
SESSION_ID="$(echo "$SESSION_ID" | tail -n1)"

AUTH="SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '$USER_ID', false);"
SAME='[{"payment_method":"cash","reconciled_amount":1000}]'
OTHER='[{"payment_method":"cash","reconciled_amount":999}]'

"${PSQL[@]}" >"$TMP/a" 2>&1 <<SQL &
$AUTH
BEGIN;
SELECT 'A:' || (public.crm_close_cash_session('$SESSION_ID', '$SAME', 'faltante') ->> 'already_closed');
SELECT pg_sleep(3);
COMMIT;
SQL
PID_A=$!
sleep 0.5

"${PSQL[@]}" >"$TMP/b" 2>&1 <<SQL &
$AUTH
SELECT 'B:' || (public.crm_close_cash_session('$SESSION_ID', '$SAME', 'faltante') ->> 'already_closed');
SQL
PID_B=$!

"${PSQL[@]}" >"$TMP/c" 2>&1 <<SQL &
$AUTH
DO \$\$
DECLARE v_hint TEXT;
BEGIN
  PERFORM public.crm_close_cash_session('$SESSION_ID', '$OTHER', 'faltante');
  RAISE NOTICE 'C:OK';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  RAISE NOTICE 'C:% %', SQLSTATE, v_hint;
END \$\$;
SQL
PID_C=$!

wait "$PID_A" "$PID_B" "$PID_C"

A="$(grep -o 'A:[a-z]*' "$TMP/a" || true)"
B="$(grep -o 'B:[a-z]*' "$TMP/b" || true)"
C="$(grep -o 'C:[A-Z0-9_ ]*' "$TMP/c" || true)"
ROWS="$("${PSQL[@]}" -c "SELECT count(*) FROM public.crm_cash_session_reconciliations WHERE session_id = '$SESSION_ID'")"

echo "A (primer cierre):          $A"
echo "B (mismo cierre, en paralelo): $B"
echo "C (otro monto, en paralelo):   $C"
echo "filas de conciliación:      $ROWS"

fail=0
[ "$A" = "A:false" ] || { echo "FAIL: A debería cerrar con already_closed=false"; cat "$TMP/a"; fail=1; }
[ "$B" = "B:true" ] || { echo "FAIL: B debería devolver already_closed=true"; cat "$TMP/b"; fail=1; }
[ "$C" = "C:P0001 CASH_SESSION_ALREADY_CLOSED_DIFFERENT" ] || { echo "FAIL: C debería fallar con CASH_SESSION_ALREADY_CLOSED_DIFFERENT"; cat "$TMP/c"; fail=1; }
[ "$ROWS" = "1" ] || { echo "FAIL: debería existir exactamente 1 fila de conciliación"; fail=1; }
[ "$fail" = 0 ] && echo "OK: concurrencia real -- un solo cierre, la repetición devuelve el snapshot y el payload distinto se rechaza sin 23505"
exit "$fail"
