# Integración Mercado Pago (planes Pro y Business)

## Resumen

- **Pro**: $5.000 CLP (pago único)
- **Business**: $10.000 CLP (pago único)
- Pagos vía [Mercado Pago Chile](https://www.mercadopago.cl) (Checkout Pro).

## Configuración en Supabase

1. **Secrets** (Dashboard > Project Settings > Edge Functions > Secrets):
   - `MP_ACCESS_TOKEN`: Access Token de tu aplicación en [Mercado Pago Developers](https://www.mercadopago.cl/developers/panel/app) (Producción o Pruebas).
   - `MP_WEBHOOK_URL` (opcional): `https://<tu-proyecto>.supabase.co/functions/v1/mp-webhook` — si no se define, la preferencia se crea sin `notification_url` y el plan se actualiza cuando el usuario vuelve por la URL de éxito (recomendado igual configurar el webhook para actualización inmediata).

2. **Desplegar funciones**:
   ```bash
   supabase functions deploy create-mp-preference
   supabase functions deploy mp-webhook
   ```

## Configuración en Mercado Pago

1. En [Tus integraciones](https://www.mercadopago.cl/developers/panel/app), crea o selecciona una aplicación.
2. En **Webhooks** > Configurar notificaciones:
   - URL de producción: `https://<tu-proyecto>.supabase.co/functions/v1/mp-webhook`
   - Eventos: activar **Payments** (Pagos).
3. Credenciales: usa el **Access Token** de producción (o de pruebas) y configúralo en Supabase como `MP_ACCESS_TOKEN`.

## Flujo

1. Usuario elige Pro o Business en `/planes` o `/plans` y hace clic en "Pagar con Mercado Pago".
2. El front llama a la Edge Function `create-mp-preference` (con JWT del usuario).
3. La función crea una preferencia en Mercado Pago con `external_reference = businessId:planSlug` y devuelve `init_point`.
4. El usuario es redirigido a Mercado Pago, paga y vuelve a la URL de retorno del front (ej. `https://cl.ventalink.app/plans?payment=success` o failure/pending).
5. Mercado Pago envía un webhook a `mp-webhook`; si el pago está aprobado, se actualiza `wa_businesses.plan_slug` para ese negocio.
