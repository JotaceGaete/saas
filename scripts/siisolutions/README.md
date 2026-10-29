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
  and rejects responses without `esSimulacion: true`. A request might already
  have emitted before this response check; do **not** point it at production.
- API keys must stay on the server; never put them in Vite `VITE_*` variables.
- Verify whether `folio` is optional, whether gross boleta prices are expected,
  what `medioPago` codes are valid, and whether `idBoletaOperacion` enforces
  idempotency. The sample docs are not sufficient to guarantee these behaviors.
- Implement authenticated tenant-to-credential lookup (ARTEMA / ARTES), persistent
  per-sale issuance state, a unique issuance lock and recovery of ambiguous timeouts
  **before** wiring the payment-approved callback.
- Only after that, connect Mercado Pago Point confirmation to issuance and PDF
  printing, and test with simulation. Never re-charge a paid sale on DTE failure.
- No certificate, CAF, private key or real taxpayer data belongs in Git.
