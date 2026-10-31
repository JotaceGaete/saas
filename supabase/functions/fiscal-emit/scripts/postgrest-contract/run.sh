#!/usr/bin/env bash
# Ejecuta test/contract contra un PostgREST real y local.
#
# Requisitos (ninguno se imprime):
#   POSTGREST_BIN   ruta al binario de PostgREST (v12 o superior).
#   PGRST_DB_URI    cadena de conexión a una base LOCAL DE PRUEBA (p. ej. walinka_test).
#                   Debe conectar con un rol que PostgREST pueda usar (authenticator) y que tenga
#                   acceso a anon y service_role. Ver README.md, sección "Contrato PostgREST".
# Opcional:
#   PGRST_JWT_SECRET  si no se define, se genera uno aleatorio para esta ejecución.
#
# Bloqueos: se niega a correr si la base apunta al proyecto de producción o a un host no local.
set -euo pipefail

PRODUCTION_REF="hxxdketymcntadffmajf"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PORT=3999

: "${POSTGREST_BIN:?POSTGREST_BIN debe apuntar al binario de PostgREST}"
: "${PGRST_DB_URI:?PGRST_DB_URI debe apuntar a una base local de prueba}"

if [[ ! -x "$POSTGREST_BIN" ]]; then
  echo "POSTGREST_BIN no es ejecutable" >&2
  exit 2
fi
if [[ "$PGRST_DB_URI" == *"$PRODUCTION_REF"* ]]; then
  echo "Negado: PGRST_DB_URI apunta al proyecto de producción." >&2
  exit 3
fi
DB_HOST="$(printf '%s' "$PGRST_DB_URI" | sed -E 's#^[a-z]+://([^@]*@)?([^:/?]+).*#\2#')"
case "$DB_HOST" in
  localhost|127.0.0.1|::1|host.docker.internal) ;;
  *) echo "Negado: la base de contrato debe ser local (host actual: no local)." >&2; exit 3 ;;
esac

export PGRST_DB_URI
export PGRST_JWT_SECRET="${PGRST_JWT_SECRET:-$(openssl rand -hex 32)}"
export POSTGREST_URL="http://127.0.0.1:${PORT}"
export POSTGREST_JWT_SECRET="$PGRST_JWT_SECRET"

"$POSTGREST_BIN" "$HERE/postgrest.conf" >"$HERE/.postgrest.log" 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:${PORT}/"; then
    break
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "PostgREST terminó al arrancar; revisa $HERE/.postgrest.log (sin secretos)." >&2
    exit 4
  fi
  sleep 0.5
done

cd "$ROOT"
node --test test/contract/postgrest.contract.test.mjs
