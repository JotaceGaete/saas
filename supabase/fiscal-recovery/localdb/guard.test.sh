#!/usr/bin/env bash
# La reconstrucción destructiva debe fallar antes de ejecutar psql con parámetros inseguros.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/psql" <<'EOF'
#!/usr/bin/env bash
touch "$GUARD_PSQL_MARKER"
exit 88
EOF
chmod +x "$TMP/psql"
export PATH="$TMP:$PATH"
export GUARD_PSQL_MARKER="$TMP/psql-started"
expect_denied() {
  local status=0
  rm -f "$GUARD_PSQL_MARKER"
  (cd "$ROOT" && "$@" bash supabase/fiscal-recovery/localdb/build.sh) >"$TMP/output" 2>&1 || status=$?
  if [[ "$status" -eq 0 || -e "$GUARD_PSQL_MARKER" ]]; then
    echo "ERROR: reconstrucción no bloqueada antes de psql" >&2
    exit 1
  fi
}
expect_denied env PGHOST=db.example.com FISCAL_TEST_PG_DB=walinka_test
expect_denied env PGHOST=localhost FISCAL_TEST_PG_DB=walinka
expect_denied env PGHOST=localhost FISCAL_TEST_PG_DB='walinka_test;drop database postgres'
expect_denied env PGHOST=localhost FISCAL_TEST_PG_DB=postgres_test
expect_denied env PGHOST=localhost PGHOSTADDR=10.0.0.1 FISCAL_TEST_PG_DB=walinka_test
expect_denied env PGHOST=localhost PGSERVICE=production FISCAL_TEST_PG_DB=walinka_test
echo 'Local DB guard: 6 configuraciones inseguras bloqueadas'
