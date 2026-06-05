# VENTALINK — DOCUMENTO MAESTRO PARA NOTEBOOKLM
## Versión: Junio 2026 · Branch: claude/zen-einstein-jqcN1

---

> **Instrucción para NotebookLM:** Este documento es la fuente de verdad sobre el producto Ventalink. Úsalo para actuar como arquitecto de software, product manager, desarrollador senior, QA, diseñador UX/UI, experto en SaaS y asesor estratégico. Cuando el usuario te haga una pregunta sobre código, features, roadmap, decisiones de diseño o modelo de negocio, consulta este documento primero. Al final hay una sección "CONTEXTO VIVO" que te indica qué actualizar tras cada deploy.

---

## TABLA DE CONTENIDOS

1. Resumen Ejecutivo
2. Identidad del Producto
3. Arquitectura Técnica Completa
4. Base de Datos: Tablas y Esquema
5. Mapa Funcional Completo
6. Rutas de la Aplicación
7. Flujos de Usuario
8. Modelo de Negocio y Monetización
9. Sistema de Planes y Billing
10. Integraciones Externas
11. Edge Functions (Supabase)
12. Serverless Functions (Vercel API)
13. Análisis UX/UI
14. Análisis SaaS
15. Análisis Competitivo
16. Problemas Detectados
17. Riesgos del Proyecto
18. Oportunidades Estratégicas
19. Roadmap Recomendado
20. Funcionalidades Diferenciadoras
21. Qué Construir Primero / Qué Posponer
22. Contexto Vivo del Proyecto

---

## 1. RESUMEN EJECUTIVO

**Ventalink** (antes Walinka) es una plataforma SaaS B2B orientada a pequeños negocios, emprendedores y comerciantes de Latinoamérica. Su propósito central es democratizar el comercio digital: que cualquier persona pueda tener un catálogo online profesional, recibir pedidos por WhatsApp, y gestionar su negocio completo desde una sola herramienta simple.

**La apuesta diferencial**: no ser un ERP complejo ni una tienda e-commerce genérica, sino un sistema de ventas asistido por WhatsApp con herramientas de gestión financiera simple, pensado para el dueño de un negocio que no tiene equipo técnico.

**Estado actual**: En producción. Dominio principal `https://go.ventalink.app`. Usuarios activos en Chile, Argentina y mercados LATAM. Modelo freemium con planes Pro y Business de pago.

**Filosofía fundacional**: *"No quiero ERP complejos. Quiero que el negocio venda más y entienda mejor sus números."*

---

## 2. IDENTIDAD DEL PRODUCTO

| Campo | Valor |
|-------|-------|
| Nombre actual | Ventalink |
| Nombre histórico | Walinka |
| Tipo | SaaS B2B · Freemium |
| Segmento objetivo | Pequeños negocios, emprendedores, comerciantes LATAM |
| Dominio principal | https://go.ventalink.app |
| Dominio catálogo público | https://miralatienda.de (legacy) |
| Dominio raíz marketing | https://ventalink.app |
| Mercados activos | Chile (CL), Argentina (AR), Internacional (USD) |
| Países con billing local | CL → Mercado Pago (CLP), AR → Mercado Pago (ARS) |
| Países billing internacional | MX, PY, resto LATAM → PayPal (USD) |
| Idioma | Español (todos los textos de UI en español) |
| Modo de negocio soportado | Tienda (store), Restaurante/Gastronomía (restaurant) |

**Renombrado histórico**: El sistema se llamaba Walinka. Hay referencias legacy a `walinka.com` en el código (CORS, host regex). El nombre del producto que el usuario final ve es "Ventalink". En código pueden coexistir ambas referencias.

---

## 3. ARQUITECTURA TÉCNICA COMPLETA

### 3.1 Stack tecnológico

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│   React 18 + Vite 5 · React Router v6 · Tailwind CSS            │
│   Framer Motion · Recharts · D3 · react-leaflet@4               │
│   react-hook-form · @dnd-kit · Lucide React · QRCode.react      │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────────────┐
│                    VERCEL (Hosting + CDN)                         │
│   dist/ (SPA) · api/ (Serverless Functions Node.js)              │
│   vercel.json (rewrites/redirects/headers/crons)                 │
└──────────┬─────────────────────────────────────┬────────────────┘
           │                                     │
┌──────────▼──────────┐              ┌───────────▼───────────────┐
│  SUPABASE           │              │  CLOUDFLARE R2            │
│  PostgreSQL DB      │              │  Imágenes de productos    │
│  Supabase Auth      │              │  Videos de productos      │
│  Edge Functions     │              │  OG images                │
│  Realtime           │              └───────────────────────────┘
│  Storage (legacy)   │
└──────────┬──────────┘
           │
┌──────────▼──────────────────────────────────────────────────────┐
│              INTEGRACIONES EXTERNAS                              │
│   Mercado Pago (suscripciones CL/AR)                             │
│   PayPal (suscripciones internacional)                           │
│   dLocal (checkout alternativo · deshabilitado en producción)    │
│   Google Gemini API (@google/genai @google/generative-ai)        │
│   OpenAI gpt-4o-mini (improve-product-description)              │
│   Resend (emails transaccionales)                                │
│   Loops (email marketing/onboarding)                             │
│   Vercel Domains API (registro dominios personalizados)          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Frontend: estructura de directorios

```
src/
├── Routes.jsx              # Router principal + GoRootEntry (lógica dominio custom)
├── config/
│   ├── appUrl.js           # SAAS_HOST_RE, getEffectiveCatalogUrl(), etc.
│   ├── countryConfig.js    # Lista de países soportados
│   └── countryPricing.js   # Precios por país ISO
├── constants/
│   └── plans.js            # PLAN_LIMITS, PLAN_PRICES, helpers de plan
├── contexts/
│   └── AuthContext.jsx     # useAuth hook, sesión Supabase
├── lib/
│   ├── analytics.js        # Tracking de visitas/clicks
│   ├── billing/            # Sistema de billing completo
│   │   ├── constants.js    # BILLING_REGION_CL/INT, precios, proveedores
│   │   ├── markets.js      # getPlanPrice/getPlanCurrency por countryCode
│   │   ├── providers.js    # PAYMENT_PROVIDERS, getPaymentOptions()
│   │   ├── defaultProviderByCountry.js
│   │   ├── subscriptionService.js
│   │   └── ...
│   ├── business-mode.js    # BUSINESS_MODES: store/restaurant
│   ├── country/            # Detectar país del navegador
│   ├── locale/             # Formato de moneda/fecha
│   ├── market/             # Resolución de mercado de facturación
│   ├── phone/              # Validación/formateo teléfono
│   └── ai/                 # Resolvers URL IA
├── services/
│   ├── waBusinessService.js # Todas las operaciones de negocio/productos/pedidos
│   ├── adminEmailService.js
│   ├── adminPaymentsService.js
│   ├── adminUsersService.js
│   └── mediaUploadService.js
├── pages/
│   ├── admin/              # Panel de administración interno
│   ├── auth-callback/      # Callback OAuth Google
│   ├── billing/            # Success/Cancel/PayPal pages
│   ├── billing-dlocal-return/
│   ├── business-configuration/ # Configuración del negocio
│   ├── business-registration/
│   ├── complete-business-setup/
│   ├── country-select/
│   ├── customers/          # Módulo CRM - ficha de cliente
│   ├── dashboard/          # Dashboard principal
│   ├── design/             # Personalización visual del catálogo
│   ├── help/               # Centro de ayuda
│   ├── landing-page/       # Landing marketing
│   ├── legal/              # Terms, Privacy, Refunds, Pricing
│   ├── login/
│   ├── order-confirmation/ # Checkout público
│   ├── orders/             # Gestión de pedidos (Kanban)
│   ├── orders-history/     # Historial de pedidos
│   ├── plans/              # Página de planes
│   ├── product-editor/     # Editor de producto
│   ├── product-management/ # Gestión de productos
│   ├── public-catalog/     # Catálogo público del negocio
│   ├── public-offers/      # Página de ofertas públicas
│   ├── public-product/     # Página individual de producto
│   ├── reset-password/
│   ├── verify-email/
│   └── NotFound.jsx
└── components/             # Componentes reutilizables UI
```

