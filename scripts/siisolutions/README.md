# SII Solutions — Walinka pilot (not production)

Provider endpoint: `POST https://api.siisolutions.cl/dte/boletas/emitir`.

This is an isolated server-side adapter, **not yet connected to the TPV**, and
does not create fiscal documents in production. Run offline tests:

```bash
node --test scripts/siisolutions/adapter.test.mjs
```

## Safety and next steps

- Only use a dedicated **simulation account**. The environment is selected in
  the provider's portal; the endpoint itself does not guarantee simulation.
- The adapter additionally requires `SIISOLUTIONS_EMISSION_ENABLED=simulation`
  and requires a separate HTTPS sandbox host. The adapter does **not** verify
  `esSimulacion` in provider responses; sandbox authorization must be confirmed
  independently before any request. Never point this pilot at production.
- API keys must stay on the server; never put them in Vite `VITE_*` variables.
- Provider documentation states `folio` is optional on requests, gross boleta
  prices are used, and `medioPago` accepts EF/PE/TF/CQ/OT. The `409 Conflict`
  duplicate-operation safeguard requires the provider's operation-ID validation
  option to be enabled. Verify that configuration for each issuer before use.
- A `409` with `folioExistente` is **not** proof that the original XML/PDF was
  recovered: keep the issuance `unknown` until an authorized reconciliation.
- Implement authenticated tenant-to-credential lookup (ARTEMA / ARTES), persistent
  per-sale issuance state, a unique issuance lock and recovery of ambiguous timeouts
  **before** wiring the payment-approved callback.
- Only after that, connect Mercado Pago Point confirmation to issuance and PDF
  printing, and test with simulation. Never re-charge a paid sale on DTE failure.
- No certificate, CAF, private key or real taxpayer data belongs in Git.
