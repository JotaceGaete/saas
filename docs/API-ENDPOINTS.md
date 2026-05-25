# API-ENDPOINTS.md
> Generado automáticamente por auditoría de código. Fecha: 2026-05-25.

---

## API Routes de Vercel (`/api/`)

### `/api/billing.js`
Router interno multi-función. Distingue rutas por método HTTP y `x-billing-action` header o `action` en body.

| Path público (rewrite) | Método | Función | Auth |
|------------------------|--------|---------|------|
| `POST /api/v1/billing/subscriptions/create` | POST | Crea suscripción (PayPal o dLocal) | Bearer token Supabase |
| `POST /api/v1/billing/subscriptions/confirm` | POST | Confirma suscripción pendiente | Bearer token Supabase |
| `GET /api/v1/billing/subscription-state` | GET | Estado de suscripción del negocio | Bearer token Supabase |
| `GET /api/v1/billing/current-subscription` | GET | Suscripción actual del negocio | Bearer token Supabase |
| `POST /api/v1/billing/webhooks/dlocal` | POST | Webhook dLocal (HMAC verificado) | Firma dLocal |
| `POST /api/v1/billing/dlocal/test-payment` | POST | Pago de prueba dLocal | Bearer token Supabase |
| `POST /api/v1/billing/dlocal/checkout` | POST | Crea checkout dLocal | Bearer token Supabase |
| `GET /api/v1/billing/dlocal/callback` | GET | Callback return dLocal | — |

**Env vars necesarias:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DLOCAL_BASE_URL`, `BILLING_DLOCAL_ENABLED`, `PAYPAL_MODE`, `PAYPAL_PLAN_ID_PRO_LIVE`, `PAYPAL_PLAN_ID_FULL_LIVE`

---

### `/api/paypal.js`
Gestiona suscripciones PayPal directamente.

| Path público (rewrite) | Método | Función | Auth |
|------------------------|--------|---------|------|
| `POST /api/v1/billing/paypal/subscriptions` | POST | Crea suscripción PayPal | Bearer token Supabase |
| `POST /api/v1/billing/paypal/subscriptions/cancel` | POST | Cancela suscripción PayPal | Bearer token Supabase |
| `POST /api/v1/billing/paypal/confirm` | POST | Confirma suscripción PayPal aprobada | Bearer token Supabase |

**Env vars necesarias:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_MODE`, `PAYPAL_PLAN_ID_PRO_LIVE`, `PAYPAL_PLAN_ID_FULL_LIVE`, `PAYPAL_PLAN_ID_PRO_SANDBOX`, `PAYPAL_PLAN_ID_FULL_SANDBOX`, `PAYPAL_CLIENT_ID` (No confirmado nombre exacto), `PAYPAL_CLIENT_SECRET` (No confirmado nombre exacto)

---

### `/api/paypal-webhook.js`
Procesa eventos de PayPal (BILLING.SUBSCRIPTION.* etc).

| Path público (rewrite) | Método | Auth |
|------------------------|--------|------|
| `POST /webhooks/paypal` | POST | Verificación HMAC PayPal |

**Env vars necesarias:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_MODE`, `PAYPAL_WEBHOOK_ID` (No confirmado nombre exacto)

---

### `/api/billing-dlocal-callback.js`
Retorno del usuario tras pago dLocal.

| Path | Método | Auth |
|------|--------|------|
| `GET /api/billing-dlocal-callback` (No confirmado path exacto) | GET | — |

---

### `/api/billing-dlocal-webhook.js`
Webhook separado de dLocal (puede ser redundante con `/api/billing.js`).

| Path | Método | Auth |
|------|--------|------|
| `POST /api/billing-dlocal-webhook` | POST | Firma dLocal |

---

### `/api/ai.js`
Genera descripción de producto con IA (Gemini/OpenAI vía backend).

| Path público (rewrite) | Método | Auth |
|------------------------|--------|------|
| `POST /api/v1/ai/generate-product-description` | POST | Bearer token Supabase |

**Env vars necesarias:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` (No confirmado), `OPENAI_API_KEY` (No confirmado)

---

### `/api/og-catalog.js`
Genera imagen OG 1200×630 para catálogos (SVG vectorial → PNG con @resvg/resvg-js).

| Path | Método | Auth |
|------|--------|------|
| `GET /api/og-catalog?store=<slug>` | GET | Público |

**Env vars necesarias:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `OG_CATALOG_VECTOR_ONLY`

---

### `/api/seo.js`
SSR de meta tags para crawlers y WhatsApp preview.

| Path | Modo | Descripción |
|------|------|-------------|
| `GET /api/seo?mode=sitemap` | sitemap | Genera `sitemap.xml` |
| `GET /api/seo?mode=go` | go | Meta tags para `go.ventalink.app/` |
| `GET /api/seo?slug=:slug&publicPath=catalogo` | catalog | Meta tags catálogo |
| `GET /api/seo?slug=:slug&publicPath=catalog` | catalog | Meta tags catálogo (inglés) |
| `GET /api/seo?publicPath=product&businessSlug=:b&productSlug=:p` | product | Meta tags producto |
| `GET /api/seo?slug=:slug&publicPath=short` | short | URL corta catálogo |

**Auth:** Público (crawlers)

---

### `/api/client-country.js`
Devuelve país detectado por geo-IP.

| Path | Método | Auth |
|------|--------|------|
| `GET /api/client-country` | GET | Público (o con token, No confirmado) |

Lee header `CF-IPCountry` de Cloudflare.

