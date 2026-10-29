# SII — CAF contention and retry policy (release blocker)

The reservation function uses `FOR UPDATE SKIP LOCKED`. A second sale can receive
`CAF range temporarily locked` (SQLSTATE `PZ101`) while the sole CAF row is locked, even when
folios remain. This is a **transient contention condition**, not proof of exhaustion.

## Mandatory backend behavior (partially implemented, not integrated)

1. Use a **bounded retry** with randomized jitter, e.g. 3 attempts and a
   short increasing delay. Never retry arbitrary database errors.
2. Re-read the sale's existing operation before each retry. The
   `(business_id,sale_id,document_type)` unique key is the idempotency anchor.
3. If the retry budget is exhausted, return a temporary retryable result to
   the POS; **do not record a fiscal rejection, change sale identity or allocate
   a different folio by hand**.
4. Separate three outcomes: CAF exhausted, CAF locked, CAF invalid/expired.
   The SQL now uses `PZ101` for a temporarily locked CAF and `P0001` for
   no active available folios. CAF invalid/expired is **not yet distinguished**.
5. Preserve per-issuer authorization and signature validation. The fixture
   CAF in tests is fake and never suitable for tax issuance.

## Automated tests

- `005_concurrent_reservation_test.sh`: same sale, concurrent sessions,
  must converge on one operation and folio.
- `006_different_sales_caf_contention.sh`: two different sales with one
  CAF range; expects transient lock failure and safe subsequent retry.

The scripts depend on the isolated PostgreSQL smoke test being run first,
and are wired into the GitHub Actions job. **Their passing status has not
been verified**. Neither test substitutes for crash/restart, actual SII
acknowledgment reconciliation, or CAF cryptographic checks.
