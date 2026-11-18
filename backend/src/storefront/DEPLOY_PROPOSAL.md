# Montaje de la API Storefront en Vercel — PROPUESTA (no aplicada)

Estado: **no autorizado**. No se modificó `vercel.json`, no existe `api/storefront.js` y no hay preview.

## Hechos verificados

- `api/` contiene 34 archivos (incluye subcarpetas y tests). `vercel.json` tiene 29 rewrites y no define `functions`.
- Límite de funciones por despliegue: la documentación oficial actual indica «framework-dependent» (última actualización 2026-08-03). Reportes de la comunidad citan un máximo de 12 en Hobby. **No se pudo confirmar el número vigente de esta cuenta**; hay que leerlo en el dashboard antes del preview.
- Tiempo de espera de requests proxied: las fuentes consultadas dan 30 s y 120 s. Tampoco confirmado.
- `vercel.json` ya tiene catch-alls: `/:slug`, `/(.*)` → `index.html`. Una regla `/v1/:path*` colocada después no se aplicaría; colocada antes, capturaría rutas de la SPA del mismo nombre. **Por eso el prefijo propuesto es `/api/v1/storefront/`**, que sigue la convención de `/api/v1/billing/…` y `/api/v1/ai/…` y no choca con ningún rewrite existente.

## Opciones

| Opción | Funciones nuevas | Riesgo | Veredicto |
|---|---|---|---|
| A. Una función `api/storefront.js` con rewrite `/api/v1/storefront/:path*` → `/api/storefront?p=:path*` (ver `review/vercel.json.proposed`; corrige la versión anterior con `__route`) | +1 | Cuenta cerca del límite; hay que confirmarlo | **Recomendada** si el límite lo permite |
| B. Montar dentro de `api/billing.js` u otra función | 0 | Mezcla dominios (billing con catálogo público), mayor radio de fallo | Rechazada |
| C. Supabase Edge Function | 0 en Vercel | Runtime Deno: `node:crypto` y `Response` deben validarse; otra superficie de despliegue | Alternativa si A no cabe |

## Plan de Opción A (cuando se autorice)

1. Confirmar límite de funciones de la cuenta y número actual del último despliegue.
2. Crear `api/storefront.js` (candidato en `review/api-storefront.candidate.js`) que llame a `createStorefrontHandlerFromEnv({ rpc: createSupabaseRpc(client) })`. Reconstruye `/v1/stores/...` a partir del parámetro `p`, porque el handler espera esa forma de ruta y no el prefijo `/api/v1/storefront/`.
3. Agregar el rewrite **antes** de los catch-alls.
4. Desplegar solo en preview. Verificar: 200/404/400 de cada ruta, cabeceras `Cache-Control`, cursor, 405 en POST.
5. Comparar la respuesta del preview contra la réplica con la misma suite de paridad.
6. Producción solo con autorización explícita. Rollback: quitar el rewrite y el archivo.

## Seguridad del montaje

- Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (solo backend), `WALINKA_CURSOR_SECRET` (≥16 caracteres; obligatorio en producción, fail-closed).
- La clave de servicio omite RLS: el aislamiento depende de las funciones `storefront_*` (filtran por `business_id`) y de los grants a `anon`/`authenticated` revocados (cubierto por `db.integration.test.js`).
- Cache: `public, s-maxage=60, stale-while-revalidate=300` en respuestas 200. Los banners cambian por fecha; el TTL de 60 s es aceptable.
