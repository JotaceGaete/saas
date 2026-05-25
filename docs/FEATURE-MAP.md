# FEATURE-MAP.md
> Generado automáticamente por auditoría de código. Fecha: 2026-05-25.

---

## Registro / Onboarding

**Estado: Implementado y activo**

- `/register` o `/business-registration` → `src/pages/business-registration/index.jsx` (5 sub-componentes)
- Campos: email, password, nombre del negocio, WhatsApp, descripción
- Auth: `supabase.auth.signUp()` desde `AuthContext.signUp()`
- Trigger SQL crea `wa_businesses` automáticamente con plan Pro en trial 14 días
- Si el trigger no creó el negocio (email confirmation habilitado), `AuthContext.signUp()` lo crea manualmente
- Post-registro: `/verify-email` (si confirmación requerida) o `/complete-business-setup`
- Google OAuth disponible (`signInWithGoogle`)
- Welcome webhook: `VITE_WELCOME_WEBHOOK_URL` (fire-and-forget post-registro)
- Email de bienvenida: vía `email_queue` / Loops
- Email de activación 24h: `src/emails/activation24hEmail.js` + `email_queue` (20260405)

---

## Configuración del negocio

**Estado: Implementado y activo**

- `/business-configuration` → `src/pages/business-configuration/index.jsx` (15+ sub-componentes)
- Configura: nombre, WhatsApp, descripción, dirección, logo, cover image, redes sociales, moneda, país, categorías, template de mensaje de pedido, datos bancarios, leyenda de impresión
- Selector de país: `src/pages/country-select/index.jsx`, `RequireBusinessCountry` guard
- Modo negocio: `business_mode = store | restaurant` (migración 20260429)
- SEO del catálogo: `catalog_seo_content` (título y descripción personalizados)
- Social links: instagram, facebook, tiktok, youtube, etc.

---

## Catálogo público

**Estado: Implementado y activo**

- `/catalogo/:slug` y `/catalog/:slug` → `src/pages/public-catalog/index.jsx`
- URL corta: `/:slug` → mismo componente
- Dominio canónico: `miralatienda.de/:slug` (VITE_PUBLIC_CATALOG_URL)
- Componentes: `CatalogLayout.jsx`, `CatalogStoreHeader.jsx`
- Features: lista de productos, categorías, búsqueda, carrito, checkout vía WhatsApp
- Modo restaurante: UI adaptada para menú de restaurante
- SEO: vía `/api/seo.js` (SSR para crawlers, og:image, canonical)
- Analíticas: visita registrada via Edge Function `record-catalog-visit` (throttling en frontend)
- Clic WhatsApp: registrado via Edge Function `record-catalog-whatsapp-click`
- QR: `qrcode.react` para generar QR del catálogo
- Ofertas: `/catalogo/:slug/ofertas` → `src/pages/public-offers/index.jsx`
- Producto individual: `/p/:businessSlug/:productSlug` → `src/pages/public-product/index.jsx`

---

## Productos

**Estado: Implementado y activo (features recientes)**

- Lista: `/product-management` → `src/pages/product-management/index.jsx`
- Editor: `/product-editor` → `src/pages/product-editor/index.jsx` (8+ sub-componentes)
- Features: nombre, descripción corta/larga, precio, precio comparativo (tachado), imágenes múltiples (array), thumbnail, card_image, video, categorías, opciones/variantes, add-ons, combos, código público, slug, destacado, en oferta, destacado principal, draft, sold out, orden (drag & drop @dnd-kit)
- IA: mejora de descripción con Gemini/OpenAI vía Edge Function `improve-product-description`
- Upload imágenes: vía Edge Function `upload-image-r2` → Cloudflare R2
- Upload video: vía Edge Function `upload-video-r2` → Cloudflare R2
- Límites por plan: Starter=20 productos, Pro=100, Full=ilimitado

---

## Pedidos

**Estado: Implementado y activo**

- Board: `/orders` → `src/pages/orders/index.jsx` (Kanban-like)
- Historial: `/orders/historial` → `src/pages/orders-history/index.jsx`
- Realtime: Supabase Realtime para actualizaciones en tiempo real
- Estados: `pending`, `sent` (enviado por WhatsApp), `paid`, `delivered`, `archived` (No confirmado todos los valores)
- `paid_at`, `sent_at`, `delivered_at`, `archived_at` como timestamps dedicados
- `table_reference`: para restaurantes (mesa)
- `service_type`: delivery / pickup / dine_in (No confirmado todos los valores)
- Email de nuevo pedido: `src/emails/templates/new-order.js`
- Límites por plan: Starter=50 pedidos/mes, Pro y Full=ilimitados

---

## WhatsApp

**Estado: Core del producto, activo**