---

### `/api/cron/process-admin-alert-queue.js`
Cron job: procesa cola de alertas administrativas.

| Path | Schedule | Auth |
|------|----------|------|
| `GET /api/cron/process-admin-alert-queue` | `10 8 * * *` (UTC) | Vercel Cron (header automático) |

**Env vars necesarias:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

### `/api/cron/process-email-queue.js`
Cron job: procesa cola de emails pendientes.

| Path | Schedule | Auth |
|------|----------|------|
| `GET /api/cron/process-email-queue` | No confirmado si está en vercel.json | Vercel Cron |

**Env vars necesarias:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_AUTOMATION_ENABLED`

---

### `/api/loops/event.js`
Proxy de eventos hacia Loops (email marketing platform).

| Path | Método | Auth |
|------|--------|------|
| `POST /api/loops/event` | POST | Bearer token interno (No confirmado) |

**Env vars necesarias:** `LOOPS_API_KEY` (No confirmado nombre exacto), `LOOPS_TEST_MODE`

---

## Supabase Edge Functions

Desplegadas en `https://<project>.supabase.co/functions/v1/<nombre>`

| Función | Método | Auth | Descripción |
|---------|--------|------|-------------|
| `admin-impersonate` | POST | Admin JWT | Impersona un negocio |
| `admin-users` | GET/POST | Admin JWT | Gestión usuarios admin |
| `apply-scheduled-plan-changes` | POST | Service Role | Aplica cambios de plan tras expiración |
| `create-dlocal-checkout` | POST | Supabase JWT | Crea checkout dLocal (stand-by) |
| `create-mp-preference` | POST | Supabase JWT | Crea preferencia Mercado Pago |
| `create-paddle-checkout` | POST | Supabase JWT | Crea checkout Paddle (stand-by) |
| `dashboard-ai-insights` | POST | Supabase JWT | Insights de negocio con IA |
| `dlocal-webhook` | POST | Firma dLocal | Procesa webhooks dLocal |
| `generate-og-image` | GET | Público | Genera og:image (No confirmado si se usa activamente) |
| `improve-product-description` | POST | Supabase JWT | Mejora descripción con IA |
| `mp-webhook` | POST | Firma MP | Procesa webhooks Mercado Pago |
| `paddle-webhook` | POST | Firma Paddle | Procesa webhooks Paddle |
| `plan-change-preview` | POST | Supabase JWT | Calcula prorrateo de cambio de plan |
| `process-email-queue` | POST | Service Role | Procesa cola de emails |
| `record-catalog-visit` | POST | Público (anon) | Registra visita al catálogo |
| `record-catalog-whatsapp-click` | POST | Público (anon) | Registra clic WhatsApp |
| `record-site-visit` | POST | Público (anon) | Registra visita al sitio |
| `send-daily-summary` | POST | Service Role | Envía resumen diario |
| `send-email` | POST | Service Role | Envía email individual (Resend) |
| `upload-image-r2` | POST | Supabase JWT | Sube imagen a R2 |
| `upload-video-r2` | POST | Supabase JWT | Sube video a R2 |

---

## Webhooks externos (reciben llamadas de terceros)

| Endpoint | Origen | Verificación |
|----------|--------|-------------|
| `POST /webhooks/paypal` (→ `/api/paypal-webhook`) | PayPal | HMAC-SHA256 |
| `POST` Edge Function `mp-webhook` | Mercado Pago | Validación MP |
| `POST` Edge Function `dlocal-webhook` | dLocal Go | HMAC (No confirmado) |
| `POST` Edge Function `paddle-webhook` | Paddle | Firma Paddle |

---

## Cron Jobs

| Path | Schedule (UTC) | Descripción |
|------|----------------|-------------|
| `/api/cron/process-admin-alert-queue` | `10 8 * * *` (cada día 08:10) | Alertas admin |
| `send-daily-summary` Edge Function | No confirmado (puede ser Supabase Cron o externo) | Resumen diario |
| `apply-scheduled-plan-changes` Edge Function | No confirmado | Cambios de plan programados |

---

## Route especial Next.js (No activo como Next.js)

`src/api/domain-lookup/route.ts` — Existe un archivo de ruta estilo Next.js App Router, pero el proyecto usa Vite/Vercel Functions, no Next.js. Este archivo puede ser un remanente o un experimento. **No confirmado si está activo en producción.**

---

## Variables de entorno críticas

| Variable | Uso |
|----------|-----|
| `VITE_SUPABASE_URL` | Frontend → Supabase |
| `VITE_SUPABASE_ANON_KEY` | Frontend → Supabase anon |
| `SUPABASE_URL` | Backend/scripts → Supabase (service role) |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend/scripts → Supabase (service role) |
| `PAYPAL_MODE` | `live` o `sandbox` |
| `PAYPAL_PLAN_ID_PRO_LIVE` | Plan Pro en PayPal live |
| `PAYPAL_PLAN_ID_FULL_LIVE` | Plan Full en PayPal live |
| `VITE_PUBLIC_CATALOG_URL` | `https://miralatienda.de` (dominio de catálogos) |
| `VITE_MP_PUBLIC_KEY` | Mercado Pago public key (frontend) |
| `R2_ACCOUNT_ID` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` + `R2_BUCKET_NAME` + `R2_PUBLIC_URL` | Cloudflare R2 |
| `EMAIL_AUTOMATION_ENABLED` | `false` = no procesar email_queue propio |
| `LOOPS_API_KEY` (No confirmado nombre) | Loops email platform |
