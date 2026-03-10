# Despliegue en https://app.gong.cl

## URL base

La app está configurada para funcionar bajo **https://app.gong.cl**.

## Variables de entorno en Vercel

Configura en el proyecto de Vercel (Settings > Environment Variables) **todas** para Production (y Preview si quieres):

| Variable | Valor | Obligatoria |
|----------|--------|-------------|
| `VITE_APP_URL` | `https://app.gong.cl` | **Sí** (para enlaces públicos del catálogo, planes, QR, Mercado Pago) |
| `VITE_SUPABASE_URL` | `https://tu-proyecto.supabase.co` | Sí |
| `VITE_SUPABASE_ANON_KEY` | tu anon key de Supabase | Sí |

Otras variables que ya uses (OpenAI, etc.) según necesidad.

## Supabase (Dashboard)

- **Authentication > URL Configuration**:  
  - **Site URL**: `https://app.gong.cl`  
  - **Redirect URLs**: añade `https://app.gong.cl/**` si usas redirects de auth.

## Edge Functions (Mercado Pago)

- **create-mp-preference**: las `back_urls` por defecto son:
  - success: `https://app.gong.cl/plans?payment=success`
  - failure: `https://app.gong.cl/plans?payment=failure`
  - pending: `https://app.gong.cl/plans?payment=pending`
- Opcional: en Supabase > Edge Functions > Secrets puedes definir `APP_BASE_URL=https://app.gong.cl` (ya es el valor por defecto en código).

## Rutas públicas

- App panel: `https://app.gong.cl/dashboard`, `/business-configuration`, `/planes`, etc.
- Catálogo público: `https://app.gong.cl/catalog/:slug` o `https://app.gong.cl/catalogo/:slug`
- Planes (y retorno MP): `https://app.gong.cl/planes` y `https://app.gong.cl/plans`

## Dominio en Vercel

En el proyecto de Vercel, añade el dominio **app.gong.cl** (Domains) y apunta el DNS del subdominio a Vercel según las instrucciones que muestre la consola.
