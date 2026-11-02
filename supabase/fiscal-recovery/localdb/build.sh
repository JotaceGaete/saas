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
fails=()
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -1 -f "$f" >/dev/null 2>&1 || fails+=("$f")
done
printf "migraciones del repo no aplicadas en local: %s\\n" "${#fails[@]}"
if (( ${#fails[@]} > 0 )); then
  printf "  OMITIDA: %s\\n" "${fails[@]}"
fi
pilot_skipped=()
for f in supabase/fiscal-recovery/migrations/*.sql; do
  if ! "${PSQL[@]}" -d "$DB" -1 -f "$f" >/dev/null 2>&1; then
    pilot_skipped+=("$f")
  fi
done
printf "migraciones de recuperación omitidas: %s\\n" "${#pilot_skipped[@]}"
if (( ${#pilot_skipped[@]} > 0 )); then
  printf "  OMITIDA: %s\\n" "${pilot_skipped[@]}"
fi
for f in 20261031_p0_fiscal_admin_tables 20261031_fiscal_single_ledger_guard 20261101_fiscal_connection \
         20261102_fiscal_provider_claim_guard 20261031_issuer_sucursal_config 20261102_fiscal_sii_status; do
  echo "aplicando propuesta $f"
  # No ocultar fallos SQL: si una propuesta falla, la base local NO está lista para pruebas.
  "${PSQL[@]}" -d "$DB" -1 -f "supabase/fiscal-recovery/proposed/$f.sql"
done
"${PSQL[@]}" -d "$DB" -f supabase/fiscal-recovery/localdb/90_service_role_grants.sql
if (( ${#fails[@]} > 0 || ${#pilot_skipped[@]} > 0 )); then
  echo "ATENCIÓN: base $DB construida con migraciones omitidas; NO es una réplica completa." >&2
  if [[ "${FISCAL_ALLOW_PARTIAL_MIGRATIONS:-}" != "1" ]]; then
    echo "Validación estricta fallida. Para pruebas parciales, definir FISCAL_ALLOW_PARTIAL_MIGRATIONS=1 explícitamente." >&2
    exit 5
  fi
  echo "MODO PARCIAL ACEPTADO: resultados no demuestran paridad con producción."
else
  echo "listo: $DB (sin migraciones omitidas)"
fi