### 3.3 API Serverless (Vercel · api/)

```
api/
├── ai.js                   # Generación de descripciones IA
├── billing.js              # Billing principal (dLocal, Mercado Pago)
├── billing-dlocal-callback.js
├── billing-dlocal-webhook.js
├── og-catalog.js           # Generación de OG images dinámicas
├── paypal.js               # PayPal suscripciones
├── paypal-webhook.js       # Webhook PayPal
├── paypal-subscriptions.js
├── seo.js                  # SEO/OG injection para redes sociales
│                           # modes: go | custom-domain | sitemap | catalogo | product | short
├── client-country.js       # Detección de país por IP/header
├── loops/                  # Integraciones Loops email marketing
├── cron/
│   └── process-admin-alert-queue.js  # Cron diario 08:10 UTC
├── scripts/                # Scripts de mantenimiento/backfill
└── backend/                # Utilidades compartidas
```

### 3.4 Edge Functions (Supabase · supabase/functions/)

| Función | Propósito |
|---------|-----------|
| `manage-custom-domain` | Registra/verifica dominios personalizados vía Vercel API |
| `dashboard-ai-insights` | Genera insights de negocio con Gemini AI |
| `improve-product-description` | Optimiza título/descripción de producto con OpenAI gpt-4o-mini |
| `generate-og-image` | Genera imagen OG dinámica para catálogo |
| `create-mp-preference` | Crea preferencia de pago Mercado Pago |
| `mp-webhook` | Webhook de Mercado Pago |
| `plan-change-preview` | Calcula prórrata de cambio de plan |
| `apply-scheduled-plan-changes` | Aplica cambios de plan programados |
| `record-catalog-visit` | Registra visita al catálogo |
| `record-catalog-whatsapp-click` | Registra click en WhatsApp del catálogo |
| `record-site-visit` | Registra visita al sitio |
| `send-daily-summary` | Envía resumen diario al negocio |
| `send-email` | Función genérica de envío de email (Resend) |
| `process-email-queue` | Procesa cola de emails pendientes |
| `upload-image-r2` | Upload de imágenes a Cloudflare R2 |
| `upload-video-r2` | Upload de videos a Cloudflare R2 |
| `admin-impersonate` | Impersonar usuario (solo admins internos) |
| `admin-users` | Operaciones de usuarios desde panel admin |
| `create-dlocal-checkout` | Crea checkout dLocal (deshabilitado) |
| `create-paddle-checkout` | Crea checkout Paddle (integración alternativa) |
| `dlocal-webhook` | Webhook dLocal |
| `paddle-webhook` | Webhook Paddle |
| `_shared/` | Utilidades compartidas entre Edge Functions |

### 3.5 Vercel: Routing (vercel.json)

El archivo `vercel.json` implementa una lógica de routing en capas:

**Headers de cache:**
- `/`, `/catalogo/*`, `/catalog/*`, `/p/*`, `/dashboard`, `/plans`, `/index.html`, `/sw.js`, `/manifest.*` → `no-store, no-cache` (siempre fresco)
- `/assets/*` → `public, max-age=31536000, immutable` (assets con hash: cacheable un año)

**Redirects:**
- `ventalink.app` y `www.ventalink.app` → `go.ventalink.app` (rutas admin)
- `www.miralatienda.de` → `miralatienda.de`
- `miralatienda.de` rutas admin → `go.ventalink.app`
- `/catalog/:slug` en `miralatienda.de` → `/catalogo/:slug`

**Cron:** `/api/cron/process-admin-alert-queue` se ejecuta a las 08:10 UTC diariamente.

**Rewrites (por orden de prioridad):**
1. Rutas billing PayPal/dLocal → `/api/paypal` o `/api/billing`
2. Rutas AI → `/api/ai`
3. `/api/v1/billing/webhooks/dlocal` → `/api/billing`
4. `/sitemap.xml` → `/api/seo?mode=sitemap`
5. **`/` en `go.ventalink.app`** → `/api/seo?mode=go` (SEO para raíz SaaS)
6. **`/` en cualquier dominio custom** → `/api/seo?mode=custom-domain` (SEO para merchants)
7. `/catalogo/:slug` → `/api/seo?slug=:slug&publicPath=catalogo` (OG tags catálogo)
8. `/catalog/:slug` → `/api/seo?slug=:slug&publicPath=catalog`
9. `/p/:businessSlug/:productSlug` → `/api/seo?publicPath=product&...` (OG tag producto)
10. Rutas SPA conocidas → `/index.html`
11. `/:slug` (slug corto) → `/api/seo?slug=:slug&publicPath=short`
12. `/**` → `/index.html` (fallback SPA)

**Nota crítica**: El orden de los rewrites en `vercel.json` importa. El rewrite de dominio custom (`/`) sin condición `has` debe ir DESPUÉS del rewrite de `go.ventalink.app` con condición `has`, o todos los accesos a la raíz de `go.ventalink.app` irían al modo custom-domain.

---

## 4. BASE DE DATOS: TABLAS Y ESQUEMA

Todas las tablas están en el esquema `public` de PostgreSQL (Supabase). Las tablas principales inferidas del código:

### Tablas principales

**`wa_businesses`** — Negocios registrados
| Columna relevante | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK a auth.users |
| slug | text | URL única del catálogo |
| name | text | Nombre del negocio |
| is_active | boolean | |
| businessMode | text | 'store' \| 'restaurant' |
| country | text | ISO-2 (CL, AR, MX…) |
| lat | numeric | Latitud (agregado 20260605) |
| lng | numeric | Longitud (agregado 20260605) |
| print_legend | text | Texto para tickets de impresión |
| catalog_seo_content | jsonb | Contenido SEO del catálogo |
| social_links | jsonb | Links redes sociales |

**`wa_products`** — Productos del catálogo
| Columna relevante | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| business_id | UUID | FK a wa_businesses |
| name | text | |
| slug | text | URL única del producto |
| price | numeric | |
| compare_at_price | numeric | Precio tachado (antes) |
| is_active | boolean | |
| is_draft | boolean | Borrador, no visible |
| is_sold_out | boolean | Agotado |
| is_main_featured | boolean | Destacado en TPV |
| status | text | 'active' \| 'inactive' |
| thumbnail_url | text | Thumbnail procesado |
| card_image | text | Imagen para tarjeta |
| video_url | text | Video del producto |
| long_description | text | Descripción extendida |
| add_ons | jsonb | Complementos/variantes |
| combo_config | jsonb | Config combos |

**`wa_orders`** — Pedidos
| Columna relevante | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| business_id | UUID | FK |
| order_status | text | 'pending' \| 'confirmed' \| 'delivered' \| 'cancelled' |
| paid_at | timestamptz | Fecha de pago |
| updated_at | timestamptz | |

**`wa_customers`** — Clientes (CRM)
- CRUD completo de clientes vinculados al negocio
- Agregado en migración `20260428000000_wa_customers.sql`

**`business_domains`** — Dominios personalizados
| Columna | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| business_id | UUID | FK · único (un dominio por negocio) |
| domain | text | Ej: `catalogo.minegocio.com` |
| status | text | 'pending' \| 'active' \| 'error' |
| vercel_config | jsonb | DNS instructions reales de Vercel |

**`wa_catalog_visits`** — Visitas al catálogo
- Con columna `source` (migración `20260409100000`)

**`wa_site_visits`** — Visitas al sitio
- Migración `20260409110000`

**`wa_admin_settings`** — Configuración interna admin
- Migración `20260409120000`

**`wa_business_categories`** — Categorías de productos
- Migración `20260406200000`

### RPCs (Funciones PostgreSQL expuestas via API)

