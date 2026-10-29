# Point Smart 2 to SII Solutions: trusted handoff

## Verified Point entry points
The Point feature branch `feat/pos-held-sales-point-smart-2` uses
`supabase/functions/mp-point-webhook/index.ts` and
`supabase/functions/mp-point-reconcile/index.ts`.
Both invoke `crm_finalize_point_sale(p_operation_id)` after a server-side
provider order lookup reports `processed`. This is the correct stage to
enqueue a **separate** fiscal job, not to send an external HTTP request
inside the database transaction.

## Required before enabling issuance
1. Inspect the actual result and persisted side effects of
   `crm_finalize_point_sale`: locate `crm_invoice_id`, the associated
   payment, and its provider payment identifier.
2. Independently verify the Point payment on the server and match
   tenant, sale, provider payment ID, amount, currency and final status.
   A `mercado_pago` payment-method label is not proof of payment.
3. Load persisted invoice/items/payments in a trusted worker. Pass only
   verified proof to `normalizeCrmFiscalSale`; do not accept proof
   directly from a browser or webhook payload.
4. Apply and verify the fiscal issuance migration in the intended
   Supabase project, then claim the fiscal operation atomically before
   sending it. Ensure provider operation-ID validation is enabled.
5. Keep issuance disabled until a dedicated provider simulation
   environment is verified. Resolve ambiguous timeouts/409 without
   re-sending an issuance or charging again.
6. Print the provider's validated PDF only when issuance is confirmed.

## Branch integration warning
The fiscal pilot and Point work live on separate branches. Do not copy
the fiscal caller into Point webhook/reconcile independently: both
routes can observe the same order. Use a single idempotent fiscal
outbox/worker keyed by business, invoice and DTE type.

## Current status
This is an integration contract, not an active Point-to-DTE connection.
