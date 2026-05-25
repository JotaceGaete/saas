# ARCHITECTURE.md
> Generado automáticamente por auditoría de código. Fecha: 2026-05-25.

---

## Diagrama general

```
Browser (React SPA)
    │
    ├── Vercel CDN (dist/)
    │       └── /assets/* (cache inmutable 1 año)
    │
    ├── Vercel Functions (/api/*.js)
    │       ├── /api/billing.js          ← Billing multi-provider
    │       ├── /api/paypal.js           ← PayPal subscriptions
    │       ├── /api/paypal-webhook.js   ← PayPal webhooks
    │       ├── /api/ai.js               ← AI product descriptions
    │       ├── /api/og-catalog.js       ← OG image generation
    │       ├── /api/seo.js              ← SSR SEO / sitemap
    │       ├── /api/client-country.js   ← Geo-IP detection
    │       └── /api/cron/              ← Cron jobs (Vercel Cron)
    │
    ├── Supabase
    │       ├── Auth (JWT sessions)
    │       ├── PostgreSQL (RLS habilitado)
    │       ├── Storage (legacy images)
    │       └── Edge Functions (Deno)
    │
    ├── Cloudflare R2 (imágenes de producto y logos)
    └── Loops / Resend (emails)
```

---

## Frontend

- **Framework:** React 18 SPA construida con Vite 5. NO es Next.js.
- **Entry point:** `src/index.jsx` → `src/App.jsx` → `src/Routes.jsx`
- **Router:** React Router DOM 6.0.2 (BrowserRouter). Rutas declaradas en `src/Routes.jsx`.
- **State:**
  - `AuthContext` (`src/contexts/AuthContext.jsx`): sesión Supabase, negocio activo, impersonation admin.
  - `CountryContext` (`src/contexts/CountryContext.jsx`): país detectado/seleccionado.
  - Redux Toolkit (`@reduxjs/toolkit`): uso parcial (No confirmado qué slices están en uso activo).
- **Estilos:** Tailwind CSS 3.4.6 con config extendida (`tailwind.config.js`). Fuentes: Inter, Manrope (catálogo). Variables CSS custom para colores.
- **Animaciones:** Framer Motion 10.
- **PWA:** `vite-plugin-pwa`. Service Worker + manifest. `sw.js` se sirve sin cache.
- **Alias de paths** (`jsconfig.json` + `vite.config.js`): `components/`, `pages/`, `services/`, `utils/`, `hooks/`, `config/`, `constants/`, `lib/`, `contexts/`.
- **Imágenes producto:** Se sirven desde R2 vía URL pública. Transformaciones Cloudflare Images vía `src/utils/cloudflareImage.js`.

---

## Backend / API (Vercel Functions)

Directorio: `/api/*.js`

Todas las funciones son serverless Node.js desplegadas en Vercel. Usan lógica del directorio `/backend/src/`.

| Archivo | Propósito |
|---------|-----------|
| `api/billing.js` | Router principal de billing: crear/confirmar suscripciones, estado, dLocal checkout, dLocal webhook |
| `api/paypal.js` | Suscripciones PayPal: crear, cancelar, confirmar |
| `api/paypal-webhook.js` | Webhook de PayPal (verificación de firma HMAC) |
| `api/billing-dlocal-callback.js` | Callback de retorno dLocal |
| `api/billing-dlocal-webhook.js` | Webhook dLocal |
| `api/ai.js` | Generación de descripción de producto con IA |
| `api/og-catalog.js` | Genera imagen OG 1200×630 para catálogos (SVG + @resvg/resvg-js) |
| `api/seo.js` | SSR para meta tags y sitemap.xml (catálogos, productos, go root) |
| `api/client-country.js` | Devuelve país detectado por geo-IP (header CF-IPCountry) |
| `api/cron/process-admin-alert-queue.js` | Cron: procesa cola de alertas admin (08:10 UTC diario) |
| `api/cron/process-email-queue.js` | Cron: procesa cola de emails (No confirmado si está activo en Vercel Cron) |
| `api/loops/event.js` | Proxy de eventos hacia Loops (email marketing) |

**Rewrites en vercel.json:** Las URLs `/api/v1/billing/*` y `/api/v1/ai/*` se reescriben a los handlers internos.

---

## Supabase