| Función | Acceso | Propósito |
|---------|--------|-----------|
| `get_slug_by_custom_domain(p_domain text)` | anon + authenticated | Dado un dominio, devuelve el slug del negocio activo |
| `get_active_custom_domain(p_slug text)` | anon + authenticated | Dado un slug, devuelve el dominio activo configurado |
| `wa_handle_new_user_business` | trigger | Crea negocio + trial PRO 14 días al registrarse |

Ambas RPCs son `SECURITY DEFINER` para bypass de RLS (necesario para acceso desde catálogos públicos sin autenticación).

### Migraciones cronológicas (últimas relevantes)

```
20260406 — Social links, categorías de negocio
20260409 — Visitas catálogo con source, visitas sitio, admin settings
20260411 — Long description en productos
20260413 — Compare at price (precio anterior tachado)
20260417 — Vista admin para visitas catálogo
20260421 — Video en productos
20260422 — SEO content para catálogo, is_draft en productos
20260424 — Welcome queue + admin alerts
20260428 — Tabla wa_customers (CRM)
20260429 — business_mode, add_ons, is_main_featured, combo_config, is_sold_out
20260501 — card_image, print_legend, thumbnail_url
20260503 — Backoff en admin alert queue
20260510 — Deshabilitar automatización email interna
20260515 — slug en wa_products
20260517 — Campos email en recibo de suscripción
20260605 — lat/lng en wa_businesses, RPCs custom domain, vercel_config JSONB
```

---

## 5. MAPA FUNCIONAL COMPLETO

### 5.1 Catálogo Público (público, sin login)

**URL**: `/catalogo/:slug` o `/catalog/:slug` o dominio custom `/`

- Muestra productos del negocio agrupados por categoría
- Cada producto tiene imagen, nombre, precio, precio comparativo, descripción
- Productos pueden marcarse como agotados o draft (ocultos)
- Botón "Pedir por WhatsApp" abre WhatsApp con mensaje pre-armado
- Carrito de compras integrado (CartProvider)
- Share: WhatsApp, copiar link, QR code
- OG tags inyectados server-side por `api/seo.js` para previews en redes sociales
- Mapa de ubicación del negocio (Leaflet) si tiene lat/lng configurado
- Dos layouts soportados: tienda y restaurante

**URL de producto individual**: `/p/:businessSlug/:productSlug`
- Página dedicada para compartir producto específico

**URL de ofertas**: `/catalogo/:slug/ofertas`
- Sección de productos en oferta

### 5.2 Checkout / Confirmación de pedido (público)

**URL**: `/catalogo/:slug/checkout` o `/catalog/:slug/checkout`

- Formulario con datos del cliente
- Resumen del carrito
- Envío del pedido a WhatsApp del negocio
- Almacenamiento del pedido en base de datos

### 5.3 Dashboard (privado)

**URL**: `/dashboard`

**Widgets disponibles:**
- `MetricCard` — Métricas clave (ventas, pedidos)
- `DailyRevenueCard` — Ingresos del día
- `MonthlyRevenueCard` — Ingresos del mes
- `OrdersByDayCard` — Pedidos por día (gráfico)
- `ConversionFunnelCard` — Embudo de conversión
- `TopProductsCard` — Productos más vendidos
- `AiInsightsCard` — Insights IA (Gemini)
- `ActivityFeed` — Feed de actividad reciente
- `CatalogLinkWidget` — Link rápido al catálogo
- `GettingStartedSection` — Guía de inicio para nuevos usuarios
- `AddProductHero` — CTA para agregar primer producto
- `PlanUsageCard` — Uso del plan actual
- `TrialConversionBanner` — Banner de conversión durante trial
- `DailyMessageCard` — Mensaje del día
- `QuickAccessWidget` — Accesos rápidos
- `NewOrderToast` — Toast de nuevos pedidos en tiempo real
- `NotificationBell` — Campana de notificaciones
- `OgShareGuardModal` — Modal que recuerda configurar OG image

### 5.4 Gestión de Productos

**URL**: `/product-management`
- Lista de productos con filtros
- Toggle activo/inactivo
- Control de stock: is_sold_out
- Límites según plan (Starter: 20, Pro: 100, Business: ilimitado)
- Aviso cuando se acerca al límite (80% threshold)

**URL**: `/product-editor`
- Editor de producto completo
- Upload de imágenes (Cloudflare R2 vía Edge Function)
- Upload de video
- Precio y precio comparativo (precio tachado)
- Descripción corta y larga
- Add-ons / variantes (jsonb)
- Combo config (jsonb)
- SEO: slug único
- Estado: draft, active, inactive, sold_out
- is_main_featured: destacado en TPV

### 5.5 Gestión de Pedidos

**URL**: `/orders`
- Vista Kanban con columnas por estado
- Estados: Pendiente → Confirmado → Entregado (o Cancelado)
- Drawer de detalle del pedido
- Toggle de estado de pago
- Modal de impresión del pedido

**URL**: `/orders/historial`
- Historial completo de pedidos

### 5.6 Configuración del Negocio

**URL**: `/business-configuration`

**Secciones:**
- `LogoUpload` — Logo y cover del negocio
- `StoreHeaderCard` — Nombre, descripción, teléfono
- `RubroPrincipalSelector` — Rubro/categoría del negocio
- `BusinessCategoriesManager` — Categorías de productos
- `DeliveryOptions` — Opciones de entrega/envío
- `PaymentMethods` — Métodos de pago aceptados
- `BusinessHours` — Horarios de atención
- `LocationPicker` — Selector de ubicación con mapa Leaflet (Nominatim/OpenStreetMap)
- `WhatsAppMessageTemplate` — Template de mensaje WhatsApp
- `CatalogLayoutSettings` — Layout del catálogo (tienda/restaurante)
- `DesignSettings` — Colores y tipografía
- `CustomDomainSection` — Dominio personalizado (integración Vercel API)
- `InstallAppBlock` — Instalar PWA
- `SaveBar` — Barra de guardado con indicadores de cambios

**LocationPicker**: flujo de 4 pasos:
1. Búsqueda por texto (Nominatim API)
2. Selección del resultado
3. Confirmación en mapa (Leaflet interactivo)
4. Guardado de lat/lng

**CustomDomainSection**: flujo completo:
1. Input del dominio
2. Llamada a Edge Function `manage-custom-domain` con action=add
3. Muestra instrucciones DNS reales (obtenidas de Vercel API)
4. Botón "Verificar" llama con action=verify
5. Estado: pending → active (badge visual)
6. Estado activo muestra tarjeta especial con link al catálogo

### 5.7 Diseño del Catálogo

**URL**: `/design`
- Colores primarios/secundarios
- Tipografía
- Preview en tiempo real del catálogo

### 5.8 Módulo CRM / Clientes

**URL**: `/customers/:customerId`
- Ficha completa del cliente
- Historial de pedidos
- Datos de contacto

**Nota**: Los módulos de presupuestos, facturación interna, TPV y centro de costos descritos por el fundador están planificados o en desarrollo pero no aparecen como rutas en el router actual. Pueden estar implementados como sub-secciones del dashboard o en desarrollo activo.

### 5.9 Planes y Billing

**URL**: `/planes` o `/plan-y-facturacion` (ambas van al mismo componente)
- Comparativa de planes
- Botones de upgrade/downgrade
- Estado de suscripción actual
- Período de trial

**URL pública**: `/plans`
- Página pública de precios (sin login)

### 5.10 Panel de Administración Interno

**URL**: `/admin/*` (requiere rol admin)

| Sub-ruta | Descripción |
|----------|-------------|
| `/admin/businesses` | Lista de negocios registrados |
| `/admin/businesses/:id` | Detalle de negocio |
| `/admin/users` | Lista de usuarios |
| `/admin/users/:id` | Detalle de usuario |
| `/admin/users/new` | Crear usuario |
| `/admin/payments` | Pagos y suscripciones |
| `/admin/audit-log` | Log de auditoría |
| `/admin/emails` | Gestión de emails |
| `/admin/config/rubros` | Configuración de rubros/categorías |

---

## 6. RUTAS DE LA APLICACIÓN

