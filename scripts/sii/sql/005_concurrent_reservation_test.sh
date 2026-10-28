#!/usr/bin/env bash
# Isolated PostgreSQL 16 only; run after 004_isolated_smoke_test.psql.
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export SII_TEST_SYNC_DIR="$tmp"
# Session A keeps its transaction open after reserving a folio.
# Session B must wait for A, then receive exactly the same operation and folio.
cat > "$tmp/first.psql" <<'SQL'
\set ON_ERROR_STOP on
BEGIN;
SELECT * FROM fiscal.reserve_boleta39('tenant-test','race-same-sale','12345678-5');
\! touch "$SII_TEST_SYNC_DIR/first-reserved"
SELECT pg_sleep(3);
COMMIT;
SQL
cat > "$tmp/second.psql" <<'SQL'
\set ON_ERROR_STOP on
BEGIN;
SELECT * FROM fiscal.reserve_boleta39('tenant-test','race-same-sale','12345678-5');
COMMIT;
SQL
psql -X -v ON_ERROR_STOP=1 -f "$tmp/first.psql" > "$tmp/first.log" 2>&1 &
first_pid=$!
ready=0
for i in $(seq 1 100); do
  if [ -f "$tmp/first-reserved" ]; then ready=1; break; fi
  if ! kill -0 "$first_pid" 2>/dev/null; then
    cat "$tmp/first.log"; echo "First transaction failed" >&2; exit 1
  fi
  sleep 0.05
done
if [ "$ready" != 1 ]; then echo "First transaction did not reach reservation" >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -f "$tmp/second.psql" > "$tmp/second.log" 2>&1 &
second_pid=$!
sleep 0.3
if ! kill -0 "$second_pid" 2>/dev/null; then
  cat "$tmp/second.log"; echo "Second transaction did not wait for lock" >&2; exit 1
fi
wait "$first_pid" || { cat "$tmp/first.log"; exit 1; }
wait "$second_pid" || { cat "$tmp/second.log"; exit 1; }
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE op_count int; allocated_folio bigint; next_folio bigint;
BEGIN
 SELECT count(*),min(folio) INTO op_count,allocated_folio
 FROM fiscal.issuance_operations WHERE business_id='tenant-test' AND sale_id='race-same-sale';
 SELECT c.next_folio INTO next_folio FROM fiscal.caf_ranges c WHERE c.issuer_rut='12345678-5';
 IF op_count<>1 OR allocated_folio<>701 OR next_folio<>702 THEN
  RAISE EXCEPTION 'Concurrency invariant failed: count %, folio %, next %',
    op_count,allocated_folio,next_folio;
 END IF;
END;
$;
SQL
echo "PASS: two independent PostgreSQL sessions reserved one folio for one sale"