- El catálogo genera un mensaje pre-formateado con el pedido
- Template configurable en `wa_businesses.order_message_template`
- Checkout: `/catalogo/:slug/checkout` → `src/pages/order-confirmation/index.jsx`
- Campo WhatsApp obligatorio en el negocio (E.164 normalizado)
- Utilidades: `src/utils/buildWhatsAppUrl.js`, `src/utils/openWhatsAppUrl.js`, `src/utils/whatsapp.js`
- Componentes de campo WA por país: `ArgentinaWhatsAppField.jsx`, `ChileWhatsAppField.jsx`, `DynamicWhatsAppField.jsx`

---

## Diseño del catálogo

**Estado: Implementado y activo**

- `/design` → `src/pages/design/index.jsx`
- Configura: colores, tipografía, layout, tema del catálogo
- Datos almacenados en `wa_businesses.design_settings` (JSONB)
- Utilidades: `src/utils/catalogTheme.js`

---

## Analytics

**Estado: Implementado, datos acumulándose**

- Dashboard: `/dashboard` → `src/pages/dashboard/index.jsx` (17+ sub-componentes)
- Métricas: visitas al catálogo (total, 30d, 7d, hoy), clics WhatsApp, pedidos, ventas
- Gráficas: Recharts + D3
- RPC SQL: `wa_get_business_visit_stats()`
- AI insights: Edge Function `dashboard-ai-insights` (Gemini) → `wa_business_daily_ai_insights`
- Utilidad: `src/utils/dashboardInsights.js`
- Analytics avanzados solo en plan Pro y Full (No en Starter)

---

## Billing / Planes

**Estado: Implementado y activo (multi-proveedor)**

- `/planes` o `/plan-y-facturacion` → `src/pages/plans/index.jsx`
- Planes: Starter (gratis), Pro (trial 14d → pago), Full/Business (trial 14d → pago)
- Componente: `UnifiedSubscriptionCard` (`src/pages/plans/`)
- Precios: CLP (CL), ARS (AR), USD (resto)
- PayPal: proveedor INTL (todos los países excepto CL/AR con MP)
- Mercado Pago: Chile y Argentina
- dLocal: código presente, `BILLING_DLOCAL_ENABLED=false` (stand-by)
- Paddle: Edge Function presente, no activo confirmado
- LemonSqueezy: tabla migración, sin uso activo
- Plan change preview (prorrateo): Edge Function `plan-change-preview` + tests `lib.test.ts`
- Scheduled plan changes: Edge Function `apply-scheduled-plan-changes`
- Emails de recibo: `docs/billing/subscription-receipt-email.md` + Loops
- Admin puede asignar planes manualmente sin expiración (legacy)
- Retorno billing: `/billing/success`, `/billing/cancel`, `/billing/paypal/success`, `/billing/paypal/cancel`, `/billing/dlocal/return`

---

## Clientes

**Estado: Implementado (migración 20260428)**

- Ficha: `/customers/:customerId` → `src/pages/customers/index.jsx`
- Tabla: `wa_customers` (deduplicación por teléfono normalizado)
- Vinculación automática: trigger `wa_orders_link_customer` en INSERT de pedidos
- Features: nombre, teléfono normalizado, email, historial de pedidos

---

## Admin

**Estado: Implementado y activo**

- Panel admin en `/admin/*` (requiere `RequireAdmin`)
- Páginas: negocios, detalle negocio, pagos, usuarios, nuevo usuario, detalle usuario, config rubros, audit log, emails
- Impersonación: admin puede simular un negocio (`impersonateBusiness`)
- Edge Functions: `admin-impersonate`, `admin-users`
- Audit log: `AdminAuditLogPage`
- Alertas: `admin_alert_queue` + cron job `process-admin-alert-queue`
- Vista panorámica de visitas al sitio: `wa_admin_get_site_visit_stats()` (solo admin)
- Admin catalog visits overview (migración 20260417)

---

## IA

**Estado: Implementado y activo**

- Mejora de descripción de producto: Edge Function `improve-product-description`
  - Proveedores: Google Gemini (principal), OpenAI (fallback)
  - Caché semántico: `wa_ai_product_description_cache` (hash de nombre+descripción)
  - Log de uso: `wa_ai_usage_log`
  - Rate limiting: `backend/src/lib/ai/rateLimit.js`
  - Política por plan: `backend/src/lib/ai/planPolicy.js` (No confirmado si limita en Starter)
- AI insights del dashboard: Edge Function `dashboard-ai-insights`
  - Genera resumen/insights del negocio diariamente
  - Cacheado en `wa_business_daily_ai_insights`
- Vercel API `/api/ai.js` → delega a backend
- URL configurable: `VITE_AI_PRODUCT_DESCRIPTION_URL`

---

## Emails

**Estado: Implementado, sistema dual**

Sistema propio (cola + Resend) + Loops (email marketing)

### Sistema propio
- `email_queue` table: cola de emails pendientes
- Edge Function `process-email-queue`: procesamiento
- Edge Function `send-email`: envío individual vía Resend
- `EMAIL_AUTOMATION_ENABLED=false`: sistema propio DESHABILITADO en producción actualmente
- Templates: `src/emails/templates/welcome.js`, `src/emails/templates/new-order.js`
- Email activación 24h: `src/emails/activation24hEmail.js`
- Email resumen diario: Edge Function `send-daily-summary`

