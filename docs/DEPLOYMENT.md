# DEPLOYMENT.md
> Generado automáticamente por auditoría de código. Fecha: 2026-05-25.
> Fuentes: `vercel.json`, `package.json`, `.env.example`, `supabase/config.toml`.

---

## Plataformas

| Servicio | Rol |
|----------|-----|
| Vercel | Frontend SPA + Serverless Functions + Cron |
| Supabase | PostgreSQL + Auth + Edge Functions + Realtime + Storage |
| Cloudflare R2 | Almacenamiento de imágenes y videos |
| Cloudflare Images | CDN y transformaciones de imágenes |
| Loops | Email marketing y transaccional |
| Resend | Envío de emails (dentro de Edge Functions) |
| PayPal | Billing INTL |
| Mercado Pago | Billing CL/AR |

---

## Vercel

### Build
- **Output directory:** `dist` (configurado en `vercel.json`)
- **Build command:** `vite build` (script `build` en `package.json`)
- **Framework:** Vite (SPA, no Next.js)

### Dominios configurados
| Dominio | Comportamiento |
|---------|---------------|
| `go.ventalink.app` | App principal (SPA + Functions) |
| `ventalink.app` | Landing + redirect de app routes a `go.*` |
| `www.ventalink.app` | Redirect 302 a `ventalink.app` |
| `miralatienda.de` | Catálogos públicos + redirect de app routes a `go.*` |
| `www.miralatienda.de` | Redirect 301 a `miralatienda.de` |

### Cache headers
| Path | Cache |
|------|-------|
| `/assets/*` | `public, max-age=31536000, immutable` (1 año) |
| `/`, `/catalogo/*`, `/catalog/*`, `/p/*`, `/dashboard`, `/plans` | `no-store, no-cache` |
| `/index.html`, `/sw.js`, `/manifest.json`, `/manifest.webmanifest` | `no-store, no-cache` |

### Cron Jobs (Vercel Cron)
| Path | Schedule | Descripción |
|------|----------|-------------|
| `/api/cron/process-admin-alert-queue` | `10 8 * * *` (08:10 UTC diario) | Procesa alertas admin |

### Rewrites importantes
- `/api/v1/billing/*` → `/api/billing` o `/api/paypal`
- `/api/v1/ai/*` → `/api/ai`
- `/webhooks/paypal` → `/api/paypal-webhook`
- `/sitemap.xml` → `/api/seo?mode=sitemap`
- `/catalogo/:slug` → `/api/seo?slug=:slug&...` (SSR meta tags para crawlers)
- `/:slug` → `/api/seo?slug=:slug&publicPath=short` (catálogos URL corta)
- `/(dashboard|login|...)(.*)` → `/index.html` (SPA fallback)

