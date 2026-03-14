# Integración dLocal Go

## Variables de entorno (Supabase Edge Functions)

Configurar en **Supabase Dashboard → Project Settings → Edge Functions → Secrets**:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DLOCAL_GO_API_KEY` | API Key (dashboard dLocal Go → Integrations) | — |
| `DLOCAL_GO_SECRET_KEY` | Secret Key | — |
| `DLOCAL_GO_BASE_URL` | Base URL de la API | `https://api-sbx.dlocalgo.com` (sandbox) o `https://api.dlocalgo.com` (live) |
| `DLOCAL_GO_WEBHOOK_URL` | URL pública del webhook (Supabase) | `https://<project>.supabase.co/functions/v1/dlocal-webhook` |
| `DLOCAL_GO_WEBHOOK_SECRET` | (Opcional) Secret para validar firma del webhook | Si dLocal Go lo ofrece |

## Despliegue

```bash
supabase functions deploy create-dlocal-checkout
supabase functions deploy dlocal-webhook
```

## Webhook en dLocal Go

En el dashboard de dLocal Go, configurar la **notification URL** (webhook) con la URL de la función:

`https://<TU_PROYECTO>.supabase.co/functions/v1/dlocal-webhook`

## Flujo de pagos y activación automática

- **Un solo botón por país:** En la página de planes, el proveedor se elige por país: **Chile → Mercado Pago**, **resto de países → dLocal Go** (config en `src/config/paymentProvider.js`).
- Usuario elige plan → paga en el checkout del proveedor → el proveedor confirma el pago → el webhook (dLocal) o el flujo existente (Mercado Pago) actualiza la base de datos → el usuario vuelve al panel y su plan ya está activo.

### Flujo dLocal Go (paso a paso)

1. Usuario en `/plans` elige un plan y pulsa el botón de pago (solo se muestra dLocal si el país no es Chile).
2. Frontend llama a `plan-change-preview` y muestra el resumen.
3. Al confirmar, llama a `create-dlocal-checkout` con JWT, `planSlug`, `country`, `success_url`, `cancel_url`.
4. La Edge Function crea un registro en `wa_payments` (provider = `dlocal_go`, status = pending; en `metadata.reference_id` se guarda `userId_planSlug` para auditoría/soporte), llama a la API de dLocal Go y devuelve `redirect_url`.
5. El frontend redirige al usuario a `redirect_url` (checkout dLocal).
6. dLocal envía notificaciones a la **Edge Function** `dlocal-webhook` (no hay endpoint Express: la URL es la de Supabase). Solo cuando el estado sea **approved** se actualiza `wa_payments` y `wa_businesses` (plan_slug, plan_started_at, plan_expires_at). Idempotencia por `wa_payment_events` evita activar dos veces.
7. El usuario vuelve por `success_url`; el frontend muestra mensaje y refresca el negocio.

### URL del webhook (configurar en dLocal Go)

`https://<TU_PROYECTO>.supabase.co/functions/v1/dlocal-webhook`

No existe `POST /webhooks/dlocal` en Express; el backend son Supabase Edge Functions.

## Base de datos

- **wa_payments**: columnas `provider`, `provider_payment_id`, `metadata.reference_id` (formato `userId_planSlug`).
- **wa_businesses**: `plan_slug`, `plan_expires_at`, `plan_started_at` (cuándo se activó el plan actual; ver migración `20260313110000_wa_businesses_plan_started_at.sql`).
- **wa_payment_events**: columnas `provider` y `provider_payment_id` para auditoría e idempotencia del webhook.

Migraciones: `20260313100000_payments_provider_dlocal.sql`, `20260313110000_wa_businesses_plan_started_at.sql`.

## Países y monedas

La integración usa el mismo catálogo de planes por país (AR → ARS, CL → CLP) que Mercado Pago. El parámetro `country` se envía al crear el pago en dLocal (ISO 3166-1 alpha-2). Para añadir más países, ampliar el catálogo en la Edge Function y en `src/constants/plans.js` / `src/config/country.js` según la convención del proyecto.
