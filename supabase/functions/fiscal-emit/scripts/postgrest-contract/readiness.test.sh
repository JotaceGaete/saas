#!/usr/bin/env bash
# No ejecutar tests si PostgREST no responde durante el arranque.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/postgrest" <<'EOF'
#!/usr/bin/env bash
sleep 30
EOF
cat > "$TMP/curl" <<'EOF'
#!/usr/bin/env bash
exit 7
EOF
cat > "$TMP/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$TMP/node" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "-e" ]]; then
  exec "$REAL_NODE" "$@"
fi
touch "$READINESS_TEST_NODE_STARTED"
exit 99
EOF
chmod +x "$TMP/postgrest" "$TMP/curl" "$TMP/sleep" "$TMP/node"
export REAL_NODE="$(command -v node)"
export READINESS_TEST_NODE_STARTED="$TMP/node-tests-started"
status=0
PATH="$TMP:$PATH" POSTGREST_BIN="$TMP/postgrest" \
  PGRST_DB_URI='postgres://postgres@127.0.0.1:5544/walinka_test' \
  bash "$HERE/run.sh" >"$TMP/output" 2>&1 || status=$?
if [[ "$status" -ne 4 || -e "$READINESS_TEST_NODE_STARTED" ]]; then
  echo "ERROR: runner no bloqueó pruebas con PostgREST no disponible (status=$status)" >&2
  exit 1
fi
echo 'PostgREST readiness: sin servidor listo no se ejecutan tests'
