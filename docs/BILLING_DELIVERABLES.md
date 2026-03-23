# Entregables: Reestructuración de pagos Ventalink

> **2026-03:** Lemon Squeezy retirado. Fuera de Chile: proveedor `manual` + WhatsApp (`VITE_PLANS_SUPPORT_WHATSAPP`). Las filas históricas de Lemon abajo quedan como referencia de auditoría.

## 1. Archivos auditados y rol

| Archivo | Rol |
|---------|-----|
| `src/config/country.js` | getCountryCode() por hostname. Usado por billing como input. |
| `src/config/paymentProvider.js` | Regla CL→mercado_pago, resto→`manual`. Lógica alineada con `src/lib/billing`. |
| `src/constants/plans.js` | PLAN_SLUGS, labels, límites, orden. Precios legacy (getPlanPriceByCountry) — la UI de planes usa `lib/billing` para precios. |
| `src/lib/billing/*` | **Fuente oficial**: región, proveedor, moneda, precios display. |
| `src/pages/plans/index.jsx` | Tarjetas y resumen; usa solo `resolveBillingContext` y `getPlanDisplayPrice`. Envía `provider` al preview. |
| `src/pages/legal/PublicPricingPage.jsx` | Precios públicos; usa `lib/billing`. |
| `supabase/functions/plan-change-preview/index.ts` | Preview: INT → 6/10 USD estático; CL → prorrateo CLP (5990/9990). |
| ~~`create-lemonsqueezy-checkout`~~ | **Eliminado** (marzo 2026). |
| ~~`lemonsqueezy-webhook`~~ | **Eliminado** (marzo 2026). |
| `supabase/functions/create-mp-preference/index.ts` | Preferencia Mercado Pago (Chile). |
| `supabase/functions/mp-webhook/index.ts` | Webhook Mercado Pago. |

Archivos que **sobran** del flujo activo: `create-paddle-checkout`, `paddle-webhook`, `create-dlocal-checkout`, `dlocal-webhook` (no desplegados en config; stubs si existen).

---

## 2. Archivos modificados / creados

- **Creados:** `src/lib/billing/constants.js`, `region.js`, `prices.js`, `resolve.js`, `index.js`; `docs/BILLING_AUDIT.md`, `docs/BILLING_DELIVERABLES.md`.
- **Refactorizados:** `src/pages/plans/index.jsx` (billing + envío de `provider` + resumen con precios billing para Lemon), `src/pages/legal/PublicPricingPage.jsx` (billing).
- **Ajustados:** `supabase/functions/plan-change-preview/index.ts` (PLAN_CATALOG_CL business 9990), `supabase/functions/create-mp-preference/index.ts` (9990), `create-lemonsqueezy-checkout/index.ts` (VARIANT_FULL_ID), `lemonsqueezy-webhook/index.ts` (VARIANT_FULL_ID).

---

## 3. Código final relevante

### Capa billing (`src/lib/billing/`)

- **constants.js:** `BILLING_REGION_CL`, `BILLING_REGION_INT`, `PLAN_PRICES_BY_REGION` (CL: 5990/9990, INT: 6/10), `CURRENCY_BY_REGION`, `PROVIDER_BY_REGION`.
- **region.js:** `getBillingRegion(countryCode)`, `isChile(countryCode)`, `getPaymentProvider(countryCode)`, `getCurrency(countryCode)`.
- **prices.js:** `getPlanDisplayPrice(planSlug, region)`, `getPlanDisplayPriceByCountry(planSlug, countryCode)`.
- **resolve.js:** `resolveBillingContext({ hostnameCountryCode, businessCountryCode, userCountryCode })` → `{ countryCode, region, provider, currency }`. Prioridad: hostname CL/AR, luego business, luego user, fallback CL.

### Pantalla /planes

