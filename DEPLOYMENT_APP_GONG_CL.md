# Despliegue (VentALink por país)

Este documento describe el despliegue con dominios por país: **https://cl.ventalink.app** y **https://ar.ventalink.app**.

## URL base

La app usa la misma base para enlaces públicos del catálogo, planes, QR y Mercado Pago. Se obtiene así:

- **Código:** `getAppBaseUrl()` y `getPublicCatalogUrl(slug)` en `src/config/appUrl.js`.
- **Prioridad:** variable de entorno `VITE_APP_URL` (en el build) → si no existe, `window.location.origin` en runtime.

Para que los enlaces compartidos usen el dominio correcto (cl o ar), en cada proyecto de Vercel:

- **Opción recomendada:** no definir `VITE_APP_URL`. La app usará el dominio desde el que se abre (cl.ventalink.app o ar.ventalink.app).
- **Opción alternativa:** definir `VITE_APP_URL` por deploy: en el proyecto de Chile `https://cl.ventalink.app`, en el de Argentina `https://ar.ventalink.app`.

## Variables de entorno en Vercel

| Variable | Valor | Obligatoria |
|----------|--------|-------------|
| `VITE_SUPABASE_URL` | `https://tu-proyecto.supabase.co` | Sí |
| `VITE_SUPABASE_ANON_KEY` | tu anon key de Supabase | Sí |
| `VITE_APP_URL` | Opcional. Si no se define, se usa el dominio actual (recomendado para cl/ar). | No |

## Supabase (Dashboard)

- **Authentication > URL Configuration**:  
  - **Site URL:** el dominio principal (ej. `https://cl.ventalink.app`).  
  - **Redirect URLs:** añade `https://cl.ventalink.app/**`, `https://ar.ventalink.app/**`, etc., según los dominios que uses.

## Edge Functions (Mercado Pago)

- **create-mp-preference:** el front envía `success_url`, `failure_url` y `pending_url` con el dominio actual. Opcional en Supabase > Edge Functions > Secrets: `APP_BASE_URL` (ej. `https://cl.ventalink.app`) como fallback.

## Rutas públicas

- Panel: `/dashboard`, `/business-configuration`, `/planes`, etc.
- Catálogo público: **`/catalogo/:slug`** (URL compartible vía `getPublicCatalogUrl(slug)`).
- Planes y retorno MP: `/planes`, `/plans`.

## Dominios en Vercel

En el proyecto de Vercel, añade los dominios **cl.ventalink.app** y **ar.ventalink.app** (o el que corresponda) y configura el DNS según las instrucciones de Vercel.