- **URL:** `VITE_SUPABASE_URL` (env var)
- **Anon key:** `VITE_SUPABASE_ANON_KEY` (env var)
- **Cliente:** `src/lib/supabase.js` (singleton `@supabase/supabase-js ^2.100.1`)
- **Auth:** Email/password + Google OAuth. Confirmación de email habilitada. Redirect a `/auth/callback`.
- **RLS:** Habilitado en todas las tablas `wa_*` y `billing_*`. Ver `docs/DATA-MODEL.md`.
- **Realtime:** Habilitado para `wa_orders` (dashboard de pedidos en tiempo real).
- **Storage:** Buckets `wa-product-images` y `wa-business-logos` (imágenes legacy antes de R2).
- **Migraciones:** 127+ migraciones en `supabase/migrations/`. Prefijo `wa_` en tablas del dominio principal.
- **Tipos generados:** `database.types.ts` en raíz del proyecto.

---

## Edge Functions (Supabase)

Directorio: `supabase/functions/`
Runtime: Deno (TypeScript)

| Función | Propósito |
|---------|-----------|
| `admin-impersonate` | Admin impersona un negocio |
| `admin-users` | Listado y gestión de usuarios para panel admin |
| `apply-scheduled-plan-changes` | Aplica cambios de plan programados tras trial |
| `create-dlocal-checkout` | Crea checkout en dLocal Go (stand-by) |
| `create-mp-preference` | Crea preferencia en Mercado Pago (Checkout Pro) |
| `create-paddle-checkout` | Crea checkout en Paddle (stand-by) |
| `dashboard-ai-insights` | Genera insights de negocio con IA (Gemini) |
| `dlocal-webhook` | Procesa webhooks dLocal |
| `generate-og-image` | Genera og:image para catálogos (Satori/Resvg) |
| `improve-product-description` | Mejora descripción de producto con IA |
| `mp-webhook` | Procesa webhooks de Mercado Pago |
| `paddle-webhook` | Procesa webhooks de Paddle |
| `plan-change-preview` | Calcula prorrateo de cambio de plan |
| `process-email-queue` | Procesa cola de emails pendientes |
| `record-catalog-visit` | Registra visita al catálogo público |
| `record-catalog-whatsapp-click` | Registra clic en botón WhatsApp del catálogo |
| `record-site-visit` | Registra visita al sitio Ventalink |
| `send-daily-summary` | Envía resumen diario por email |
| `send-email` | Envía email individual (Resend) |
| `upload-image-r2` | Sube imagen a Cloudflare R2 |
| `upload-video-r2` | Sube video a Cloudflare R2 |

---

## Storage

- **Principal:** Cloudflare R2 (`R2_BUCKET_NAME`). URL pública: `R2_PUBLIC_URL`.
  - Imágenes de productos: múltiples imágenes por producto (`images[]` array).
  - Thumbnails: campo `thumbnail_url` en `wa_products`.
  - Card images: campo `card_image_url` en `wa_products`.
  - Logos de negocio.
  - Videos de producto (`video_url`).
- **Legacy:** Supabase Storage (buckets `wa-product-images`, `wa-business-logos`). Aún puede tener imágenes antiguas.
- **Media Service:** `VITE_MEDIA_SERVICE_URL` (servidor externo opcional, IP `46.225.175.62:3002`). Estado: No confirmado si está activo en producción.
- **Servicios:** `src/services/mediaUploadService.js`, `src/services/productMediaService.js`.
- **Script de migración:** `scripts/migrate-images-to-r2.mjs`.

---

## Billing

Sistema multi-proveedor. Fuente de verdad: tabla `billing_subscriptions` (una fila por negocio).

| Proveedor | Estado | Países |
|-----------|--------|--------|
| PayPal | Activo | INTL (todos excepto CL/AR con MP) |
| Mercado Pago | Activo | Chile (CLP), Argentina (ARS) |
| dLocal Go | Stand-by (código presente) | Latam (deshabilitado) |
| Paddle | Stand-by (código presente) | Global |
| LemonSqueezy | Legacy / no activo | — |

**Precios:**
- Chile: Pro $5.990 CLP / Full $9.990 CLP
- Argentina: Pro $8.990 ARS / Full $13.990 ARS
- Internacional: Pro $6 USD / Full $10 USD

**Flujo PayPal:** Frontend → `/api/v1/billing/paypal/subscriptions` → PayPal API → webhook `/webhooks/paypal` → `billing_subscriptions`.

**Flujo Mercado Pago:** Frontend → Edge Function `create-mp-preference` → MP Checkout Pro → webhook Edge Function `mp-webhook` → `billing_subscriptions` / `wa_payments`.

