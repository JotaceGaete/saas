# Product Editor browser validation

Real Chromium validation for Product Editor drafts. The harness mounts the
production `ProductEditor` component and replaces authentication, Supabase,
media uploads and product services with browser-local deterministic doubles.
It never contacts a remote Supabase project or media backend.

## Run from a clean checkout

Install project dependencies and Playwright Chromium once:

```powershell
npm install
npx playwright install chromium
```

Start the isolated Vite harness from the repository root:

```powershell
npx vite --config e2e/product-editor-browser/vite.config.mjs
```

In a second terminal, run all browser scenarios:

```powershell
node e2e/product-editor-browser/run-browser-validation.mjs
```

An optional case-insensitive name fragment runs a single scenario:

```powershell
node e2e/product-editor-browser/run-browser-validation.mjs refresh
```

Screenshots and `results.json` are written to `artifacts/`, which is ignored
by Git. The fixed local harness URL is `http://127.0.0.1:4179`.