### Rutas públicas (sin login)

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/` | GoRootEntry | Resolución dinámica: custom domain → catálogo, go.ventalink.app → dashboard/login |
| `/catalogo/:slug` | PublicCatalog | Catálogo del negocio |
| `/catalog/:slug` | PublicCatalog | Alias inglés |
| `/catalogo/:slug/checkout` | OrderConfirmation | Checkout |
| `/catalog/:slug/checkout` | OrderConfirmation | Checkout (alias) |
| `/catalogo/:slug/ofertas` | PublicOffers | Ofertas |
| `/p/:businessSlug/:productSlug` | PublicProductPage | Producto individual |
| `/catalogo/:businessSlug/producto/:productSlug` | PublicProductPage | Alias |
| `/plans` | PublicPricingPage | Precios públicos |
| `/terms` | TermsPage | Términos |
| `/privacy` | PrivacyPage | Privacidad |
| `/refunds` | RefundsPage | Reembolsos |
| `/landing-page` | LandingPage | Landing marketing |
| `/login` | Login | Login |
| `/verify-email` | VerifyEmailPage | Verificación email |
| `/auth/callback` | AuthCallback | OAuth callback |
| `/auth/reset-password` | ResetPassword | Reset password |
| `/reset-password` | ResetPassword | Reset password (alias) |
| `/elegir-pais` | CountrySelectPage | Selección de país |
| `/business-registration` | BusinessRegistration | Registro de negocio |
| `/register` | BusinessRegistration | Alias |
| `/billing/dlocal/return` | DLocalReturnPage | Retorno dLocal |
| `/billing/success` | BillingSuccessPage | Éxito de pago |
| `/billing/cancel` | BillingCancelPage | Pago cancelado |
| `/billing/paypal/success` | PaypalSuccessPage | Éxito PayPal |
| `/billing/paypal/cancel` | BillingCancelPage | Cancelación PayPal |

### Rutas privadas (requieren auth)

| Ruta | Descripción |
|------|-------------|
| `/complete-business-setup` | Completar setup inicial |
| `/business-configuration` | Configuración del negocio |
| `/product-management` | Gestión de productos |
| `/product-editor` | Editor de producto |
| `/dashboard` | Dashboard principal |
| `/orders` | Pedidos (Kanban) |
| `/orders/historial` | Historial de pedidos |
| `/customers/:customerId` | Ficha de cliente |
| `/design` | Diseño del catálogo |
| `/ayuda` | Centro de ayuda |
| `/planes` | Planes (alias: `/plan-y-facturacion`) |

### Rutas admin (requieren rol admin)

`/admin` → `/admin/businesses` → `/admin/users` → `/admin/payments` → `/admin/audit-log` → `/admin/emails` → `/admin/config/rubros`

---

## 7. FLUJOS DE USUARIO

### 7.1 Flujo de registro y onboarding

```
1. Usuario accede a /register o /business-registration
2. Se registra con email o Google (Supabase Auth)
3. Trigger wa_handle_new_user_business crea negocio + trial PRO 14 días
4. Redirige a /elegir-pais (selección de país → determina billing provider)
5. Redirige a /complete-business-setup (nombre, rubro, teléfono)
6. Llega a /dashboard con GettingStartedSection visible
7. GettingStartedSection guía: agregar producto → ver catálogo → compartir
```

**Punto de fricción detectado**: Los pasos 4 y 5 (país + setup) generan abandono. El fundador quiere reducir a 1 paso o diferirlos.

### 7.2 Flujo de catálogo a pedido (usuario final)

```
1. Cliente recibe link de catálogo (WhatsApp, Instagram, etc.)
2. Accede a /catalogo/:slug (o dominio custom)
3. api/seo.js inyecta OG tags con branding del negocio (para preview WhatsApp)
4. SPA carga, muestra catálogo
5. Cliente agrega productos al carrito
6. Click "Pedir por WhatsApp" → abre WhatsApp con mensaje pre-armado
7. Pedido se guarda en wa_orders
8. Dueño del negocio ve el pedido en /orders
```

### 7.3 Flujo de dominio personalizado

```
1. Dueño configura dominio en /business-configuration → CustomDomainSection
2. Ingresa dominio (ej: catalogo.minegocio.com)
3. Frontend llama Edge Function manage-custom-domain con action=add
4. Edge Function registra dominio en Vercel API, obtiene DNS reales
5. Guarda vercel_config en business_domains
6. Muestra instrucciones DNS exactas al usuario
7. Usuario configura DNS en su proveedor
8. Usuario hace click "Verificar" → llama con action=verify
9. Edge Function consulta estado en Vercel, actualiza status en DB
10. Cuando status='active', el catálogo responde desde el dominio custom
11. api/seo.js en modo custom-domain inyecta OG tags del negocio
12. GoRootEntry en SPA resuelve dominio → slug → renderiza catálogo
```

### 7.4 Flujo de upgrade de plan

```
1. Usuario en /planes ve planes disponibles
2. Click en "Subir a Pro" o "Subir a Full"
3. Sistema detecta provider según país (CL/AR → MercadoPago, resto → PayPal)
4. Redirige a checkout del provider
5. Provider callback → /billing/success o /billing/paypal/success
6. Edge Function actualiza suscripción en DB
7. Límites del plan se amplían inmediatamente
```

### 7.5 Flujo de AI Insights (Dashboard)

```
1. Dashboard carga AiInsightsCard
2. Card llama Edge Function dashboard-ai-insights con JWT del usuario
3. Edge Function obtiene datos de wa_orders, wa_products del negocio
4. Construye prompt con datos reales y envía a Google Gemini
5. Gemini devuelve JSON: { hallazgo, alerta, accion, prioridad }
6. Card muestra insight con indicador de prioridad (Alta/Media/Baja)
```

---

## 8. MODELO DE NEGOCIO

### 8.1 Propuesta de valor

- **Para negocios sin presencia digital**: primer catálogo online en minutos, sin técnicos
- **Para negocios en WhatsApp**: orden en el proceso caótico de pedidos por chat
- **Para comerciantes formales**: TPV simple + control financiero sin pagar un ERP

### 8.2 Fuente de ingresos

**Modelo Freemium con suscripción mensual.**

- **Starter** (gratuito): lead magnet, genera top of funnel, conversión a pago cuando alcanzan límites
- **Pro**: primer nivel de pago, debloquea la mayor parte de funcionalidades
- **Business (Full)**: nivel premium, incluye todo sin límites

**La conversión ocurre cuando:**
1. El usuario llega al límite de 20 productos (principal trigger)
2. El usuario quiere estadísticas (bloqueadas en Starter)
3. El usuario quiere IA (bloqueada o limitada en Starter)
4. Trial PRO de 14 días expira

### 8.3 Estrategia go-to-market

- Viral orgánico: cada catálogo compartido por WhatsApp expone el dominio `miralatienda.de` o `ventalink.app` a potenciales nuevos usuarios
- Cada pedido recibido es exposición de marca para el cliente final del merchant
- Link en el footer del catálogo público = growth loop orgánico

### 8.4 Retención

- La herramienta se vuelve crítica cuando el negocio tiene pedidos diarios → churn costoso
- Datos históricos (pedidos, clientes, ventas) = lock-in natural

---

## 9. SISTEMA DE PLANES Y BILLING

### 9.1 Definición de planes

| Plan | Slug DB | Label UI | Productos | Pedidos/mes | Estadísticas | IA | TPV/CRM |
|------|---------|----------|-----------|-------------|-------------|-----|---------|
| Starter | `starter` | Starter | 20 | 50 | No | No | No |
| Pro | `pro` | Pro | 100 | Ilimitados | Sí | Sí (limitada) | Parcial |
| Business | `business` | Full | Ilimitados | Ilimitados | Completas | Ilimitada | Completo |

**Trial**: Nuevos usuarios obtienen 14 días de Pro automáticamente (`TRIAL_DURATION_DAYS = 14`).

**Umbral de alerta**: Al 80% del uso del límite se muestran alertas (`PLAN_WARN_THRESHOLD = 0.80`).

### 9.2 Precios por región

| Plan | CL (CLP) | AR (ARS) | Internacional (USD) |
|------|----------|----------|---------------------|
| Starter | $0 | $0 | $0 |
| Pro | $5.990 | $8.990 | $6 |
| Business | $9.990 | $13.990 | $10 |

### 9.3 Proveedores de pago por país

| País | Proveedor | Moneda |
|------|-----------|--------|
| Chile (CL) | Mercado Pago | CLP |
| Argentina (AR) | Mercado Pago | ARS |
| México (MX) | PayPal | USD |
| Paraguay (PY) | PayPal | USD |
| Resto LATAM | PayPal | USD |
| dLocal | Deshabilitado en producción (`isDlocalFeatureEnabled() = false`) | — |
| Stripe | Referenciado en código, no activo | — |
| Paddle | Edge Function existe, no activo como principal | — |
| Manual | Reservado para activaciones manuales por admin | — |

### 9.4 Lógica de cambio de plan

La Edge Function `plan-change-preview` calcula prórrata al cambiar de plan:
- Upgrade: cobra diferencia prorrateada inmediatamente
- Downgrade: aplica al siguiente ciclo

La Edge Function `apply-scheduled-plan-changes` aplica los cambios programados.

---

## 10. INTEGRACIONES EXTERNAS

### 10.1 Mercado Pago
- **Uso**: Suscripciones mensuales para Chile y Argentina
- **Flujo**: Frontend → Edge Function `create-mp-preference` → Redirige a MP → Webhook `mp-webhook` actualiza suscripción
- **Archivo**: `api/billing.js` + `supabase/functions/create-mp-preference/`

### 10.2 PayPal
- **Uso**: Suscripciones para mercado internacional (no CL/AR)
- **Flujo**: Frontend → `api/paypal.js` → SDK PayPal → Webhook `/webhooks/paypal` → `api/paypal-webhook.js`
- **Scripts diagnóstico**: `paypal-auth-diagnostic.js`, `paypal-catalog-bootstrap.js`, `paypal-plan-mapping-diagnostic.js`

### 10.3 Google Gemini (AI)
- **Paquetes**: `@google/genai` y `@google/generative-ai`
- **Uso 1**: Dashboard AI Insights (Edge Function `dashboard-ai-insights`)
- **Uso 2**: Probablemente en generación de OG images o descripciones
- **Formato respuesta AI**: JSON estricto `{ hallazgo, alerta, accion, prioridad }`

### 10.4 OpenAI (gpt-4o-mini)
- **Uso**: Edge Function `improve-product-description` — optimiza título y descripción de productos
- **Límite entrada**: 300 caracteres
- **Límite descripción salida**: 280 caracteres (truncado en word boundary)

### 10.5 Resend (Email)
- **Uso**: Emails transaccionales vía Edge Function `send-email`
- **Cola**: `process-email-queue` procesa emails pendientes

### 10.6 Loops (Email Marketing)
- **Uso**: Onboarding secuencias, activación
- **Archivos**: `src/services/loopsClient.js`, `api/loops/`

### 10.7 Cloudflare R2 (Storage)
- **Uso**: Imágenes de productos, videos, OG images
- **Upload**: Edge Functions `upload-image-r2`, `upload-video-r2`
- **Script backfill**: `scripts/migrate-images-to-r2.mjs`

### 10.8 Vercel Domains API
- **Uso**: Registro y verificación de dominios personalizados de merchants
- **Endpoints usados**:
  - `POST /v10/projects/{id}/domains` — Registrar dominio
  - `GET /v9/projects/{id}/domains/{domain}` — Estado de verificación
  - `GET /v6/domains/{domain}/config` — Configuración DNS real
- **Sin VERCEL_TEAM_ID**: cuenta personal Vercel
- **Env vars requeridas**: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`