- Obtiene contexto con `resolveBillingContext(hostname, business?.countryCode, user metadata)`.
- Precios en tarjetas: `getPlanDisplayPrice(slug, region)`.
- Siempre envía `provider: paymentProvider` en el body de `plan-change-preview`.
- Resumen: para Lemon usa `getPlanDisplayPrice(preview.targetPlanSlug, region)` para "Precio del plan" y "Total a pagar"; para Mercado Pago usa `preview.targetPlanPrice` y `preview.finalAmount`.

### create-lemonsqueezy-checkout

- Rechaza si `countryCode === 'CL'` (mensaje: "Para Chile usa Mercado Pago...").
- Variant: `pro` → `LEMONSQUEEZY_VARIANT_PRO_ID`, `business` → `LEMONSQUEEZY_VARIANT_FULL_ID` (o `LEMONSQUEEZY_VARIANT_BUSINESS_ID`).
- Crea checkout solo con `variant_id` y datos de sesión; no envía `amount`, `custom_price` ni cálculos de precio.

### lemonsqueezy-webhook

- Valida firma con `LEMONSQUEEZY_SIGNING_SECRET`.
- `mapVariantToPlan`: PRO_ID → `pro`, FULL_ID (o BUSINESS_ID) → `business`.
- Actualiza `wa_subscriptions`, `wa_businesses`, `wa_payments` según eventos (order_created, subscription_*, etc.).

---

## 4. Migración SQL

No se añadió migración nueva. Precios están en código (`src/lib/billing/constants.js` y alineados en Edge Functions). Si en el futuro se quiere tabla `wa_plan_prices`, se puede añadir sin cambiar la lógica actual.

---

## 5. Variables de entorno (Supabase Edge Functions)

| Variable | Uso |
|----------|-----|
| `LEMONSQUEEZY_API_KEY` | API LemonSqueezy. |
| `LEMONSQUEEZY_STORE_ID` | Store ID. |
| `LEMONSQUEEZY_VARIANT_PRO_ID` | Variant ID plan Pro (6 USD). |
| `LEMONSQUEEZY_VARIANT_FULL_ID` | Variant ID plan Full (10 USD). Alternativa: `LEMONSQUEEZY_VARIANT_BUSINESS_ID`. |
| `LEMONSQUEEZY_SIGNING_SECRET` | Firma del webhook (X-Signature). |

---

## 6. Pasos para desplegar

1. **Supabase**
   - Configurar secrets: `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_VARIANT_PRO_ID`, `LEMONSQUEEZY_VARIANT_FULL_ID` (o `LEMONSQUEEZY_VARIANT_BUSINESS_ID`), `LEMONSQUEEZY_SIGNING_SECRET`.
2. **Desplegar funciones**
   - `supabase functions deploy plan-change-preview`
   - `supabase functions deploy create-lemonsqueezy-checkout`
   - `supabase functions deploy lemonsqueezy-webhook`
   - `supabase functions deploy create-mp-preference`
   - `supabase functions deploy mp-webhook`
3. **Frontend**
   - Build y deploy como siempre; la capa `src/lib/billing` va en el bundle.

---

## 7. Checklist de validación

- [ ] **Chile:** Usuario con país CL ve precios en CLP (5990 / 9990); botón Mercado Pago; resumen en CLP; no aparece Lemon como opción principal.
- [ ] **Argentina / INT:** Usuario con país no CL ve precios en USD (6 / 10); resumen muestra "US$ 6.00" o "US$ 10.00" (nunca 5990 USD); botón Lemon; create-lemonsqueezy-checkout devuelve redirect_url.
- [ ] **Trial Pro internacional:** Usuario en trial Pro fuera de Chile ve mensaje de trial y resumen en USD (6 o 10), no 5990.
- [ ] **Webhook Lemon:** Pago exitoso actualiza plan en wa_businesses; evento registrado en wa_subscription_events.
- [ ] **Sin Paddle/dLocal:** No hay textos ni flujos activos de Paddle o dLocal en la UI ni en el flujo de checkout.
