#!/bin/bash
# Reconstruye la base LOCAL de pruebas walinka_test desde el repositorio. Se niega a tocar
# cualquier host que no sea un socket local o localhost. Nunca apunta a producción.
#   PGHOST=/home/pgtest/pg/sock PGPORT=5544 bash supabase/fiscal-recovery/localdb/build.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
DB="${FISCAL_TEST_PG_DB:-walinka_test}"
case "${PGHOST:-}" in /*|localhost|127.0.0.1) ;; *) echo "PGHOST debe ser local"; exit 1;; esac
# Las variables PG* pueden redirigir psql a otro servidor sin cambiar PGHOST.
# Bloquear cadenas de conexión, servicios y puertos no declarados explícitamente.
for unsafe in PGHOSTADDR PGSERVICE PGSERVICEFILE PGDATABASE PGOPTIONS; do
  if [[ -n "${!unsafe:-}" ]]; then
    echo "Variable $unsafe no permitida en reconstrucción local" >&2
    exit 1
  fi
done
if [[ -n "${PGPORT:-}" && ! "${PGPORT}" =~ ^[0-9]{1,5}$ ]]; then
  echo "PGPORT inválido" >&2
  exit 1
fi
# Solo nombres simples y explícitamente de prueba; jamás interpolar SQL arbitrario.
[[ "$DB" =~ ^[a-z][a-z0-9_]*_test$ ]] || { echo "nombre de base de prueba inválido"; exit 1; }
[[ "$DB" != "postgres_test" && "$DB" != "template0_test" && "$DB" != "template1_test" ]] || { echo "nombre reservado"; exit 1; }
PSQL=(psql -U "${PGUSER:-postgres}" -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\"" -c "create database \"$DB\""
"${PSQL[@]}" -d "$DB" -f supabase/fiscal-recovery/localdb/00_supabase_stub.sql
# Fail closed on the FIRST failed migration. Never claim a partial reconstruction
# is equivalent to production, even if a caller sets legacy bypass flags.
apply_migration() {
  local file="$1"
  local log
  log="$(mktemp)"
  echo "aplicando migración: $file"
  if ! "${PSQL[@]}" -d "$DB" -1 -f "$file" >"$log" 2>&1; then
    echo "ERROR: migración fallida: $file" >&2
    cat "$log" >&2
    rm -f "$log"
    exit 5
  fi
  rm -f "$log"
}
for f in supabase/migrations/*.sql; do
  apply_migration "$f"
done
for f in supabase/fiscal-recovery/migrations/*.sql; do
  apply_migration "$f"
done
for f in 20261031_p0_fiscal_admin_tables 20261031_fiscal_single_ledger_guard 20261101_fiscal_connection \
         20261102_fiscal_provider_claim_guard 20261031_issuer_sucursal_config 20261102_fiscal_sii_status; do
  echo "aplicando propuesta $f"
  # No ocultar fallos SQL: si una propuesta falla, la base local NO está lista para pruebas.
  "${PSQL[@]}" -d "$DB" -1 -f "supabase/fiscal-recovery/proposed/$f.sql"
done
"${PSQL[@]}" -d "$DB" -f supabase/fiscal-recovery/localdb/90_service_role_grants.sql
echo "listo: $DB (sin migraciones omitidas)"\n