### 10.9 OpenStreetMap / Nominatim / Leaflet
- **Uso**: Selector de ubicación en configuración de negocio y mapa en catálogo público
- **Paquetes**: `leaflet@1.9.4`, `react-leaflet@4.2.1` (v4 = compatible React 18)
- **Nominatim**: Geocodificación gratuita (buscar dirección → lat/lng)

---

## 11. LÓGICA DE DOMINIOS PERSONALIZADOS (DETALLE TÉCNICO)

Esta es una de las funciones más complejas y recientes. Requiere entendimiento en 3 capas:

### Capa 1: SEO/OG (Vercel Serverless — `api/seo.js`)

Cuando un crawler (WhatsApp, Facebook, Google) accede a `https://catalogo.minegocio.com/`:
1. Vercel rewrite: `"source": "/"` → `destination: "/api/seo?mode=custom-domain"`
2. `api/seo.js` en modo `custom-domain`:
   - Lee header `x-forwarded-host` para obtener el hostname
   - Si es un host SaaS → sirve `index.html` directamente
   - Si es dominio custom → llama RPC `get_slug_by_custom_domain` con anon key
   - Obtiene datos del negocio (nombre, logo, descripción)
   - Inyecta OG tags personalizados en el HTML
   - Devuelve HTML con branding del merchant (no de Ventalink)

### Capa 2: SPA React (`src/Routes.jsx` — `GoRootEntry`)

Cuando el navegador carga la SPA:
1. `GoRootEntry` detecta el hostname actual
2. Si es un host SaaS conocido → flujo normal (login/dashboard)
3. Si es dominio desconocido (custom) → llama `getBusinessSlugByDomain(hostname)`
4. Si encuentra slug → renderiza `<PublicCatalog slugOverride={slug} />`
5. Si no encuentra → muestra 404 o login

### Capa 3: URLs generadas (`src/config/appUrl.js`)

Para que todos los links del catálogo usen el dominio custom (no `miralatienda.de`):
- `getEffectiveCatalogUrl(slug, customDomain?)` — URL del catálogo
- `getEffectiveCatalogBaseUrl(customDomain?)` — Base URL
- `getEffectiveOffersUrl(slug, customDomain?)` — URL de ofertas
- `getEffectiveProductUrl(business, product, customDomain?)` — URL de producto
- Prioridad: parámetro explícito > hostname actual si es custom > CATALOG_ORIGIN

**`customDomain` se carga en el catálogo así:**
```js
const [customDomain, setCustomDomain] = useState(isCustomDomainHost() ? window.location.hostname : null);
// + llamada a getBusinessCustomDomain(slug) al cargar
```

---

## 12. ANÁLISIS UX/UI

### 12.1 Fortalezas actuales

- **Tailwind CSS** con componentes bien estilizados
- **Framer Motion** para animaciones fluidas
- **react-leaflet** para mapas interactivos modernos
- **react-hook-form** para formularios con validación
- **Kanban de pedidos** — interfaz familiar y visual para el dueño del negocio
- **PremiumLoader** — loader de pantalla completa mientras carga datos críticos
- **AnimatedLayout** — transiciones entre rutas
- **Dashboard con múltiples widgets** — información densa pero organizada

### 12.2 Problemas UX detectados por el fundador

**Pantallas vacías:**
- Cuando un módulo no tiene datos (sin productos, sin pedidos), el usuario ve pantallas vacías sin guía
- **Solución**: Empty states educativos con CTA claros (el `AddProductHero` y `GettingStartedSection` van en esta dirección)

**Falta de onboarding contextual:**
- El usuario nuevo no sabe qué hacer después de registrarse
- El `GettingStartedSection` existe pero puede no ser suficientemente guiado
- **Solución**: Checklist interactivo de onboarding, tooltips contextuales

**Jerarquía visual inconsistente:**
- Algunos módulos parecen administrativos y áridos
- Falta sensación de "producto premium"
- **Solución**: Tarjetas con sombras, colores de acento, iconografía consistente

**Buscadores inconsistentes:**
- El TPV tiene problemas históricos con el buscador
- Búsqueda por texto sin debounce o con UX confusa

**Demasiados clics:**
- Configuraciones que deberían ser directas requieren múltiples pasos
- **Ejemplo**: Configurar método de pago requiere navegar a business-configuration

**El TPV específicamente:**
- Jerarquía visual mejorable
- Flujo de búsqueda + selección de productos con fricción
- El carrito y el proceso de pago necesitan más claridad visual

