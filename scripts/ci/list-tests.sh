#!/usr/bin/env bash
# Listas de archivos de prueba para la CI (sin red ni base real):
#   node-test  archivos node:test, sin los que necesitan PostgreSQL/PostgREST (test/db, contract)
#   vitest-excludes  argumentos --exclude para que Vitest no recoja node:test ni Deno
set -euo pipefail
node_test_files() {
  grep -rlE "from ['\"]node:test['\"]" --include='*.test.*' api src supabase scripts 2>/dev/null | grep -v node_modules | sort
}
case "${1:-}" in
  node-test) node_test_files | grep -vE '/test/db/|/contract/' ;;
  vitest-excludes)
    node_test_files | sed 's/^/--exclude /'
    echo '--exclude **/test/deno/**' ;;
  *) echo "uso: $0 node-test|vitest-excludes" >&2; exit 2 ;;
esac