**Trial:** 14 días en plan Pro para nuevos usuarios. Columna `trial_expires_at` en `wa_businesses`. Función SQL `wa_get_effective_plan()`.

---

## Tracking / Analytics

- **Visitas catálogo:** `wa_catalog_visits` + Edge Function `record-catalog-visit`. RPC `wa_get_business_visit_stats()`.
- **Clics WhatsApp:** `wa_catalog_whatsapp_clicks` + Edge Function `record-catalog-whatsapp-click`.
- **Visitas sitio:** `wa_site_visits` + Edge Function `record-site-visit`. Solo lectura admin.
- **AI insights:** `wa_business_daily_ai_insights` + Edge Function `dashboard-ai-insights`.
- **Frontend analytics:** `src/lib/analytics.js`, `src/utils/analytics.js`.
- **Loops:** `src/services/loopsClient.js` + `api/loops/event.js` (proxy hacia Loops API). Usado para eventos de marketing y emails transaccionales.

---

## Autenticación

- Proveedor: Supabase Auth
- Métodos: Email/password, Google OAuth
- Contexto React: `src/contexts/AuthContext.jsx` (funciones: `signIn`, `signUp`, `signOut`, `signInWithGoogle`, `resetPasswordForEmail`, `resendConfirmationEmail`, `refreshBusiness`, `patchBusiness`, `refreshUser`)
- Guards de ruta: `RequireAuth` (`src/components/RequireAuth.jsx`), `RequireAdmin` (`src/components/RequireAdmin.jsx`)
- `isAdmin`: detectado por `user.app_metadata.role === 'admin'` o `user.user_metadata.role === 'admin'`
- Impersonation: admin puede impersonar un negocio sin cambiar de sesión (`impersonateBusiness` / `stopImpersonation`)
- Sesión expirada: manejada por `SessionExpiredHandler` + `handleCorruptSession` (limpia localStorage, redirige a login)
- Redirect tras auth: `/auth/callback` (página `src/pages/auth-callback/index.jsx`)

---

## Flujo multi-tenant

Relación: 1 usuario → 1 negocio (actualmente). `wa_businesses.user_id` FK a `auth.users.id`.

1. Usuario se registra → trigger SQL `wa_handle_new_user_business` crea `wa_businesses` automáticamente con plan Pro en trial (14 días).
2. `AuthContext` carga el negocio activo vía `getMyBusiness()`.
3. RLS: todas las operaciones de negocio están filtradas por `user_id = auth.uid()`.
4. Admin puede ver todos los negocios sin RLS (role admin bypasa).

---

## Dependencias importantes

```
react-router-dom@6.0.2     ← versión antigua (6.0, no 6.28+)
@supabase/supabase-js@^2   ← cliente único en src/lib/supabase.js
framer-motion@^10           ← animaciones
recharts@^2                 ← gráficas en dashboard
@dnd-kit/core@^6            ← drag & drop (orden de productos)
@google/genai@^1            ← SDK Gemini IA
resend@^6                   ← envío de emails transaccionales
react-hook-form@^7          ← formularios
date-fns@^4                 ← fechas
```

---

## Riesgos técnicos actuales

1. **React Router v6.0.2 muy antigua:** La API de v6 cambió significativamente en v6.4+. Actualizar rompe hooks y loaders.
2. **Multi-provider billing complejo:** 4 proveedores en código (PayPal activo, MP activo, dLocal stand-by, Paddle stand-by). Alta superficie de bugs en lógica de estados.
3. **Sin staging de Supabase:** Un único proyecto Supabase para todo. Cambios de schema son riesgosos.
4. **Media Service externo (IP directa):** `VITE_MEDIA_SERVICE_URL` apunta a IP `46.225.175.62:3002`. Sin SSL explícito, sin failover.
5. **Email automation `EMAIL_AUTOMATION_ENABLED=false`:** Sistema propio de email deshabilitado; se usa Loops. Hay deuda de limpieza.
6. **`backup.sql` en raíz del repo:** Archivo de backup SQL expuesto en el repositorio (riesgo de datos sensibles si es real).
7. **`billing-dlocal-return.txt`** en `src/pages/`: archivo de texto suelto, probable legacy.
8. **LemonSqueezy:** Tabla `wa_subscriptions_lemonsqueezy` en migraciones pero sin uso activo aparente.