### Variables de entorno en Vercel (requeridas)
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VITE_PUBLIC_CATALOG_URL=https://miralatienda.de
PAYPAL_MODE=live
PAYPAL_PLAN_ID_PRO_LIVE=P-...
PAYPAL_PLAN_ID_FULL_LIVE=P-...
PAYPAL_PLAN_ID_PRO_SANDBOX=P-...
PAYPAL_PLAN_ID_FULL_SANDBOX=P-...
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL
EMAIL_AUTOMATION_ENABLED=false
```

### Variables de entorno en Vercel (opcionales)
```
VITE_APP_URL=https://go.ventalink.app
VITE_MEDIA_SERVICE_URL
VITE_PRODUCT_IMAGE_MAX_BYTES=10485760
VITE_AI_PRODUCT_DESCRIPTION_URL
VITE_OG_IMAGE_API_BASE
VITE_MP_PUBLIC_KEY
VITE_PLANS_SUPPORT_WHATSAPP
OG_CATALOG_VECTOR_ONLY
DLOCAL_BASE_URL
BILLING_DLOCAL_ENABLED=false
VITE_WELCOME_WEBHOOK_URL
LOOPS_API_KEY (o nombre real del env var de Loops)
LOOPS_TEST_MODE
```

---

## Supabase

### Migraciones
```bash
supabase db push               # aplica migraciones pendientes
supabase db diff               # genera diff del estado actual
supabase db reset              # resetea a estado inicial (SOLO dev)
```

- 127+ migraciones en `supabase/migrations/`
- Aplicar en orden cronológico (nombres de archivo con timestamp)
- **Sin staging de Supabase documentado** — único proyecto para producción

### Edge Functions
```bash
supabase functions deploy <nombre>   # despliega una función
supabase functions deploy            # despliega todas
```

Funciones a desplegar:
```
admin-impersonate, admin-users, apply-scheduled-plan-changes,
create-dlocal-checkout, create-mp-preference, create-paddle-checkout,
dashboard-ai-insights, dlocal-webhook, generate-og-image,
improve-product-description, mp-webhook, paddle-webhook,
plan-change-preview, process-email-queue, record-catalog-visit,
record-catalog-whatsapp-click, record-site-visit, send-daily-summary,
send-email, upload-image-r2, upload-video-r2
```

### Variables de entorno en Supabase Edge Functions (secrets)
No están en `.env.example`. Se configuran via `supabase secrets set`:
```
# MercadoPago
MP_ACCESS_TOKEN
# PayPal
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_WEBHOOK_ID
# dLocal
DLOCAL_API_KEY
DLOCAL_SECRET_KEY
# Paddle
PADDLE_API_KEY
PADDLE_WEBHOOK_SECRET
# AI
GEMINI_API_KEY
OPENAI_API_KEY
# Email
RESEND_API_KEY
LOOPS_API_KEY
# R2
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL
```
(**Todos No confirmados en nombre exacto** — verificar en `supabase/functions/*/index.ts`)

---

## Edge Functions (Supabase Cron)

Algunos cron jobs pueden estar configurados directamente en Supabase (pg_cron):
- `send-daily-summary`: No confirmado schedule
- `apply-scheduled-plan-changes`: No confirmado schedule
- Ver migración `20260317000001_cron_daily_summary.sql` para el cron de resumen diario

---

## Cloudflare R2

- Bucket: `R2_BUCKET_NAME`
- URL pública: `R2_PUBLIC_URL` (CDN)
- Acceso: `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` + `R2_ACCOUNT_ID`
- Las imágenes se suben desde Edge Function `upload-image-r2` y `upload-video-r2`
- Script de migración desde Supabase Storage: `scripts/migrate-images-to-r2.mjs`

---

## PayPal Setup

Scripts de configuración/diagnóstico en `scripts/`:
```bash
node scripts/paypal-catalog-bootstrap.js    # Crea catálogo en PayPal
node scripts/paypal-auth-diagnostic.js      # Diagnóstico de auth
node scripts/paypal-plan-mapping-diagnostic.js
node scripts/paypal-subscription-diagnostic.js
node scripts/paypal-event-handlers-diagnostic.js
```

NPM scripts de conveniencia:
```bash
npm run paypal:auth
npm run paypal:bootstrap
npm run paypal:mapping
npm run paypal:setup
```

---

## Riesgos de deploy

| Riesgo | Severidad | Descripción |
|--------|-----------|-------------|
| Migración sin staging | 🔴 Alta | Un error de SQL en producción afecta todos los usuarios |
| Edge Function mal desplegada | 🔴 Alta | Puede romper billing, uploads o analíticas |
| Variables de entorno faltantes | 🔴 Alta | `VITE_SUPABASE_URL/KEY` faltantes rompen el build entero |
| Preview deployments con BD producción | 🟡 Media | Tests en preview pueden modificar datos reales |
| Cache de Vercel para assets | 🟡 Media | Assets con `immutable` requieren hash diferente para invalidar |
| Cron job único | 🟡 Media | Solo `process-admin-alert-queue` en Vercel Cron; emails pueden quedar en cola |
| backup.sql en repo | 🔴 Alta | Si tiene datos reales, riesgo de exposición |

---

## Checklist antes de subir a producción

### Código
- [ ] No hay `console.log` de debug críticos (especialmente en `AuthContext`)
- [ ] `ordersDoubleFlickerLog.js` no está importado activamente (o eliminado)
- [ ] Variables de entorno necesarias configuradas en Vercel
- [ ] Secrets de Supabase Edge Functions actualizados si cambiaron

### Base de datos
- [ ] Migraciones nuevas probadas en staging o revisadas manualmente
- [ ] Funciones SQL y triggers probados
- [ ] No hay datos sensibles en archivos del repo (`backup.sql`)

### Edge Functions
- [ ] Functions desplegadas: `supabase functions deploy`
- [ ] Secrets de Supabase actualizados si se añadieron nuevas variables

### Billing
- [ ] `PAYPAL_MODE=live` en producción (no sandbox)
- [ ] Plan IDs de PayPal son los de producción (`LIVE`)
- [ ] Webhooks de PayPal apuntando a `go.ventalink.app/webhooks/paypal`
- [ ] Webhook de Mercado Pago apuntando a la Edge Function correcta

### Frontend
- [ ] `VITE_PUBLIC_CATALOG_URL=https://miralatienda.de` (no localhost)
- [ ] `VITE_APP_URL=https://go.ventalink.app` (o vacío para usar `window.location.origin`)
- [ ] PWA manifest y service worker funcionando (`/manifest.json` no cacheado)

### Post-deploy
- [ ] Verificar `/dashboard` carga correctamente
- [ ] Verificar un catálogo público (`/catalogo/:slug`)
- [ ] Verificar el sitemap (`/sitemap.xml`)
- [ ] Verificar OG image de un catálogo (WhatsApp preview)
- [ ] Verificar login con email y con Google OAuth
- [ ] Verificar que el cron de alertas admin tiene el schedule correcto en Vercel

---

## GitHub CI/CD

- `.github/workflows/SupabaseDailyBackuptoR2.yml`: Backup diario de Supabase a Cloudflare R2
- `.github/workflows/supabase-backup.yml`: Backup alternativo
- No hay workflow de deploy (Vercel tiene integración automática con el repo)
