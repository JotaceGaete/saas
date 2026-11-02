#!/usr/bin/env bash
# El constructor de base debe fallar ante un error SQL en una migración fiscal propuesta.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/psql" <<'EOF'
#!/usr/bin/env bash
for arg in "$@"; do
  if [[ "$arg" == *20261031_fiscal_single_ledger_guard.sql ]]; then
    echo 'ERROR simulado de migración fiscal' >&2
    exit 1
  fi
done
exit 0
EOF
chmod +x "$TMP/psql"
status=0
(
  cd "$ROOT"
  PATH="$TMP:$PATH" PGHOST=localhost FISCAL_TEST_PG_DB=walinka_test \
    bash supabase/fiscal-recovery/localdb/build.sh
) >"$TMP/output" 2>&1 || status=$?
if [[ "$status" -eq 0 ]]; then
  echo "ERROR: el constructor aceptó una migración fiscal fallida" >&2
  exit 1
fi
if grep -q 'listo: walinka_test' "$TMP/output"; then
  echo "ERROR: el constructor declaró lista una base incompleta" >&2
  exit 1
fi
if ! grep -q '20261031_fiscal_single_ledger_guard' "$TMP/output"; then
  echo "ERROR: no se identificó la migración fallida" >&2
  exit 1
fi
echo 'Local DB: migración fiscal fallida detiene reconstrucción'
