#!/usr/bin/env bash
# Una migración histórica omitida debe impedir certificar la base como completa.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/psql" <<'EOF'
#!/usr/bin/env bash
for arg in "$@"; do
  if [[ "$arg" == supabase/migrations/*.sql ]]; then
    exit 1
  fi
done
exit 0
EOF
chmod +x "$TMP/psql"
status=0
(cd "$ROOT" && env -u FISCAL_ALLOW_PARTIAL_MIGRATIONS PATH="$TMP:$PATH" PGHOST=localhost FISCAL_TEST_PG_DB=walinka_test bash supabase/fiscal-recovery/localdb/build.sh) >"$TMP/output" 2>&1 || status=$?
if [[ "$status" -ne 5 ]]; then
  echo "ERROR: base incompleta no produjo código 5 (status=$status)" >&2
  exit 1
fi
if grep -q 'listo: walinka_test' "$TMP/output"; then
  echo "ERROR: base parcial declarada completa" >&2
  exit 1
fi
if ! grep -q 'Validación estricta fallida' "$TMP/output"; then
  echo "ERROR: falta diagnóstico de validación incompleta" >&2
  exit 1
fi
echo 'Local DB: omisiones impiden certificar reconstrucción completa'
