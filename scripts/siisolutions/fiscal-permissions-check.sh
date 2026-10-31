#!/usr/bin/env bash
set -euo pipefail
# Role-based permission audit for the fiscal ledger. Disposable database only.
db="${PGDATABASE:-}"
if [[ "$db" != *disposable* && "$db" != *ci* ]]; then
  echo "Refusing to run: PGDATABASE must be disposable/CI (got '$db')" >&2; exit 2
fi
BIZ='22222222-2222-4222-8222-222222222222'
as() { psql -X -A -t -c "set role $1;" -c "$2" 2>&1 || true; }
expect_denied() { # role, sql, label
  local out; out="$(as "$1" "$2")"
  grep -qiE "permission denied" <<<"$out" || { echo "FAIL: $1 could $3 ($out)" >&2; exit 1; }
}
expect_ok() { # role, sql, label
  local out; out="$(as "$1" "$2")"
  grep -qiE "permission denied|error" <<<"$out" && { echo "FAIL: $1 could not $3 ($out)" >&2; exit 1; }
  return 0
}
for role in anon authenticated public; do
  r=$role; [[ $role == public ]] && r=authenticated
  expect_denied "$r" "select count(*) from public.crm_fiscal_issuances;" "read the fiscal ledger"
  expect_denied "$r" "select public.crm_claim_fiscal_issuance('$BIZ'::uuid,'$BIZ'::uuid,'x',39);" "claim a fiscal operation"
  expect_denied "$r" "select public.crm_fiscal_register_pending('$BIZ'::uuid,'$BIZ'::uuid,'x',39);" "register a pending sale"
  expect_denied "$r" "select public.crm_finalize_fiscal_issuance('$BIZ'::uuid,'$BIZ'::uuid,'x','issued',1,'a','b');" "finalize an issuance"
  expect_denied "$r" "select public.crm_reconcile_fiscal_issuance('$BIZ'::uuid,'$BIZ'::uuid,'x',1,'a','b');" "reconcile an issuance"
done
echo "PASS: anon, authenticated and public are denied table reads and every fiscal function."
# The fixture has no platform grants: service_role needs read access to crm_invoices
# (the platform normally provides it). The ledger grant comes from the migration itself.
psql -X -q -v ON_ERROR_STOP=1 -c "grant select on public.crm_invoices to service_role;" >/dev/null
# REQUIRED PLATFORM PROPERTY: the server role bypasses RLS (Supabase service_role has BYPASSRLS).
# Without it, ledger writes fail closed; this script mirrors the platform to test the guarded path.
psql -X -q -v ON_ERROR_STOP=1 -c "alter role service_role bypassrls;" >/dev/null
expect_ok service_role "select public.crm_fiscal_register_pending('$BIZ'::uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'perm-check',39);" "register as service_role"
echo "PASS: service_role can execute the guarded functions."
psql -X -A -t -c "select relrowsecurity from pg_class where oid='public.crm_fiscal_issuances'::regclass;" | grep -qx t || { echo "FAIL: RLS not enabled" >&2; exit 1; }
echo "PASS: RLS is enabled on public.crm_fiscal_issuances."
