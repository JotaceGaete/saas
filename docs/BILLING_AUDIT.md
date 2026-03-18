# Auditoría: Sistema de pagos Ventalink

## A. Archivos que deciden país o región

| Archivo | Qué hace |
|---------|----------|
| `src/config/country.js` | `getCountryCode()` según hostname (ar/cl/go.ventalink.app). No usa business ni user. |
| `src/config/paymentProvider.js` | `getPaymentProvider(countryCode)` → CL = mercado_pago, resto = lemonsqueezy. |
| `src/pages/plans/index.jsx` | `resolveCountryCode(hostname, business, user)` — prioridad: hostname AR/CL, luego business, luego user, default CL. |
| `src/pages/legal/PublicPricingPage.jsx` | Detecta país por hostname + IP (detectCountryForPricing). |
| `src/contexts/AuthContext.jsx` | Expone `business` (incl. countryCode vía getMyBusiness). |
| `supabase/functions/plan-change-preview/index.ts` | `resolveBusinessCountryCode(biz)` — solo país del negocio. |
| `supabase/functions/create-lemonsqueezy-checkout/index.ts` | `resolveBusinessCountryCode(biz)` + body.country como fallback. |

**Problema:** Prioridad de región distinta en frontend (hostname primero) vs backend (solo business). El resumen puede usar país del negocio (CL) mientras la UI usa hostname (AR) → 5990 CLP mostrado como USD.

---

## B. Archivos que deciden proveedor de pago

| Archivo | Qué hace |
|---------|----------|
| `src/config/paymentProvider.js` | Única fuente actual: CL → mercado_pago, resto → lemonsqueezy. |
| `src/pages/plans/index.jsx` | Usa `getPaymentProvider(countryCode)` con countryCode resuelto en la página. |

**Estado:** Centralizado en paymentProvider.js. No hay Paddle en flujo activo.

---

## C. Archivos que contienen precios de planes

| Archivo | Qué contiene |
|---------|--------------|
| `src/constants/plans.js` | PLAN_PRICES_CLP (5990, 9990), PLAN_PRICES_ARS, PLAN_PRICES_USD (6, 10). getPlanPriceByCountry(slug, country, provider). |
| `supabase/functions/plan-change-preview/index.ts` | PLAN_CATALOG_CL (5990, 10000), PLAN_CATALOG_AR, LEMON_PRICES_USD (6, 10). buildLemonPreview usa 6/10. |
| `supabase/functions/create-mp-preference/index.ts` | PLAN_CATALOG_CL, PLAN_CATALOG_AR (precios Mercado Pago). |
| `supabase/functions/create-lemonsqueezy-checkout/index.ts` | LEMON_DISPLAY_PRICE_USD (6, 10) solo para wa_payments.amount. |

**Problema:** Dos fuentes: frontend usa plans.js; resumen usa respuesta de plan-change-preview que a su vez usa catálogos internos. Si el backend devuelve catálogo CL (5990) y el frontend formatea con USD → "5990 USD".

---

## D. Archivos que renderizan tarjetas y resumen

| Archivo | Qué renderiza |
|---------|----------------|
| `src/pages/plans/index.jsx` | Tarjetas: `getPlanPrice(slug)` = getPlanPriceByCountry(slug, countryCode, paymentProvider). Resumen: `preview.targetPlanPrice`, `preview.finalAmount`, `formatCurrency(..., currency)`. |
| `src/pages/legal/PublicPricingPage.jsx` | Tarjetas de precios públicos con getPlanPriceByCountry. |

**Bug:** Las tarjetas usan precios según region del frontend (correcto). El resumen usa lo que devuelve plan-change-preview; si el backend usa país del negocio (CL), devuelve 5990 y el frontend lo pinta con currency USD → 5990 USD.

---

## E. Edge Functions de pagos

| Función | Rol | Estado |
|---------|-----|--------|
| `create-mp-preference` | Crea preferencia Mercado Pago para Chile. | Mantener. |
| `mp-webhook` | Recibe notificaciones MP, actualiza wa_payments y wa_businesses. | Mantener. |
| `plan-change-preview` | Devuelve preview (prorrateo CL o estático Lemon). | Corregir: región/proveedor alineado con frontend; Lemon siempre 6/10 USD. |
| `create-lemonsqueezy-checkout` | Crea checkout Lemon solo con variant_id. | Mantener; aceptar VARIANT_FULL_ID. |
| `lemonsqueezy-webhook` | Eventos Lemon, actualiza wa_subscriptions y wa_businesses. | Mantener; soportar VARIANT_FULL_ID. |
| `create-paddle-checkout` | Paddle. | No usar; fuera del flujo (config eliminada). |
| `paddle-webhook` | Paddle. | No usar. |
| `create-dlocal-checkout` | dLocal. | Stub; no usar. |
| `dlocal-webhook` | dLocal. | Stub; no usar. |

---

## F. Textos residuales Paddle / reglas viejas

- `docs/INFORME_LEGACY_CONTROL_Y_PANEL_USUARIOS.md` — referencias a create-paddle-checkout (actualizado a Lemon).
- `docs/LEMONSQUEEZY.md` — "reemplaza Paddle" (solo documental).
- Migraciones SQL y vistas admin siguen incluyendo 'paddle' en CHECK/comentarios (histórico; no afecta flujo).

---

## Fuentes oficiales tras refactor

| Concepto | Fuente oficial |
|----------|----------------|
| Región / proveedor | `src/lib/billing` (getBillingRegion, getPaymentProvider). Prioridad: 1) business country_code, 2) hostname, 3) user metadata, 4) fallback CL. |
| Precios display | `src/lib/billing/prices.js` (getPlanDisplayPrice). Chile: 5990/9990 CLP. Internacional: 6/10 USD. |
| Preview resumen | plan-change-preview: si provider=lemonsqueezy o region≠CL → buildLemonPreview (6/10 USD). Si no → prorrateo CL/AR. |
| Checkout Lemon | create-lemonsqueezy-checkout: solo variant_id (pro → VARIANT_PRO_ID, full → VARIANT_FULL_ID o VARIANT_BUSINESS_ID). |

---

## Archivos a eliminar / limpiar del flujo

- No eliminar funciones Paddle/dLocal (stubs); no desplegarlas ni referenciarlas en UI.
- config.toml: sin entradas create-paddle-checkout ni paddle-webhook (ya quitadas).
- Frontend/legal: sin menciones a Paddle; textos "LemonSqueezy" o "tarjeta" para internacional.
