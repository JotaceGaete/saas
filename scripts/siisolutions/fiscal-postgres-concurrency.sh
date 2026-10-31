#!/usr/bin/env bash
set -euo pipefail

# Execute against the disposable CI PostgreSQL database only.
# Two independent connections attempt the same fiscal claim simultaneously.
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

claim="select public.crm_claim_fiscal_issuance('22222222-2222-4222-8222-222222222222'::uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'parallel-operation',39);"
psql -X -A -t -v ON_ERROR_STOP=1 -c "$claim" >"$tmpdir/first" &
pid1=$!
psql -X -A -t -v ON_ERROR_STOP=1 -c "$claim" >"$tmpdir/second" &
pid2=$!
wait "$pid1"
wait "$pid2"

true_count="$(cat "$tmpdir/first" "$tmpdir/second" | grep -cx 't' || true)"
false_count="$(cat "$tmpdir/first" "$tmpdir/second" | grep -cx 'f' || true)"
if [[ "$true_count" != 1 || "$false_count" != 1 ]]; then
  echo "Expected exactly one successful claim and one rejected duplicate" >&2
  cat "$tmpdir/first" "$tmpdir/second" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -c "
do \$\$
begin
  if (select count(*) from public.crm_fiscal_issuances
      where business_id='22222222-2222-4222-8222-222222222222'
        and sale_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        and operation_id='parallel-operation') <> 1 then
    raise exception 'Concurrent claim created duplicate fiscal rows';
  end if;
end
\$\$;"
echo "Concurrent fiscal claim: exactly one winner, one duplicate blocked."
