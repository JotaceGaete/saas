#!/usr/bin/env bash
# Verifica que el runner rechaza destinos peligrosos ANTES de iniciar PostgREST.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$HERE/run.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/postgrest" <<'EOF'
#!/usr/bin/env bash
touch "$GUARD_STARTED_MARKER"
exit 88
EOF
chmod +x "$TMP/postgrest"
export POSTGREST_BIN="$TMP/postgrest"
export GUARD_STARTED_MARKER="$TMP/started"
expect_denied() {
  local uri="$1" status
  rm -f "$GUARD_STARTED_MARKER"
  status=0
  PGRST_DB_URI="$uri" bash "$RUN" >"$TMP/output" 2>&1 || status=$?
  if [[ "$status" -ne 3 || -e "$GUARD_STARTED_MARKER" ]]; then
    echo "ERROR: URI no bloqueada antes de ejecutar PostgREST (status=$status)" >&2
    exit 1
  fi
}
expect_denied 'postgres://user:pass@db.example.com:5432/walinka_test'
expect_denied 'postgres://user:pass@127.0.0.1:5432/walinka'
expect_denied 'postgres://user:pass@127.0.0.1:5432/postgres'
expect_denied 'postgres://user:pass@host.docker.internal:5432/walinka_test'
expect_denied 'https://127.0.0.1:5432/walinka_test'
expect_denied 'postgres://user:pass@127.0.0.1:5432/walinka_test%0A'
echo 'PostgREST guard: 6 destinos peligrosos bloqueados'
