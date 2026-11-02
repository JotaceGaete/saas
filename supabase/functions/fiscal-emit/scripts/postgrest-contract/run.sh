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
# Validar URI con parser real: host local, base *_test y protocolo PostgreSQL.
# No imprimir la URI: puede contener contraseñas.
if ! node -e '
  const u = new URL(process.env.PGRST_DB_URI);
  const db = decodeURIComponent(u.pathname.slice(1));
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  const testDb = /^[a-z][a-z0-9_]*_test$/.test(db);
  if (!["postgres:", "postgresql:"].includes(u.protocol) || !local || !testDb) process.exit(1);
' 2>/dev/null; then
  echo "Negado: se exige PostgreSQL en loopback y una base *_test." >&2
  exit 3
fi

# No aceptar un servicio preexistente en el puerto de pruebas.
# Un HTTP 404 también significa que el puerto está ocupado; comprobar TCP, no el status HTTP.
if node -e '
  const net = require("node:net");
  const s = net.connect({host:"127.0.0.1", port:3999});
  s.setTimeout(1000);
  s.on("connect", () => { s.destroy(); process.exit(0); });
  s.on("error", () => process.exit(1));
  s.on("timeout", () => { s.destroy(); process.exit(1); });
'; then
  echo "Negado: puerto local 3999 ocupado; no se ejecutarán pruebas contra un servicio ajeno." >&2
  exit 4
fi

export PGRST_DB_URI
export PGRST_JWT_SECRET="${PGRST_JWT_SECRET:-$(openssl rand -hex 32)}"
export POSTGREST_URL="http://127.0.0.1:${PORT}"
export POSTGREST_JWT_SECRET="$PGRST_JWT_SECRET"

"$POSTGREST_BIN" "$HERE/postgrest.conf" >"$HERE/.postgrest.log" 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

READY=false
for _ in $(seq 1 40); do
  # Un proceso ajeno podría estar escuchando en el puerto: no basta con que curl conecte.
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "PostgREST terminó al arrancar; revisa $HERE/.postgrest.log (sin secretos)." >&2
    exit 4
  fi
  if curl --fail --silent --max-time 2 -o /dev/null "http://127.0.0.1:${PORT}/"; then
    READY=true
    break
  fi
  sleep 0.5
done
if [[ "$READY" != true ]]; then
  echo "PostgREST no estuvo listo dentro del plazo; pruebas de contrato NO ejecutadas." >&2
  exit 4
fi

cd "$ROOT"
node --test test/contract/postgrest.contract.test.mjs
