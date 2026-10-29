# SII pilot — evidence of local reproduction (2026-10-28)

## Executed

Node.js v22.16.0, local isolated environment. Copied the GitHub coordinator source into a temporary local module and executed six *reproduced* test scenarios using `node --test`. These are not the exact repository test files, and are **not** a full CI pass.

Command: `node --test verification.test.mjs`

Result: 6 tests passed, 0 failed. Scenarios: normal submission, timeout, SHA-256 mismatch, failed CAS, unknown-state no-resend, signature-validation rejection.

## GitHub status

GitHub commit `b51668d65a0bc62fac188244b1a66719a9905c6f`: workflow runs query returned empty. Combined status exposed only a pending Vercel status. Therefore **no GitHub Actions pass is confirmed**.

## Remaining release blockers

- Execute the exact repository test files in GitHub Actions or a complete checkout.
- Validate workflow registration and CI permissions; do not assume a workflow file in a non-default branch automatically runs.
- Run PostgreSQL concurrent transaction tests with actual locks and two connections.
- Verify official CAF/TED/XMLDSig against authoritative SII fixtures.
- No production deployment, no Mercado Pago changes.