### Loops
- `src/services/loopsClient.js`: cliente Loops
- `api/loops/event.js`: proxy de eventos
- Recibo de suscripción: `docs/billing/subscription-receipt-email.md`
- Emails de marketing/onboarding delegados a Loops

---

## Funciones parcialmente implementadas

- **dLocal:** Código completo (checkout, webhook, callback), deshabilitado con `BILLING_DLOCAL_ENABLED=false`. Listo para activar.
- **Paddle:** Edge Function y código presentes. No confirmado activación.
- **Video de producto:** Migración y Edge Function `upload-video-r2` presentes. UI de upload No confirmada completitud.
- **Combos y add-ons:** Campos en `wa_products`, UI No confirmada completitud en product-editor.
- **`src/api/domain-lookup/route.ts`:** Archivo estilo Next.js App Router en proyecto Vite. Estado de funcionamiento No confirmado.

---

## Funciones legacy o rotas

- **LemonSqueezy:** Tabla `wa_subscriptions_lemonsqueezy` sin uso activo. Doc `docs/LEMONSQUEEZY.md`.
- **`api/cron/process-email-queue.js`:** No está en `vercel.json` como cron. Puede ser legacy o manual.
- **`ordersDoubleFlickerLog.js`** (`src/pages/orders/`): archivo de debug dejado en producción.
- **`billing-dlocal-return.txt`** en `src/pages/`: archivo de texto suelto, probable legacy.
- **`workers/ventalink-country-header.example.js`:** Ejemplo de Cloudflare Worker para header de país. No confirmado si está desplegado.
- **Media Service externo** (`VITE_MEDIA_SERVICE_URL`): IP directa `46.225.175.62:3002`. No confirmado si activo.
- **Plan "control":** Eliminado del CHECK constraint en migración trial system. Negocios existentes migrados a "starter".

---

## Resumen para ChatGPT

**Los 20 datos más importantes para trabajar en este proyecto:**

1. **No es Next.js.** Es React 18 SPA con Vite 5. Rutas en `src/Routes.jsx` (React Router v6.0.2).
2. **Nombre del producto:** Ventalink. Nombre del proyecto en package.json: `catalogowhatsapp`.
3. **Dominio principal de la app:** `go.ventalink.app`. Los catálogos se comparten con `miralatienda.de/:slug`.
4. **Multi-tenant:** 1 usuario → 1 negocio. Tabla raíz: `wa_businesses`. Todas las tablas tienen prefijo `wa_`.
5. **Auth:** Supabase Auth. Contexto en `src/contexts/AuthContext.jsx`. Guards: `RequireAuth`, `RequireAdmin`.
6. **Admin:** `user.app_metadata.role === 'admin'`. Impersonación desde panel admin.
7. **Planes:** `starter` (gratis), `pro` (trial 14d, $6 USD), `business`/Full (trial 14d, $10 USD). Trial en `wa_businesses.trial_expires_at`.
8. **Billing providers activos:** PayPal (INTL), Mercado Pago (CL/AR). Tabla fuente de verdad: `billing_subscriptions`.
9. **Precios locales:** Chile=CLP, Argentina=ARS. Resto=USD con PayPal.
10. **Imágenes:** Cloudflare R2 (principal). Upload via Edge Function `upload-image-r2`. Campo `images[]` array en `wa_products`.
11. **IA:** Google Gemini (principal) + OpenAI (fallback). Edge Function `improve-product-description`. Caché en `wa_ai_product_description_cache`.
12. **Emails:** Sistema dual: Loops (activo) + propio Resend via `email_queue` (`EMAIL_AUTOMATION_ENABLED=false`).
13. **Analytics propias:** `wa_catalog_visits` + `wa_site_visits`. No hay Google Analytics/Mixpanel.
14. **Realtime:** Solo `wa_orders` (pedidos en tiempo real en el dashboard).
15. **RLS:** Todas las tablas `wa_*` tienen RLS. Anónimos solo pueden insertar pedidos (`wa_orders_anon_insert`).
16. **Vercel Functions:** `/api/*.js` (backend). `/api/seo.js` hace SSR de meta tags para WhatsApp/crawlers.
17. **Edge Functions:** `supabase/functions/` (Deno/TypeScript). 21 funciones activas.
18. **Trigger SQL key:** Al crear usuario → trigger crea `wa_businesses` con plan Pro en trial. Función `wa_get_effective_plan()` calcula plan real.
19. **Países soportados:** CL, AR, BO, CO, CR, EC, GT, MX, PA, PE, PY, UY, ES, US (14 países en `COUNTRY_CONFIG`).
20. **Riesgos principales:** `backup.sql` expuesto en repo, React Router v6.0.2 muy antigua, sin staging de Supabase, dLocal/Paddle en código pero no activos, `ordersDoubleFlickerLog.js` de debug en producción.
