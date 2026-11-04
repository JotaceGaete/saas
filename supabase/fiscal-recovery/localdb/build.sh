#!/bin/bash
# Reconstruye la base LOCAL de pruebas walinka_test desde el repositorio. Se niega a tocar
# cualquier host que no sea un socket local o localhost. Nunca apunta a producción.
#   PGHOST=/home/pgtest/pg/sock PGPORT=5544 bash supabase/fiscal-recovery/localdb/build.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
DB="${FISCAL_TEST_PG_DB:-walinka_test}"
case "${PGHOST:-}" in /*|localhost|127.0.0.1) ;; *) echo "PGHOST debe ser local"; exit 1;; esac
[[ "$DB" == *_test ]] || { echo "la base debe terminar en _test"; exit 1; }
P="psql -U ${PGUSER:-postgres} -q -v ON_ERROR_STOP=1"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d "$DB" -f supabase/fiscal-recovery/localdb/00_supabase_stub.sql
fails=()
for f in supabase/migrations/*.sql; do
  $P -d "$DB" -1 -f "$f" >/dev/null 2>&1 || fails+=("$f")
done
echo "migraciones del repo que no aplican en local (cron/realtime/email, esperado): ${#fails[@]}"
for f in supabase/fiscal-recovery/migrations/*.sql; do
  $P -d "$DB" -1 -f "$f" >/dev/null 2>&1 || echo "recuperada sin aplicar (datos del piloto): $f"
done
for f in 20261031_p0_fiscal_admin_tables 20261031_fiscal_single_ledger_guard 20261101_fiscal_connection \
         20261102_fiscal_provider_claim_guard 20261031_issuer_sucursal_config 20261102_fiscal_sii_status \
         20261104_fiscal_onboarding_review; do
  echo "aplicando propuesta $f"; $P -d "$DB" -f "supabase/fiscal-recovery/proposed/$f.sql" 2>&1 | grep -v -E 'NOTICE|WARNING' || true
done
$P -d "$DB" -f supabase/fiscal-recovery/localdb/90_service_role_grants.sql
echo "listo: $DB"