### 12.3 Recomendaciones UX prioritarias

1. **Onboarding progresivo**: Mostrar checklist de 3-5 pasos en dashboard hasta completarlos
2. **Empty states con valor**: En módulo vacío, mostrar qué se desbloquea + cómo empezar
3. **Toasts de éxito accionables**: "Producto guardado → Ver en catálogo / Agregar otro"
4. **Mobile-first TPV**: El TPV probablemente se usa en tablet/móvil en el punto de venta
5. **Shortcuts de teclado en TPV**: Para velocidad en caja

---

## 13. ANÁLISIS SaaS

### 13.1 Métricas clave a monitorear (y que el sistema ya rastrea)

- **Visitas al catálogo** (`wa_catalog_visits`) por negocio
- **Clicks en WhatsApp** desde catálogo (`wa_catalog_whatsapp_click`)
- **Visitas al sitio** (`wa_site_visits`)
- **Pedidos creados** (wa_orders)
- **Conversión**: clicks WhatsApp / visitas catálogo = tasa de interés del catálogo
- **Activación**: nuevo usuario con ≥1 producto activo ≤24h
- **Retención**: negocios activos con pedidos en los últimos 30 días
- **Churn**: suscripciones canceladas / expiradas

### 13.2 Palancas de growth

**Viral loop orgánico:**
- Cada catálogo compartido es publicidad gratuita
- Footer del catálogo público (si existe) lleva a ventalink.app
- Pedidos WhatsApp exponen la plataforma a potenciales usuarios

**Expansión por producto:**
- Trial 14 días Pro → conversión urgente al expirar
- Límite 20 productos Starter → conversión natural cuando el negocio crece

**Network effects débiles (oportunidad):**
- Actualmente no hay red entre merchants
- Oportunidad: marketplace de catálogos por ciudad/categoría

### 13.3 Riesgos de retención

- Si el merchant migra a otra plataforma, pierde historial de pedidos (lock-in moderado)
- Si un competidor ofrece TPV + catálogo a menor precio, churn
- Si WhatsApp cambia su API o política, el core del producto se afecta

---

## 14. ANÁLISIS COMPETITIVO

### 14.1 Competidores directos (LATAM)

| Competidor | Fortaleza | Debilidad vs Ventalink |
|-----------|-----------|----------------------|
| Tiendanube | Marca fuerte, ecosistema | Complejo, más caro, no WhatsApp-first |
| Shopify | Global, robusto | Muy caro para pequeños, en inglés primero |
| Wix/Woocommerce | Flexible | No WhatsApp-first, requiere configuración técnica |
| WhatsApp Business | Familiar | Sin catálogo ordenado ni pedidos estructurados |
| Jumpseller | LATAM | Sin TPV, sin WhatsApp nativo |
| Catálogos en Google Sheets/PDF | Gratuito | Sin gestión, sin pedidos automáticos |

### 14.2 Diferenciadores clave de Ventalink

1. **WhatsApp-first**: el flujo de pedido termina en WhatsApp, donde ya opera el negocio
2. **Catálogo + TPV + CRM en uno**: sin cambiar de herramienta
3. **Control financiero simple**: centro de costos con semáforo (qué no tienen los competidores e-commerce)
4. **Dominio personalizado**: el merchant puede tener `catalogo.minegocio.com` automáticamente
5. **IA integrada**: mejora de descripciones + insights de negocio
6. **Sin fricción técnica**: no requiere hosting, dominio propio, SSL, etc.

### 14.3 Posicionamiento recomendado

**"La herramienta que el pequeño negocio latinoamericano necesita para vender más hoy"** — no un ERP, no una tienda complicada. Un asistente de ventas.

---

## 15. PROBLEMAS DETECTADOS

### 15.1 Técnicos (resueltos recientemente)

- **Custom domain routing a /login**: `GoRootEntry` no detectaba dominios custom y redirigía al login → Resuelto con resolución de dominio antes del check de auth
- **RLS bloqueando catálogos en dominios custom**: Las RPCs necesitaban SECURITY DEFINER para acceso anon → Resuelto
- **Links de share usando miralatienda.de en vez de dominio custom**: `getEffectiveCatalogUrl` no recibía el `customDomain` → Resuelto cargando desde DB
- **Preview WhatsApp sin branding del merchant**: OG tags genéricos → Resuelto con `api/seo.js` modo custom-domain
- **Edge Function no era llamada** (URL malformada por env var vacía): Cambio de `fetch()` a `supabase.functions.invoke()` → Resuelto
- **DNS hardcodeado** (`cname.vercel-dns.com`): Vercel asigna CNAME único por proyecto → Resuelto obteniendo de `/v6/domains/{domain}/config`
- **react-leaflet v5 incompatible con React 18**: Downgrade a v4 → Resuelto

### 15.2 Técnicos (pendientes o por monitorear)

- **Bundle size**: 3.1MB sin chunking. `(!)` en el build. Impacta First Contentful Paint.
  - **Solución**: Dynamic imports con React.lazy/Suspense para rutas pesadas
- **Migración vercel_config**: La columna debe ejecutarse en producción antes de que funcione el sistema de DNS real
- **Env vars Edge Function**: `VERCEL_TOKEN` y `VERCEL_PROJECT_ID` deben configurarse en Supabase Dashboard

### 15.3 UX/Producto

- **Onboarding con fricción**: Pasos de país y setup inmediatamente después del registro
- **TPV con problemas de búsqueda y selección**: Detectado históricamente, no completamente resuelto
- **Pantallas vacías sin guía**: Módulos sin datos no educen al usuario
- **Módulo CRM incompleto**: Presupuestos, facturas internas, terminal y costos están en roadmap pero no completamente implementados

---

## 16. RIESGOS DEL PROYECTO

### 16.1 Riesgos técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Dependencia de WhatsApp | Media | Alto | Diversificar canales (email, Instagram DM) |
| Supabase downtime | Baja | Alto | SLA Supabase Pro, fallbacks en frontend |
| Vercel Domains API cambio | Baja | Medio | Almacenar DNS en vercel_config, no re-consultar |
| PayPal cierre de cuenta merchant | Baja | Alto | Tener dLocal o Stripe como fallback listo |
| Bundle size creciente | Alta | Medio | Code splitting obligatorio antes de siguiente release grande |
| RLS gaps en tablas nuevas | Media | Alto | Revisar policies en cada migración |

### 16.2 Riesgos de negocio

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Competidor con más recursos | Media | Alto | Velocidad de ejecución + nicho WhatsApp |
| Churn por friction en onboarding | Alta | Medio | Simplificar registro → primero el catálogo |
| Precio demasiado bajo | Media | Medio | Benchmark vs competidores al escalar |
| Dependencia de un solo fundador técnico | Alta | Alto | Documentación (este documento), tests |

---

## 17. OPORTUNIDADES ESTRATÉGICAS

### 17.1 Inmediatas (impacto en retención y activación)

1. **Onboarding rediseñado**: registro → catálogo en <2 minutos sin fricción de país
2. **Notificaciones push (PWA)**: alertas de nuevos pedidos en tiempo real, diferenciador vs WhatsApp Business puro
3. **Compartir catálogo mejorado**: botón "Copiar link" + Vista previa del OG card antes de compartir
4. **Templates de productos**: si vendes ropa, carga 10 productos de ejemplo con un click

### 17.2 Mediano plazo (impacto en diferenciación)

5. **Generador de códigos de barras**: asignar SKU + generar EAN/QR, imprimir hojas A4
6. **Etiquetas para productos**: 30x20mm con nombre + precio + código, impresión masiva
7. **TPV mejorado**: escaneo de código de barras, favoritos, búsqueda mejorada
8. **Facturación integrada** (con API SII para Chile, AFIP para Argentina): diferenciador enorme
9. **Reportes exportables**: PDF/Excel de ventas, clientes, stock — muy pedido por negocios formales

### 17.3 Largo plazo (impacto en modelo de negocio)

