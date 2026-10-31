#!/usr/bin/env bash
set -euo pipefail

# Tests for the single-use manual emission authorization and folio-preserving
# finalize. Run ONLY against a disposable database (name must contain
# "disposable" or "ci"). Migrations are read from the repository; no production
# object is touched.
db="${PGDATABASE:-}"
if [[ "$db" != *disposable* && "$db" != *ci* ]]; then
  echo "Refusing to run: PGDATABASE must be a disposable/CI database (got '$db')" >&2
  exit 2
fi
root="$(cd "$(dirname "$0")/../.." && pwd)"
q()  { psql -X -A -t -v ON_ERROR_STOP=1 -c "$1"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
expect_error() { # expect_error <label> <sql> <pattern>
  local out; out=$(psql -X -A -t -c "$2" 2>&1 || true)
  grep -qE "$3" <<<"$out" || fail "$1 (got: $out)"; echo "ok - $1"
}

# Minimal fixture: only the objects these migrations depend on.
psql -X -q -v ON_ERROR_STOP=1 -d "$db" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
drop table if exists public.manual_fiscal_authorizations, public.crm_fiscal_issuances, public.crm_invoices, public.wa_businesses cascade;
create table public.wa_businesses (id uuid primary key, user_id uuid, country_code text, currency text);
create table public.crm_invoices (id uuid not null, business_id uuid not null references public.wa_businesses(id),
  status text not null, paid_at timestamptz, total numeric not null);
SQL

# Real repository migrations (provider ledger + new authorization).
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$root/supabase/migrations/20261029110000_sii_issuance_pilot.sql"
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$root/supabase/migrations/20261031140000_manual_single_emission_authorization.sql"
echo "ok - repository migrations apply cleanly on the disposable database"

B='11111111-1111-4111-8111-111111111111'
S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
A='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
OP="WLK-$B-$S"
q "insert into public.wa_businesses values ('$B','22222222-2222-4222-8222-222222222222','CL','CLP') on conflict do nothing;" >/dev/null
q "insert into public.crm_invoices values ('$S','$B','pagada', now(), 100);" >/dev/null
q "insert into public.manual_fiscal_authorizations (id,business_id,sale_id,amount,expires_at,created_by) values ('$A','$B','$S',100, now()+interval '1 hour','test');" >/dev/null
echo "ok - fixture ready"

begin_call() { q "select public.crm_begin_manual_single_emission('$1'::uuid,'$B'::uuid,'$S'::uuid,$2::numeric,'$3');"; }

# Expired and mismatched authorizations must roll back: nothing claimed, nothing consumed.
# created_at moves back too: expiry must stay after creation (table constraint).
q "update public.manual_fiscal_authorizations set created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute' where id='$A';" >/dev/null
expect_error "expired authorization is rejected" "select public.crm_begin_manual_single_emission('$A'::uuid,'$B'::uuid,'$S'::uuid,100,'$OP');" "expired"
[[ "$(q "select count(*) from public.crm_fiscal_issuances where sale_id='$S';" | tr -d ' ')" == 0 ]] || fail "expired attempt left a ledger row"
q "update public.manual_fiscal_authorizations set created_at = now(), expires_at = now() + interval '1 hour' where id='$A';" >/dev/null

expect_error "amount mismatch is rejected" "select public.crm_begin_manual_single_emission('$A'::uuid,'$B'::uuid,'$S'::uuid,99,'$OP');" "amount mismatch"
[[ "$(q "select consumed_at is null from public.manual_fiscal_authorizations where id='$A';" | tr -d ' ')" == t ]] || fail "mismatch consumed the authorization"
echo "ok - mismatch leaves authorization unconsumed"

expect_error "authorization for another business is not found" "select public.crm_begin_manual_single_emission('$A'::uuid,'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'$S'::uuid,100,'$OP');" "Authorization not found"

# Pre-existing ledger row for the sale: claim fails, authorization must NOT be consumed.
q "insert into public.crm_fiscal_issuances (business_id, sale_id, operation_id, dte_type, status) values ('$B','$S','WLK-prior',39,'unknown');" >/dev/null
expect_error "existing fiscal operation blocks the claim" "select public.crm_begin_manual_single_emission('$A'::uuid,'$B'::uuid,'$S'::uuid,100,'$OP');" "Unresolved fiscal operation|already exists"
[[ "$(q "select consumed_at is null from public.manual_fiscal_authorizations where id='$A';" | tr -d ' ')" == t ]] || fail "failed claim consumed the authorization"
echo "ok - failed claim rolls back authorization consumption"
q "delete from public.crm_fiscal_issuances where sale_id='$S';" >/dev/null

# Happy path, exactly once.
[[ "$(begin_call "$A" 100 "$OP" | tr -d ' ')" == t ]] || fail "valid begin did not return true"
[[ "$(q "select status from public.crm_fiscal_issuances where sale_id='$S';" | tr -d ' ')" == sending ]] || fail "claim not in sending"
expect_error "second begin on the same authorization is refused" "select public.crm_begin_manual_single_emission('$A'::uuid,'$B'::uuid,'$S'::uuid,100,'$OP-2');" "already consumed|Unresolved fiscal operation"
echo "ok - single use enforced"

# Resolve the first emission (a test fixture step, not a production action) so the
# business is clear, then race two begins on the SAME business with different sales.
q "update public.crm_fiscal_issuances set status='failed', error_code='FIXTURE' where sale_id='$S';" >/dev/null
S2='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; A2='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
S4='dddddddd-dddd-4ddd-8ddd-ddddddddddd4'; A4='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4'
q "insert into public.crm_invoices values ('$S2','$B','pagada', now(), 100);" >/dev/null
q "insert into public.crm_invoices values ('$S4','$B','pagada', now(), 100);" >/dev/null
q "insert into public.manual_fiscal_authorizations (id,business_id,sale_id,amount,expires_at,created_by) values ('$A2','$B','$S2',100, now()+interval '1 hour','test');" >/dev/null
q "insert into public.manual_fiscal_authorizations (id,business_id,sale_id,amount,expires_at,created_by) values ('$A4','$B','$S4',100, now()+interval '1 hour','test');" >/dev/null
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
( psql -X -A -t -c "select public.crm_begin_manual_single_emission('$A2'::uuid,'$B'::uuid,'$S2'::uuid,100,'WLK-race-1');" > "$tmp/out.1" 2>&1 || true ) &
( psql -X -A -t -c "select public.crm_begin_manual_single_emission('$A4'::uuid,'$B'::uuid,'$S4'::uuid,100,'WLK-race-2');" > "$tmp/out.2" 2>&1 || true ) &
wait
wins=$(cat "$tmp"/out.* | grep -cx 't' || true)
[[ "$wins" == 1 ]] || fail "same-business race produced $wins winners (expected exactly 1)"
winner_sale=$(q "select sale_id from public.crm_fiscal_issuances where business_id='$B' and sale_id in ('$S2','$S4') and status='sending';" | tr -d ' ')
[[ -n "$winner_sale" ]] || fail "race left no sending row"
[[ "$(q "select count(*) from public.crm_fiscal_issuances where business_id='$B' and sale_id in ('$S2','$S4');" | tr -d ' ')" == 1 ]] || fail "race left more than one ledger row"
W=$(q "select operation_id from public.crm_fiscal_issuances where sale_id='$winner_sale';" | tr -d ' ')
echo "ok - same-business racing begins: exactly one winner and one ledger row"

# Unknown keeps the folio (on the winning operation); issued requires XML and PDF.
q "select public.crm_finalize_fiscal_issuance('$B'::uuid,'$winner_sale'::uuid,'$W','unknown',51105,null,null);" >/dev/null
[[ "$(q "select folio from public.crm_fiscal_issuances where sale_id='$winner_sale';" | tr -d ' ')" == 51105 ]] || fail "unknown dropped the folio"
[[ "$(q "select status from public.crm_fiscal_issuances where sale_id='$winner_sale';" | tr -d ' ')" == unknown ]] || fail "status not unknown"
echo "ok - unknown keeps the folio"
expect_error "issued without XML/PDF is rejected" "select public.crm_finalize_fiscal_issuance('$B'::uuid,'$winner_sale'::uuid,'$W','issued',51106,null,null);" "requires folio, XML and PDF"
expect_error "non-positive folio is rejected" "select public.crm_finalize_fiscal_issuance('$B'::uuid,'$winner_sale'::uuid,'$W','unknown',0,null,null);" "Invalid fiscal folio"
[[ "$(q "select public.crm_finalize_fiscal_issuance('$B'::uuid,'$winner_sale'::uuid,'$W','issued',51105,'PHhtbA==','JVBERg==');" | tr -d ' ')" == f ]] || fail "finalize repeated on a non-sending row must return false"
echo "ok - finalize is one-shot"

# Privileges: no public or authenticated access to the authorization table or RPC.
out=$(psql -X -A -t -c "set role authenticated; select count(*) from public.manual_fiscal_authorizations;" 2>&1 || true)
grep -q "permission denied" <<<"$out" || fail "authenticated can read authorizations ($out)"
out=$(psql -X -A -t -c "set role anon; select public.crm_begin_manual_single_emission('$A'::uuid,'$B'::uuid,'$S'::uuid,100,'x');" 2>&1 || true)
grep -q "permission denied" <<<"$out" || fail "anon can execute begin ($out)"
echo "ok - anon and authenticated are denied"

# DB-level sequencing: a different sale of the same business is refused while
# another fiscal operation is still in flight (not only the runner pre-check).
S3='99999999-9999-4999-8999-999999999999'; A3='88888888-8888-4888-8888-888888888888'
q "insert into public.crm_invoices values ('$S3','$B','pagada', now(), 100);" >/dev/null
q "insert into public.manual_fiscal_authorizations (id,business_id,sale_id,amount,expires_at,created_by) values ('$A3','$B','$S3',100, now()+interval '1 hour','test');" >/dev/null
q "update public.crm_fiscal_issuances set status='unknown' where sale_id='$winner_sale';" >/dev/null
expect_error "unresolved operation of the business blocks a new emission at DB level" "select public.crm_begin_manual_single_emission('$A3'::uuid,'$B'::uuid,'$S3'::uuid,100,'WLK-seq');" "Unresolved fiscal operation"
[[ "$(q "select consumed_at is null from public.manual_fiscal_authorizations where id='$A3';" | tr -d ' ')" == t ]] || fail "blocked emission consumed authorization"
q "update public.crm_fiscal_issuances set status='issued', folio=51200, xml_base64='x', pdf_base64='y' where sale_id='$winner_sale';" >/dev/null
[[ "$(q "select public.crm_begin_manual_single_emission('$A3'::uuid,'$B'::uuid,'$S3'::uuid,100,'WLK-seq-2');" | tr -d ' ')" == t ]] || fail "sequencing blocked a resolved business"
echo "ok - sequencing resolves: next emission allowed once the prior operation is resolved"

# Test-sale marker: additive, idempotent, no update/delete, sale record untouched.
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$root/supabase/migrations/20261031150000_fiscal_test_sale_marks.sql"
M='ffffffff-ffff-4fff-8fff-ffffffffffff'
q "insert into public.crm_invoices values ('$M','$B','pagada', now(), 100);" >/dev/null
q "insert into public.fiscal_test_sales (business_id, sale_id) values ('$B','$M');" >/dev/null
q "insert into public.fiscal_test_sales (business_id, sale_id) values ('$B','$M') on conflict (sale_id) do nothing;" >/dev/null
[[ "$(q "select count(*) from public.fiscal_test_sales where sale_id='$M';" | tr -d ' ')" == 1 ]] || fail "marker not idempotent"
out=$(psql -X -A -t -c "set role service_role; delete from public.fiscal_test_sales where sale_id='$M';" 2>&1 || true)
grep -q "permission denied" <<<"$out" || fail "service_role can delete test markers ($out)"
out=$(psql -X -A -t -c "set role service_role; update public.fiscal_test_sales set reason='PRUEBA_TECNICA_SII' where sale_id='$M';" 2>&1 || true)
grep -q "permission denied" <<<"$out" || fail "service_role can update test markers ($out)"
[[ "$(q "select count(*) from public.crm_invoices where id='$M';" | tr -d ' ')" == 1 ]] || fail "marking altered the sale record"
echo "ok - test-sale marker is additive: idempotent, no update/delete, sale record intact"
echo "ALL DISPOSABLE CHECKS PASSED"
