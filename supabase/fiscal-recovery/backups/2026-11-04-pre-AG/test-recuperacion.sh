#!/bin/bash
# Prueba LOCAL del procedimiento de recuperación (nunca producción).
# Uso: PGHOST=/ruta/al/socket PGPORT=5544 bash supabase/fiscal-recovery/backups/2026-11-04-pre-AG/test-recuperacion.sh
# Construye el estado previo a A, aplica A–G y revierte cada una comparando la huella del catálogo.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
SP=$(mktemp -d)   # archivos de trabajo temporales
cd "$HERE/../../../.."
: "${PGHOST:?PGHOST debe apuntar a una base LOCAL (socket o localhost)}"
export PGPORT=${PGPORT:-5432}
case "$PGHOST" in /*|localhost|127.0.0.1) ;; *) echo "solo base local"; exit 1;; esac
P="psql -U postgres -q -v ON_ERROR_STOP=1"; DB=walinka_rb_test
PR=supabase/fiscal-recovery/proposed
fp() { $P -d $DB -At -f $HERE/fingerprint.sql > $SP/fp-$1.txt; }
$P -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
$P -d $DB -f supabase/fiscal-recovery/localdb/00_supabase_stub.sql >/dev/null 2>&1
for f in supabase/migrations/*.sql supabase/fiscal-recovery/migrations/*.sql; do $P -d $DB -1 -f "$f" >/dev/null 2>&1 || true; done
$P -d $DB -f $PR/20261031_p0_fiscal_admin_tables.sql >/dev/null 2>&1
$P -d $DB -f supabase/fiscal-recovery/localdb/90_service_role_grants.sql >/dev/null 2>&1
python3 -I - "$HERE/01-respaldo-estructura-pre-AG.sql" > $SP/prod4.sql <<'PY'
import re, sys
s = open(sys.argv[1]).read()
for m in re.finditer(r'(CREATE OR REPLACE FUNCTION .*?\$function\$;)', s, re.S): print(m.group(1))
PY
$P -d $DB -f $SP/prod4.sql >/dev/null
fp preA
order="20261031_fiscal_single_ledger_guard:A 20261101_fiscal_connection:B 20261102_fiscal_provider_claim_guard:C 20261031_issuer_sucursal_config:D 20261102_fiscal_sii_status:E 20261104_fiscal_onboarding_review:F 20261104_fiscal_product_tax_category:G"
prev=preA
for pair in $order; do f=${pair%%:*}; k=${pair##*:}
  $P -d $DB -1 -f $PR/$f.sql >/dev/null 2>$SP/err-$k.txt || { echo "FALLA al aplicar $k"; cat $SP/err-$k.txt | grep -v NOTICE | head; }
  fp post$k
done
# Extrae y ejecuta una sección del script de recuperación
section() { awk -v k="Revertir $1 " 'index($0,k){p=1} p&&/^-- =+ Revertir/&&!index($0,k){p=0} p' $HERE/02-recuperacion-A-G.sql; }
for k in G F E D C B A; do
  section $k > $SP/sec-$k.sql
  $P -d $DB -f $SP/sec-$k.sql >/dev/null 2>$SP/rb-$k.txt || { echo "FALLA al revertir $k"; grep -v NOTICE $SP/rb-$k.txt | head -5; }
  case $k in G) target=postF;; F) target=postE;; E) target=postD;; D) target=postC;; C) target=postB;; B) target=postA;; A) target=preA;; esac
  fp rb$k
  if diff -q $SP/fp-$target.txt $SP/fp-rb$k.txt >/dev/null; then echo "revertir $k -> idéntico al estado previo ($target)"; else echo "revertir $k -> DIFERENCIAS con $target:"; diff $SP/fp-$target.txt $SP/fp-rb$k.txt | head -12; fi
done
$P -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
rm -rf "$SP"
