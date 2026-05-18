# Recibo interno de suscripción por Loops

Walinka envía un recibo simple por email cuando un pago de suscripción queda confirmado por el proveedor. No se envía al iniciar checkout.

## Variables de entorno

- `LOOPS_API_KEY`: API key backend de Loops. Nunca debe exponerse en frontend.
- `LOOPS_SUBSCRIPTION_RECEIPT_TRANSACTIONAL_ID`: `transactionalId` del template transaccional creado en Loops.
- `WALINKA_DASHBOARD_URL` opcional: URL del dashboard que se envía en el email. Si falta, se usa el origen público configurado o `https://go.ventalink.app/dashboard`.

## Template en Loops

Crear un Transactional Email en Loops y configurar estas `dataVariables`:

```json
{
  "customerName": "",
  "businessName": "",
  "planName": "",
  "planPeriod": "",
  "amountFormatted": "",
  "currency": "",
  "paymentProvider": "",
  "paymentId": "",
  "subscriptionStatus": "",
  "paidAtFormatted": "",
  "nextRenewalDateFormatted": "",
  "dashboardUrl": ""
}
```

No se genera PDF todavía. El template funciona como recibo simple y queda preparado para adjuntar o enlazar un PDF más adelante.

## Cuándo se envía

- Mercado Pago: después de que `mp-webhook` obtiene estado `approved`, actualiza `wa_payments`, aplica o agenda el plan y sincroniza `billing_subscriptions`.
- PayPal: después de recibir un snapshot de suscripción `ACTIVE` desde webhook y sincronizar `billing_subscriptions`.
- dLocal: después de mapear el webhook a estado interno `active`, actualizar suscripción/pago y activar el plan.

## Duplicados

La fuente preferida es `wa_payments`, porque el recibo representa un pago concreto. La migración `20260517090000_subscription_receipt_email_fields.sql` agrega:

- `receipt_email_sent_at`
- `receipt_email_provider`
- `receipt_email_error`

Además, el código guarda una marca compatible en `wa_payments.metadata.receipt_email_sent_at`. Para PayPal, cuando no existe un pago concreto en `wa_payments`, la marca se guarda en `billing_subscriptions.metadata_json.receipt_email_sent_at`.

## Prueba en staging

1. Configurar `LOOPS_API_KEY` y `LOOPS_SUBSCRIPTION_RECEIPT_TRANSACTIONAL_ID` en el ambiente de staging.
2. Ejecutar la migración de Supabase.
3. Crear un pago de prueba del proveedor correspondiente.
4. Confirmar que el webhook deja el pago aprobado/activo.
5. Verificar en Loops que se recibió un transactional email con las variables esperadas.
6. Reenviar el mismo webhook y confirmar que no se duplica el recibo por la marca `receipt_email_sent_at`.