10. **Marketplace por ciudad**: directorio público de negocios Ventalink → tráfico orgánico
11. **Integraciones contables**: Conector con Nubox, Alegra, Contabilium
12. **API pública para merchants**: conectar con sistemas propios
13. **Ventalink para equipos**: multi-usuario por negocio (caja + dueño + vendedor)
14. **IA para compras**: "Estos productos se están agotando, pide stock" basado en patrones
15. **Pagos online integrados**: checkout con tarjeta directo en el catálogo (sin saltar a WhatsApp)

---

## 18. ROADMAP RECOMENDADO

### Fase 1 — Estabilidad y Activación (0-2 meses)

**Objetivo**: Reducir churn en primeros 7 días, mejorar activación.

| # | Tarea | Impacto | Esfuerzo |
|---|-------|---------|----------|
| 1 | Simplificar onboarding (país + setup en 1 pantalla) | Alto | Medio |
| 2 | Empty states con guía en todos los módulos | Alto | Bajo |
| 3 | Code splitting del bundle (lazy loading) | Medio | Medio |
| 4 | Ejecutar migraciones pendientes (vercel_config, lat/lng) | Alto | Bajo |
| 5 | Notificaciones push PWA para nuevos pedidos | Alto | Medio |
| 6 | Fix TPV: buscador y selección de productos | Medio | Medio |

### Fase 2 — Diferenciación (2-4 meses)

**Objetivo**: Features que el competidor no tiene.

| # | Tarea | Impacto | Esfuerzo |
|---|-------|---------|----------|
| 7 | Generador de códigos de barras (SKU → EAN/QR) | Alto | Medio |
| 8 | Impresión de etiquetas 30x20mm | Alto | Medio |
| 9 | Escáner de código de barras en TPV | Alto | Medio |
| 10 | Presupuestos/Cotizaciones (CRM) | Alto | Alto |
| 11 | Centro de costos con semáforo financiero | Alto | Medio |
| 12 | Reportes exportables (PDF/Excel) | Medio | Medio |

### Fase 3 — Escala (4-8 meses)

**Objetivo**: Abrir nuevos segmentos y revenue.

| # | Tarea | Impacto | Esfuerzo |
|---|-------|---------|----------|
| 13 | Multi-usuario por negocio (vendedor/dueño) | Alto | Alto |
| 14 | Pagos online en catálogo (sin WhatsApp) | Muy Alto | Alto |
| 15 | Facturación con API tributaria (SII/AFIP) | Muy Alto | Muy Alto |
| 16 | Marketplace público de negocios | Medio | Alto |
| 17 | IA proactiva: alertas de stock, sugerencias de precio | Medio | Medio |

---

## 19. FUNCIONALIDADES DIFERENCIADORAS

**Diferenciadores actuales que deben protegerse y mejorarse:**

1. **WhatsApp-first checkout**: El pedido llega al WhatsApp del dueño. Simple, familiar, sin fricción para el cliente final.

2. **Dominio personalizado automático**: Un merchant puede tener `catalogo.gong.cl` en minutos sin conocimiento técnico. Nadie más en LATAM hace esto tan fácil.

3. **OG tags personalizados por merchant**: Cuando se comparte el catálogo por WhatsApp, aparece el logo y nombre del negocio (no de Ventalink). Profesionaliza la imagen del merchant.

4. **Mapa de ubicación en el catálogo**: El cliente ve exactamente dónde está el negocio antes de ir.

5. **AI Insights de negocio**: Gemini analiza datos reales del negocio y da una acción concreta. No es genérico.

6. **Mejora de descripción con IA**: gpt-4o-mini optimiza el producto para vender mejor.

7. **Modo restaurante/tienda**: El catálogo se adapta al tipo de negocio automáticamente.

8. **Control de stock simple**: Marcar agotado/disponible con un toggle — no inventario complejo.

---

## 20. QUÉ CONSTRUIR PRIMERO / QUÉ POSPONER

### CONSTRUIR PRIMERO (máximo ROI inmediato)

1. **Simplificar onboarding** — Cada usuario que abandona en el registro es revenue perdido
2. **Empty states educativos** — La pantalla vacía es el mayor killer de activación
3. **Notificaciones push PWA** — El dueño necesita saber del pedido en tiempo real
4. **Fix TPV** — Si el TPV no funciona bien, el plan Business no se justifica
5. **Código de barras + etiquetas** — Feature pedida por negocios con stock físico, justifica upgrade a Business

### POSPONER

1. **Facturación tributaria (SII/AFIP)** — Alto esfuerzo, mucho riesgo legal, hay startups especializadas
2. **Marketplace de negocios** — Requiere masa crítica primero
3. **API pública** — Solo cuando haya developers que la quieran usar
4. **Multi-moneda en catálogo** — Complejidad alta para beneficio marginal ahora
5. **App nativa (iOS/Android)** — La PWA es suficiente y más barata de mantener

---

## 21. QUÉ FUNCIONALIDADES GENERAN VALOR INMEDIATO

**En próximas 2 semanas (under 3 days each):**
- Empty states con guía y CTAs
- Onboarding checklist en dashboard (3 pasos: agrega producto, configura WhatsApp, comparte)
- Toast de éxito accionable en Product Editor

**En próximo mes:**
- Notificaciones push nuevos pedidos
- Fix buscador TPV
- Página de producto mejorada (más grande, más visual)

**En próximos 2 meses:**
- Generador de código de barras básico
- Impresión de etiquetas
- Presupuestos desde CRM

---

## APÉNDICE A — INVENTARIO TÉCNICO COMPLETO

### A.1 Variables de entorno (referencias en código)

**Frontend (VITE_*)**

| Variable | Propósito | Requerida |
|----------|-----------|-----------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Clave anon Supabase | ✅ |
| `VITE_AI_PRODUCT_DESCRIPTION_URL` | Endpoint IA para descripciones | Opcional |
| `VITE_APP_URL` | URL del frontend | Opcional |
| `VITE_PUBLIC_CATALOG_URL` | Dominio catálogos (`miralatienda.de`) | Opcional |
| `VITE_CF_IMAGE_ORIGIN` | Origen Cloudflare Images | Opcional |
| `VITE_PRODUCT_IMAGE_MAX_BYTES` | Límite subida imágenes (default 10MB) | Opcional |
| `VITE_PLANS_SUPPORT_WHATSAPP` | WhatsApp soporte para planes | Opcional |

**Backend (api/ serverless)**

| Variable | Propósito |
|----------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso admin a Supabase |
| `PAYPAL_MODE` | `live` o `sandbox` |
| `PAYPAL_PLAN_ID_PRO_LIVE` | ID plan PayPal Pro |
| `PAYPAL_PLAN_ID_FULL_LIVE` | ID plan PayPal Business |
| `DLOCAL_BASE_URL` | URL API dLocal |
| `BILLING_DLOCAL_ENABLED` | Habilitar dLocal (default: false) |
| `EMAIL_AUTOMATION_ENABLED` | Emails automáticos (default: false) |
| `R2_ACCOUNT_ID` | Cloudflare R2 cuenta |
| `R2_ACCESS_KEY_ID` | Credencial R2 |
| `R2_SECRET_ACCESS_KEY` | Credencial R2 |
| `R2_BUCKET_NAME` | Bucket R2 |
| `R2_PUBLIC_URL` | URL pública de R2 |

**Edge Functions (Supabase)**

| Variable | Función que la usa |
|----------|--------------------|
| `VERCEL_TOKEN` | manage-custom-domain |
| `VERCEL_PROJECT_ID` | manage-custom-domain |
| `SUPABASE_URL` | todas |
| `SUPABASE_SERVICE_ROLE_KEY` | todas |

### A.2 Países soportados

15 países: `CL, AR, BO, BR, CO, CR, EC, ES, GT, MX, PA, PE, PY, US, UY`

Estados de mercado por país:
- **ACTIVE**: CL, AR (con billing local Mercado Pago)
- **ACTIVE (USD)**: MX, PY, BR, CO, PE, UY (PayPal)
- **BETA**: BO, EC
- **COMING_SOON / UNSUPPORTED**: resto

