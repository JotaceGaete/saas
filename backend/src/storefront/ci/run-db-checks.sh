#!/usr/bin/env bash
# Verificación de las migraciones Storefront sobre PostgreSQL (CI o local).
#  1. Base de referencia con esquema mínimo tipo producción y datos de paridad.
#  2. 0001 y 0002 aplicables por separado.
#  3. 0001 + 0002 en ambos órdenes producen el mismo esquema.
#  4. Aserciones de unaccent, collation, permisos y RLS.
#  5. Rollback de 0001: negado con datos, luego ejecutado; el esquema vuelve al base
#     y 0001 puede volver a aplicarse.
# Variables: PGHOST PGPORT PGUSER PGPASSWORD. Crea bases walinka_ci_* (no toca otras).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../migrations"
REV="$HERE/../review"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
db_drop() { q -d postgres -c "drop database if exists $1 with (force)"; }
db_from_base() { db_drop "$1"; q -d postgres -c "create database $1 template walinka_ci_base"; }
snap() { psql -X -At -v ON_ERROR_STOP=1 -d "$1" -f "$HERE/snapshot.sql"; }

echo "== base"
db_drop walinka_ci_base
q -d postgres -c "create database walinka_ci_base"
q -d walinka_ci_base -f "$HERE/schema.sql"
PGDATABASE=walinka_ci_base node "$HERE/seed.mjs"
snap walinka_ci_base > "$TMP/base.snap"

echo "== independencia"
db_from_base walinka_ci_solo_0001
q -d walinka_ci_solo_0001 -f "$MIG/0001_storefront_read_model.sql"
echo "0001 aplica sin 0002: OK"
db_from_base walinka_ci_solo_0002
q -d walinka_ci_solo_0002 -f "$MIG/0002_storefront_editorial_draft.sql"
echo "0002 aplica sin 0001: OK"

echo "== orden de aplicación"
db_from_base walinka_ci_order_a
q -d walinka_ci_order_a -f "$MIG/0001_storefront_read_model.sql"
q -d walinka_ci_order_a -f "$MIG/0002_storefront_editorial_draft.sql"
db_from_base walinka_ci_order_b
q -d walinka_ci_order_b -f "$MIG/0002_storefront_editorial_draft.sql"
q -d walinka_ci_order_b -f "$MIG/0001_storefront_read_model.sql"
snap walinka_ci_order_a > "$TMP/order_a.snap"
snap walinka_ci_order_b > "$TMP/order_b.snap"
diff -u "$TMP/order_a.snap" "$TMP/order_b.snap" || { echo "FALLO: el esquema depende del orden"; exit 1; }
echo "0001→0002 y 0002→0001 producen el mismo esquema: OK"

echo "== aserciones (unaccent, collation, permisos, RLS)"
q -d walinka_ci_order_a -f "$HERE/assertions.sql"

echo "== rollback de 0001"
db_from_base walinka_ci_rb
q -d walinka_ci_rb -f "$MIG/0001_storefront_read_model.sql"
q -d walinka_ci_rb -c "insert into public.wa_storefront_banners (business_id, placement, desktop_image_url, alt_text, status)
  select id, 'home_hero', 'https://ejemplo.test/a.png', 'banner de prueba', 'active' from public.wa_businesses limit 1"
if psql -X -q -v ON_ERROR_STOP=1 -d walinka_ci_rb -f "$REV/0001_rollback.sql" >/dev/null 2>"$TMP/err"; then
  echo "FALLO: el rollback se ejecutó con banners sin confirmación"; exit 1
fi
grep -q "tiene 1 filas" "$TMP/err" || { cat "$TMP/err"; echo "FALLO: mensaje de salvaguarda inesperado"; exit 1; }
echo "salvaguarda: rollback negado con 1 banner: OK"

{ echo "set walinka.allow_banner_data_loss = 'on';"; cat "$REV/0001_rollback.sql"; } > "$TMP/rollback_confirmado.sql"
q -d walinka_ci_rb -f "$TMP/rollback_confirmado.sql"
snap walinka_ci_rb > "$TMP/rb.snap"
diff -u "$TMP/base.snap" "$TMP/rb.snap" || { echo "FALLO: el rollback no restaura el esquema base"; exit 1; }
echo "rollback con confirmación restaura el esquema base: OK (pérdida: 1 banner de prueba)"

q -d walinka_ci_rb -f "$MIG/0001_storefront_read_model.sql"
snap walinka_ci_rb > "$TMP/rb2.snap"
snap walinka_ci_solo_0001 > "$TMP/solo1.snap"
diff -u "$TMP/solo1.snap" "$TMP/rb2.snap" || { echo "FALLO: reaplicar 0001 tras rollback difiere"; exit 1; }
echo "0001 reaplicable tras rollback: OK"

echo "== verificaciones de base terminadas"
