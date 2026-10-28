#!/usr/bin/env bash
# Isolated PostgreSQL only. Tests two DIFFERENT sales against one CAF range.
# SKIP LOCKED is allowed to return a transient "CAF range temporarily locked";
# caller MUST retry that error after the other transaction commits.
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export SII_TEST_SYNC_DIR="$tmp"
cat > "$tmp/a.psql" <<'SQL'
\set ON_ERROR_STOP on
BEGIN;
SELECT * FROM fiscal.reserve_boleta39('tenant-test','race-sale-a','12345678-5');
\! touch "$SII_TEST_SYNC_DIR/first-reserved"
SELECT pg_sleep(3);
COMMIT;
SQL
psql -X -v ON_ERROR_STOP=1 -f "$tmp/a.psql" > "$tmp/a.log" 2>&1 &
pid=$!
ready=0
for i in $(seq 1 100); do
  if [ -f "$tmp/first-reserved" ]; then ready=1; break; fi
  if ! kill -0 "$pid" 2>/dev/null; then cat "$tmp/a.log"; exit 1; fi
  sleep 0.05
done
if [ "$ready" != 1 ]; then cat "$tmp/a.log"; echo "First reservation did not start" >&2; exit 1; fi
# Different sale: no unique-key conflict. Locked CAF range is skipped.
if psql -X -v ON_ERROR_STOP=1 -c "SELECT * FROM fiscal.reserve_boleta39('tenant-test','race-sale-b','12345678-5');" > "$tmp/attempt.log" 2>&1; then
  echo "Unexpected successful concurrent reservation from sole locked CAF" >&2; exit 1
fi
if ! grep -q 'CAF range temporarily locked' "$tmp/attempt.log"; then
  cat "$tmp/attempt.log"; echo "Unexpected SQL failure (not retryable CAF lock)" >&2; exit 1
fi
wait "$pid" || { cat "$tmp/a.log"; exit 1; }
# Retry after first transaction committed, without allocating a second folio to sale A.
psql -X -v ON_ERROR_STOP=1 -c "SELECT * FROM fiscal.reserve_boleta39('tenant-test','race-sale-b','12345678-5');"
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE a bigint; b bigint; n integer; next_value bigint;
BEGIN
 SELECT folio INTO a FROM fiscal.issuance_operations WHERE sale_id='race-sale-a';
 SELECT folio INTO b FROM fiscal.issuance_operations WHERE sale_id='race-sale-b';
 SELECT count(*) INTO n FROM fiscal.issuance_operations WHERE sale_id IN ('race-sale-a','race-sale-b');
 SELECT next_folio INTO next_value FROM fiscal.caf_ranges WHERE issuer_rut='12345678-5';
 IF n<>2 OR a<>702 OR b<>703 OR next_value<>704 THEN
  RAISE EXCEPTION 'Different-sale concurrency failure: count %, A %, B %, next %',n,a,b,next_value;
 END IF;
END;
$;
SQL
echo "PASS: locked CAF returns transient failure; retry yields distinct folios"