### A.3 Estadísticas del repositorio

| Métrica | Valor |
|---------|-------|
| Archivos JS/TS en src/ | ~266 |
| Componentes React en /components | ~45 |
| Páginas (routes) | 28 directorios |
| Tablas Supabase | 28 tablas identificadas |
| Edge Functions | 23 |
| Migraciones SQL | 102 |
| Rutas API serverless | 13+ endpoints |
| Proveedores de pago integrados | 4 (MP, PayPal, dLocal, Paddle) |

### A.4 Tablas Supabase completas (inventario del agente explorador)

**Negocio y Productos:**
- `wa_businesses`, `wa_products`, `wa_products_options`, `wa_product_categories`, `wa_business_categories`, `wa_customers`

**Pedidos y Transacciones:**
- `wa_orders`, `wa_order_items`, `wa_orders_archived_delivered_at`, `wa_catalog_visits`, `wa_catalog_whatsapp_clicks`, `wa_site_visits`

**Billing y Suscripciones:**
- `wa_subscriptions`, `wa_subscription_events`, `wa_payments`, `wa_payment_events`, `billing_subscriptions`, `billing_webhook_events`, `paypal_webhook_events`

**IA y Caché:**
- `wa_ai_product_description_cache`, `wa_ai_usage_log`, `wa_business_daily_ai_insights`

**Admin y Operaciones:**
- `wa_admin_audit_log`, `wa_admin_notifications`, `wa_admin_email_test_logs`, `wa_admin_settings`, `admin_alert_queue`, `email_queue`, `wa_email_logs`

**Configuración:**
- `wa_rubros`, `wa_rubro_categories`, `business_domains`

### A.5 Estructura backend/ (Node.js en api/)

```
api/
├── backend/
│   └── src/
│       ├── controllers/
│       │   ├── billingSubscriptionsController.js
│       │   ├── billingSubscriptionStateController.js
│       │   ├── dlocalBillingCallbackController.js
│       │   ├── dlocalBillingWebhookController.js
│       │   ├── paypalSubscriptionController.js
│       │   └── aiGenerateProductDescriptionController.js
│       ├── services/
│       │   ├── billing/
│       │   │   ├── billingSubscriptionService.js
│       │   │   ├── billingStatusMapper.js
│       │   │   ├── dlocalWebhookService.js
│       │   │   ├── eligibilityService.js
│       │   │   └── subscriptionReceiptService.js
│       │   ├── providers/
│       │   │   ├── dlocal/ (checkoutService, webhookService, testPayment)
│       │   │   └── paypal/ (authService, catalogService, subscriptionService, webhookVerifier)
│       │   └── loops/ (subscriptionReceiptEmail)
│       └── config/
│           └── paypal/ (index.js, constants.js)
```

### A.6 Estados de suscripción

```
trialing → active → (past_due → canceled | expired)
                 ↓
              suspended
```

Manejado por `src/lib/billing/subscriptionService.js` y la tabla `billing_subscriptions`.

### A.7 Emails y comunicaciones

**Tipos de email:**
- Welcome email al registro (via Loops)
- Activación a las 24h si no activó catálogo
- Resumen diario del negocio
- Recibo de suscripción
- Reset de contraseña (Supabase Auth nativo)

**Cola de emails:** Tabla `email_queue` procesada por Edge Function `process-email-queue`.

**Email automation deshabilitada**: La automatización interna fue deshabilitada en migración `20260510000000_disable_internal_email_automation.sql`. Loops es el canal activo.

---

## 22. CONTEXTO VIVO DEL PROYECTO

> Esta sección define qué actualizar en este documento después de cada deploy para mantener a NotebookLM sincronizado.

### Qué actualizar después de cada deploy

#### 22.1 Cambios de esquema de base de datos
Cuando se agrega una migración SQL nueva, actualizar:
- La tabla de migraciones en la sección 4 (Base de Datos)
- Si es una tabla nueva: agregar a la lista de tablas con sus columnas relevantes
- Si es una RPC nueva: agregar a la lista de RPCs
- Fecha y propósito de la migración

#### 22.2 Nuevas rutas
Cuando se agrega una ruta a `src/Routes.jsx`:
- Agregar a la tabla de Rutas (sección 6)
- Si es un módulo nuevo: agregar descripción en el Mapa Funcional (sección 5)
- Si es una ruta pública: verificar que `vercel.json` tiene el rewrite correcto

#### 22.3 Nuevas Edge Functions
Cuando se agrega en `supabase/functions/`:
- Agregar a la tabla de Edge Functions (sección 11)
- Si requiere env vars nuevas: documentarlas

#### 22.4 Cambios de planes/precios
Cuando se modifica `src/constants/plans.js`:
- Actualizar tabla de planes (sección 9.1)
- Actualizar tabla de precios por región (sección 9.2)

#### 22.5 Nuevas integraciones
Cuando se agrega un nuevo proveedor externo:
- Agregar sección en Integraciones Externas (sección 10)
- Mencionar en qué archivos vive la integración

#### 22.6 Cambios de arquitectura
Si cambia el stack, hosting, base de datos, o estructura de directorios:
- Actualizar el diagrama de arquitectura (sección 3.1)
- Actualizar la estructura de directorios (sección 3.2)

#### 22.7 Features completadas del roadmap
Cuando se completa un item del roadmap:
- Moverlo de "Roadmap" a "Módulos Implementados"
- Actualizar el Mapa Funcional con los detalles
- Eliminar del listado de features pendientes

#### 22.8 Problemas resueltos
Cuando se corrige un bug mayor:
- Mover de "Problemas detectados pendientes" a "Problemas resueltos"
- Documentar la solución brevemente

### Template de actualización periódica

Después de cada sprint o deploy significativo, agregar una entrada al final de este documento con el formato:

```
## ACTUALIZACIÓN: [Fecha] · [Descripción corta]

**Deploy en**: claude/[branch]
**Cambios principales**:
- [Feature/fix 1]: [archivo/tabla/función afectada]
- [Feature/fix 2]: ...

**Migraciones ejecutadas**: [lista de archivos .sql]
**Edge Functions deployed**: [lista]
**Env vars añadidas**: [lista]
**Estado del build**: ✅ OK / ⚠️ Warnings / ❌ Error
```

### Estado actual del sistema (al cierre de este documento)

**Fecha de generación**: 2026-06-05
**Branch**: `claude/zen-einstein-jqcN1`
**Build**: ✅ 3.1MB (sin code splitting — pendiente)

**Migraciones pendientes de ejecutar en producción**:
- `20260605120000_wa_businesses_lat_lng.sql` — columnas lat/lng
- `20260605130000_get_slug_by_custom_domain.sql` — RPC para dominios custom
- `20260605140000_get_active_custom_domain.sql` — RPC para obtener dominio por slug
- `20260605150000_business_domains_vercel_config.sql` — columna vercel_config JSONB

**Edge Functions pendientes de deploy**:
- `manage-custom-domain` — registra/verifica dominios vía Vercel API

**Env vars pendientes de configurar en Supabase Edge Functions**:
- `VERCEL_TOKEN` — token de autenticación Vercel API
- `VERCEL_PROJECT_ID` — ID del proyecto Vercel donde se alojan los merchants

**Features en producción (recientes)**:
- ✅ LocationPicker con Leaflet + Nominatim (4 pasos)
- ✅ Mapa real en catálogo público cuando hay coordenadas
- ✅ Custom domain routing completo (3 capas)
- ✅ OG/SEO personalizado para dominios de merchants
- ✅ CustomDomainSection con UX amigable + FAQ + WhatsApp soporte
- ✅ Edge Function manage-custom-domain integrada con Vercel API
- ✅ DNS instructions reales de Vercel (no hardcodeadas)
- ✅ Dashboard sidebar responsive con auto-collapse

---

*Fin del documento maestro Ventalink — Versión Junio 2026*
*Generado con exploración directa del repositorio en producción.*
*Para preguntas, contactar al fundador: jotacegaete@gmail.com*
