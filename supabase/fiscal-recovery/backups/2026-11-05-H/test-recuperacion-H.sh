#!/bin/bash
# Prueba LOCAL de H (nunca producción): construye el estado posterior a G, corre el prechequeo,
# aplica H, corre la verificación posterior, comprueba que la recuperación se niega si hay
# evidencia, revierte H y compara la huella del catálogo con la previa a H.
#   PGHOST=/home/pgtest/pg/sock PGPORT=5544 bash supabase/fiscal-recovery/backups/2026-11-05-H/test-recuperacion-H.sh
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
SP=$(mktemp -d)
cd "$HERE/../../../.."
: "${PGHOST:?PGHOST debe apuntar a una base LOCAL (socket o localhost)}"
case "$PGHOST" in /*|localhost|127.0.0.1) ;; *) echo "solo base local"; exit 1;; esac
P="psql -U postgres -q -v ON_ERROR_STOP=1"; DB=walinka_h_rb_test
PR=supabase/fiscal-recovery/proposed
FP=supabase/fiscal-recovery/backups/2026-11-04-pre-AG/fingerprint.sql
fails=0
$P -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
$P -d $DB -f supabase/fiscal-recovery/localdb/00_supabase_stub.sql >/dev/null 2>&1
for f in supabase/migrations/*.sql supabase/fiscal-recovery/migrations/*.sql; do $P -d $DB -1 -f "$f" >/dev/null 2>&1 || true; done
$P -d $DB -f supabase/fiscal-recovery/localdb/80_permisos_produccion.sql >/dev/null 2>&1
for f in 20261031_p0_fiscal_admin_tables 20261031_fiscal_single_ledger_guard 20261101_fiscal_connection \
         20261102_fiscal_provider_claim_guard 20261031_issuer_sucursal_config 20261102_fiscal_sii_status \
         20261104_fiscal_onboarding_review 20261104_fiscal_product_tax_category; do
  $P -d $DB -f $PR/$f.sql >/dev/null 2>&1 || { echo "FALLA al aplicar $f"; fails=$((fails+1)); }
done
$P -d $DB -f supabase/fiscal-recovery/localdb/90_service_role_grants.sql >/dev/null 2>&1
# Un emisor con un documento emitido (como producción: 1 issued) para probar el relleno.
$P -d $DB >/dev/null 2>&1 <<'SQL'
insert into auth.users (id, email) values ('c0000000-0000-4000-8000-00000000000c', 'h@test.local');
insert into public.wa_businesses (id, user_id, name, whatsapp, country_code, currency)
  values ('cccccccc-0000-4000-8000-0000000000cc', 'c0000000-0000-4000-8000-00000000000c', 'C', '+56933333333', 'CL', 'CLP');
insert into fiscal.issuers (business_id, issuer_rut, provider) values ('cccccccc-0000-4000-8000-0000000000cc', '76123456-0', 'sii_solutions');
insert into public.crm_invoices (id, business_id, invoice_number, status, paid_at, total, subtotal, discount_amount)
  values ('5c000000-0000-4000-8000-0000000000c1', 'cccccccc-0000-4000-8000-0000000000cc', 1, 'pagada', now(), 1190, 1190, 0);
insert into public.crm_fiscal_issuances (business_id, sale_id, operation_id, status, provider, folio, xml_base64, pdf_base64)
  values ('cccccccc-0000-4000-8000-0000000000cc', '5c000000-0000-4000-8000-0000000000c1', 'op-h', 'issued', 'siisolutions', 51106,
          encode(convert_to('<DTE><RUTEmisor>76123456-0</RUTEmisor></DTE>', 'LATIN1'), 'base64'), 'JVBERi0xLjQK');
SQL
echo "-- prechequeo (solo lectura)"; $P -d $DB -At -F ' | ' -f "$HERE/00-precheck-H.sql"
$P -d $DB -At -f $FP > $SP/fp-preH.txt
# Datos que H no puede resolver sola (RUT repetido entre comercios): H aborta entera, sin cambios.
$P -d $DB >/dev/null 2>&1 <<'SQL'
insert into public.wa_businesses (id, user_id, name, whatsapp, country_code, currency)
  values ('dddddddd-0000-4000-8000-0000000000dd', 'c0000000-0000-4000-8000-00000000000c', 'D', '+56944444444', 'CL', 'CLP');
insert into fiscal.issuers (business_id, issuer_rut, provider) values ('dddddddd-0000-4000-8000-0000000000dd', '76123456-0', 'dtecore');
SQL
$P -d $DB -At -f $FP > $SP/fp-dup.txt
if $P -d $DB -f $PR/20261105_fiscal_identity_integrity.sql >/dev/null 2>$SP/err-dup.txt; then echo "FALLA: H se aplicó con un RUT repetido"; fails=$((fails+1));
else grep -o 'H_PRECHECK[^.]*' $SP/err-dup.txt | head -1; fi
$P -d $DB -At -f $FP > $SP/fp-dup2.txt
diff -q $SP/fp-dup.txt $SP/fp-dup2.txt >/dev/null && echo "H abortó sin cambios en el catálogo" || { echo "FALLA: H dejó cambios al abortar"; fails=$((fails+1)); }
$P -d $DB -c "delete from fiscal.issuers where business_id = 'dddddddd-0000-4000-8000-0000000000dd'" >/dev/null
if $P -d $DB -f $PR/20261105_fiscal_identity_integrity.sql >/dev/null 2>$SP/err-H.txt; then echo "H aplicada"; else echo "FALLA al aplicar H"; grep -v NOTICE $SP/err-H.txt | head; fails=$((fails+1)); fi
echo "-- verificación posterior"
$P -d $DB -At -F ' | ' -f "$HERE/03-verificacion-post-H.sql" | tee $SP/post.txt
grep -q '| f$' $SP/post.txt && { echo "FALLA: verificación posterior"; fails=$((fails+1)); }
# La recuperación se niega si hay evidencia (y no cambia nada).
$P -d $DB -c "insert into fiscal.rut_confirmations (business_id, provider, key_version, credential_fp, confirmed_rut, actor_user_id)
              values ('cccccccc-0000-4000-8000-0000000000cc', 'dtecore', 1, repeat('a', 64), '76123456-0', 'c0000000-0000-4000-8000-00000000000c')" >/dev/null
$P -d $DB -At -f $FP > $SP/fp-postH.txt
if $P -d $DB -f "$HERE/02-recuperacion-H.sql" >/dev/null 2>$SP/rb1.txt; then echo "FALLA: la recuperación no se negó con evidencia"; fails=$((fails+1)); else grep -o 'RECUPERACION_H[^.]*' $SP/rb1.txt | head -1; fi
$P -d $DB -At -f $FP > $SP/fp-postH2.txt
diff -q $SP/fp-postH.txt $SP/fp-postH2.txt >/dev/null && echo "negativa sin cambios en el catálogo" || { echo "FALLA: la negativa cambió el catálogo"; fails=$((fails+1)); }
# Sin evidencia: revierte y queda igual que antes de H.
$P -d $DB -c "set session_replication_role = replica; delete from fiscal.rut_confirmations" >/dev/null
if $P -d $DB -f "$HERE/02-recuperacion-H.sql" >/dev/null 2>$SP/rb2.txt; then echo "recuperación aplicada"; else echo "FALLA al revertir H"; grep -v NOTICE $SP/rb2.txt | head; fails=$((fails+1)); fi
$P -d $DB -At -f $FP > $SP/fp-rbH.txt
if diff -q $SP/fp-preH.txt $SP/fp-rbH.txt >/dev/null; then echo "revertir H -> idéntico al estado previo a H"; else echo "revertir H -> DIFERENCIAS:"; diff $SP/fp-preH.txt $SP/fp-rbH.txt | head -20; fails=$((fails+1)); fi
# H se puede volver a aplicar después de revertir.
$P -d $DB -f $PR/20261105_fiscal_identity_integrity.sql >/dev/null 2>&1 && echo "H se vuelve a aplicar tras revertir" || { echo "FALLA al reaplicar H"; fails=$((fails+1)); }
$P -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
rm -rf "$SP"
echo "fallas: $fails"; exit $fails
