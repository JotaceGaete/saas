# PROJECT-CONTEXT.md
> Generado automáticamente por auditoría de código. Fecha: 2026-05-25.

---

## ¿Qué es la app?

**Ventalink** (nombre interno de proyecto: `catalogowhatsapp`) es una plataforma SaaS multi-tenant que permite a pequeños negocios latinoamericanos crear un catálogo digital compartible por WhatsApp. Los compradores navegan el catálogo público, agregan productos al carrito y generan un pedido que se envía directamente por WhatsApp al negocio. El dueño del negocio gestiona productos, pedidos y analíticas desde un dashboard.

---

## ¿Qué problema resuelve?

Negocios sin e-commerce formal usan WhatsApp para vender, pero sin orden: catálogos en PDF, listas de precios por imagen, pedidos desordenados por chat. Ventalink les da:
- Un catálogo web profesional con URL corta (`miralatienda.de/:slug` o `go.ventalink.app/catalogo/:slug`)
- Un checkout que genera mensaje de WhatsApp pre-formateado con el pedido
- Dashboard de gestión (productos, pedidos, clientes, diseño, analíticas)
- Billing por suscripción (planes Starter gratis / Pro / Full)

---

## Stack real actual

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite 5 (SPA, NO Next.js) |
| Routing | React Router DOM 6.0.2 |
| UI | Tailwind CSS 3.4.6 + Radix UI (slot) + Framer Motion 10 |
| Estado global | Redux Toolkit + React Context (Auth, Country) |
| Backend (serverless) | Vercel Functions (`/api/*.js`) |
| Backend (edge) | Supabase Edge Functions (Deno, `supabase/functions/`) |
| Base de datos | Supabase (PostgreSQL) con RLS |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Storage (imágenes) | Cloudflare R2 (principal) + Supabase Storage (legacy) |
| CDN imágenes | Cloudflare Images (transformaciones vía URL) |
| Email | Resend + Loops (automatización marketing) |
| Analytics | Custom (tablas `wa_catalog_visits`, `wa_site_visits`) |
| Billing | PayPal (INTL) + Mercado Pago (CL/AR) + dLocal (stand-by) + Paddle (stand-by) |
| IA | Google Gemini (principal) + OpenAI (fallback) vía backend |
| PWA | Vite Plugin PWA (instalable en móvil) |
| Charts | Recharts + D3 |

---

## Dominios y rutas públicas relevantes

| Dominio | Propósito |
|---------|-----------|
| `go.ventalink.app` | App principal (dashboard + catálogos) |
| `ventalink.app` | Marketing/landing; redirige app routes a `go.ventalink.app` |
| `www.ventalink.app` | Redirige a `ventalink.app` (permanente) |
| `miralatienda.de` | Dominio público de catálogos (SEO/WhatsApp share) |
| `www.miralatienda.de` | Redirige a `miralatienda.de` (permanente) |

Todas las rutas de app (dashboard, login, etc.) en `ventalink.app` y `miralatienda.de` se redirigen a `go.ventalink.app`. Configurado en `vercel.json`.

---

## Entornos y deploy

- **Plataforma:** Vercel (SPA + Serverless Functions)
- **Build:** `vite build` → output en `dist/`
- **Preview:** Vercel Preview por branch
- **Production:** `go.ventalink.app` + `ventalink.app` + `miralatienda.de`
- **Supabase:** Proyecto único (no hay staging de Supabase documentado)
- **Edge Functions:** desplegadas en Supabase (`supabase functions deploy`)
- **R2:** Cloudflare R2 para imágenes (bucket configurado vía env vars)

---

## Estado actual del producto

- **MVP lanzado y activo** con usuarios reales en Chile y Argentina (Mercado Pago) e internacional (PayPal).
- Sistema de planes: Starter (gratis), Pro (trial 14 días), Full (business).
- Últimas features: clientes, modo restaurante (`business_mode: store|restaurant`), videos de producto, slugs de producto, add-ons, combos, variantes, analíticas de visitas, emails vía Loops.
- **Billing:** PayPal activo como proveedor principal INTL; Mercado Pago activo para CL/AR; dLocal y Paddle en código pero deshabilitados/stand-by.
- **IA:** Mejora de descripciones de productos (Gemini/OpenAI) activa; insights de dashboard en Edge Function.
- **Emails:** Sistema propio con cola (`email_queue`) + Loops para emails de marketing/receipts.

---

## Resumen para ChatGPT

Ver sección al final de `docs/FEATURE-MAP.md`.
