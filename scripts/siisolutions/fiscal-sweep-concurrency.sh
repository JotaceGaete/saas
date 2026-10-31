#!/usr/bin/env bash
set -euo pipefail

# Concurrency suite for the fiscal pending queue. Run ONLY against a disposable
# database (name must contain "disposable" or "ci"). Each scenario races real,
# separate psql connections against the same ledger rows.
db="${PGDATABASE:-}"
if [[ "$db" != *disposable* && "$db" != *ci* ]]; then
  echo "Refusing to run: PGDATABASE must be a disposable/CI database (got '$db')" >&2
  exit 2
fi

BIZ='22222222-2222-4222-8222-222222222222'
# Fresh sale ids per run keep the suite re-runnable against the same database.
fresh_id() { q "select gen_random_uuid();"; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
q() { psql -X -A -t -v ON_ERROR_STOP=1 -c "$1"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

new_sale() { q "insert into public.crm_invoices (id, business_id) values ('$1', '$BIZ') on conflict do nothing;" >/dev/null; }
register() { q "select public.crm_fiscal_register_pending('$BIZ'::uuid,'$1'::uuid,'$2',39);"; }
claim()    { q "select public.crm_claim_fiscal_issuance('$BIZ'::uuid,'$1'::uuid,'$2',39);"; }
status()   { q "select status from public.crm_fiscal_issuances where business_id='$BIZ' and sale_id='$1' and dte_type=39;"; }
rows()     { q "select count(*) from public.crm_fiscal_issuances where business_id='$BIZ' and sale_id='$1' and dte_type=39;"; }
race()     { # race N commands in parallel, outputs to $tmp/out.N
  local n=0; for cmd in "$@"; do n=$((n+1)); ( eval "$cmd" > "$tmp/out.$n" ) & done; wait
  cat "$tmp"/out.* 2>/dev/null; rm -f "$tmp"/out.*
}
count_t() { grep -cx 't' || true; }
count_f() { grep -cx 'f' || true; }

# A. Eight parallel registrations of one sale: exactly one row is created.
S=$(fresh_id); new_sale "$S"; op="WLK-$BIZ-$S"
cmds=(); for i in 1 2 3 4 5 6 7 8; do cmds+=("register $S $op"); done
out="$(race "${cmds[@]}")"
[[ "$(printf '%s\n' "$out" | count_t)" == 1 ]] || fail "A: expected exactly one registration winner: $out"
[[ "$(rows "$S")" == 1 ]] || fail "A: duplicate ledger rows"
echo "A ok: 8 parallel registrations -> 1 row"

# B. Pending row, then two parallel claims: exactly one promotes to sending.
S=$(fresh_id); new_sale "$S"; op="WLK-$BIZ-$S"
[[ "$(register "$S" "$op")" == t ]] || fail "B: registration should succeed"
out="$(race "claim $S $op" "claim $S $op")"
[[ "$(printf '%s\n' "$out" | count_t)" == 1 ]] || fail "B: expected one promotion winner: $out"
[[ "$(status "$S")" == sending ]] || fail "B: status should be sending"
echo "B ok: pending promoted exactly once under parallel claims"

# C. Unknown row is never reclaimed, even under parallel attempts.
S=$(fresh_id); new_sale "$S"; op="WLK-$BIZ-$S"
q "insert into public.crm_fiscal_issuances (business_id, sale_id, operation_id, dte_type, status) values ('$BIZ','$S','$op',39,'unknown');" >/dev/null
out="$(race "claim $S $op" "claim $S $op" "claim $S $op")"
[[ "$(printf '%s\n' "$out" | count_t)" == 0 ]] || fail "C: unknown row was reclaimed: $out"
[[ "$(status "$S")" == unknown ]] || fail "C: unknown status must not change"
[[ "$(rows "$S")" == 1 ]] || fail "C: unknown must not create a second row"
echo "C ok: unknown is never re-sent or reclaimed"

# D. Sweep registration racing a webhook claim on a fresh sale: one row, one fiscal operation.
S=$(fresh_id); new_sale "$S"; op="WLK-$BIZ-$S"
race "register $S $op" "claim $S $op" "register $S $op" "claim $S $op" >/dev/null
[[ "$(rows "$S")" == 1 ]] || fail "D: race created duplicate rows"
st="$(status "$S")"; [[ "$st" == sending || "$st" == pending ]] || fail "D: unexpected state $st"
echo "D ok: sweep vs webhook/reconciler race -> one row (state $st)"

# E. Issued and failed rows are never claimed again.
for state in issued failed; do
  S=$(fresh_id); new_sale "$S"; op="WLK-$BIZ-$S"
  q "insert into public.crm_fiscal_issuances (business_id, sale_id, operation_id, dte_type, status) values ('$BIZ','$S','$op',39,'$state');" >/dev/null
  [[ "$(claim "$S" "$op")" == f ]] || fail "E: $state row was claimed"
  [[ "$(status "$S")" == "$state" ]] || fail "E: $state status changed"
done
echo "E ok: issued and failed rows are terminal for the claim"

# F. A pending row cannot be promoted by a different operation identifier.
S=$(fresh_id); new_sale "$S"; op="WLK-$BIZ-$S"
register "$S" "$op" >/dev/null
[[ "$(claim "$S" "other-operation")" == f ]] || fail "F: foreign operation promoted a pending row"
[[ "$(status "$S")" == pending ]] || fail "F: pending row changed"
echo "F ok: operation identity is enforced on promotion"

echo "Fiscal sweep concurrency suite: all scenarios passed on $db."
