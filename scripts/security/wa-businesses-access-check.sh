#!/usr/bin/env bash
# Verifica el control de acceso de wa_businesses / wa_payments por rol.
#
# Uso:
#   PGHOST=/tmp PGPORT=5433 PGUSER=postgres PGDATABASE=walinka_disposable \
#     scripts/security/wa-businesses-access-check.sh            # aplica migración y prueba
#   ... scripts/security/wa-businesses-access-check.sh --baseline  # sin migración: DEBE fallar
#
# Seguridad: se niega a ejecutarse salvo que PGDATABASE contenga "disposable" o "ci".
# Nunca apuntar a producción. No aplica nada fuera de la base descartable.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20261031120000_wa_businesses_access_hardening.sql"

db="${PGDATABASE:-}"
if [[ "$db" != *disposable* && "$db" != *ci* ]]; then
  echo "REFUSED: PGDATABASE='$db' must contain 'disposable' or 'ci'. Never run against production." >&2
  exit 2
fi

mode="${1:-}"
psql_base=(psql -X -v ON_ERROR_STOP=1 -q)

echo "[1/3] Fixture con estado original de producción (policy public_read abierta)"
"${psql_base[@]}" -f "$DIR/wa-businesses-access-fixture.sql"

if [[ "$mode" == "--baseline" ]]; then
  echo "[2/3] BASELINE: se omite la migración. Las pruebas deben FALLAR (demuestra la exposición)."
  if "${psql_base[@]}" -f "$DIR/wa-businesses-access-tests.sql"; then
    echo "BASELINE ERROR: las pruebas pasaron sin la migración; no detectan la exposición." >&2
    exit 1
  fi
  echo "OK: baseline falló como se esperaba."
  exit 0
fi

echo "[2/3] Aplicando migración candidata (solo base descartable)"
"${psql_base[@]}" -f "$MIGRATION"

echo "[3/3] Pruebas de acceso por rol"
"${psql_base[@]}" -f "$DIR/wa-businesses-access-tests.sql"
