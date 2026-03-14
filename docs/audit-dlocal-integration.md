# Auditoría: integración dLocal Go (monto incorrecto + plan no se activa)

## PROBLEMA 1 — Monto incorrecto en checkout

### Evidencia
- **Objetivo:** Cobrar ~ARS 14.553 (unidad principal).
- **Envío actual:** `amountToDlocalMinorUnit(14553)` → `14553 * 100` = **1.455.300**.
- **Checkout dLocal muestra:** ARS 1.455.300,00.

### Conclusión (con evidencia)
- Documentación dLocal (y búsqueda): el campo `amount` es *"Transaction amount in the currency specified"* con formato tipo **10,2** (ej. 99999999.99), es decir **unidad principal con decimales**, no unidad mínima (centavos).
- Al enviar **1.455.300**, dLocal lo interpreta como **1.455.300,00** ARS (unidad principal), por eso el checkout muestra ese valor.
- **Unidad correcta para este endpoint:** **unidad principal** (ej. 14553 para ARS 14.553).

### Corrección
- En `create-dlocal-checkout`: enviar `amount: planChange.finalAmount` (sin multiplicar por 100). Eliminar o invertir la conversión a “unidad mínima” para este flujo.

---

## PROBLEMA 2 — Plan no se activa tras el pago

### Flujo esperado
1. Usuario paga en dLocal → redirect a `success_url`.
2. dLocal envía webhook a `notification_url` con `status` (ej. PAID) y `order_id` (nuestro `wa_payments.id`).
3. `dlocal-webhook` recibe el POST → busca pago por `order_id` o `provider_payment_id` → actualiza `wa_payments` y `wa_businesses`.

### Código revisado

| Componente | Estado |
|------------|--------|
| **create-dlocal-checkout** | Envía `order_id: String(paymentId)` (UUID de `wa_payments.id`). Correcto para que el webhook resuelva el pago. |
| **dlocal-webhook** | 1) Busca por `order_id` en `wa_payments.id`. 2) Si no hay, busca por `provider_payment_id`. 3) Inserta en `wa_payment_events`. 4) Actualiza `wa_payments.status` y, si `approved`, `plan_activated_at` / `plan_expires_at`. 5) Si `approved` y plan permitido, actualiza `wa_businesses` (plan_slug, plan_started_at, plan_expires_at). Lógica correcta si el webhook se ejecuta. |
| **Frontend** | Muestra “Pago realizado. Tu plan se ha actualizado.” **solo** cuando existe `?payment=success` en la URL (redirect de dLocal). **No** comprueba en BD que el plan haya cambiado → **éxito falso**. |

### Posibles causas de que el plan no se active
1. **Webhook no llamado:** `DLOCAL_GO_WEBHOOK_URL` no configurado, URL no accesible desde dLocal (ej. localhost), o dLocal no envía aún.
2. **Webhook rechazado:** Firma HMAC incorrecta si está configurado `DLOCAL_GO_WEBHOOK_SECRET` (respuesta 401).
3. **order_id no coincidente:** Si dLocal no devuelve `order_id` o lo devuelve con otro formato, `paymentRecord` queda `null` y no se actualiza `wa_businesses`.
4. **Status no reconocido:** Si dLocal envía un estado que no mapeamos a `approved` (ej. otro string), no se actualiza el plan. `normalizeStatus` ya mapea `paid`/`approved`/`completed` → `approved`.

### Verificaciones recomendadas (logs / BD)
- Logs de la Edge `dlocal-webhook`: si se invoca y con qué cuerpo (sobre todo `order_id`, `id`, `status`).
- Tabla `wa_payment_events`: si hay filas con `provider = 'dlocal_go'` para este pago (indica que el webhook se ejecutó).
- Tabla `wa_payments`: ver si el registro del pago tiene `status = 'approved'` y `provider_payment_id` rellenado.
- Tabla `wa_businesses`: ver si `plan_slug` y `plan_expires_at` se actualizaron para el negocio.

---

## PROBLEMA 3 — Mensaje de éxito falso en frontend

### Evidencia
- **Dónde:** `src/pages/plans/index.jsx`, `useEffect` que reacciona a `searchParams.get('payment') === 'success'`.
- **Comportamiento:** Al volver de dLocal con `?payment=success`, se muestra “Pago realizado. Tu plan se ha actualizado.” y se llama a `refreshBusiness()`, **sin comprobar** si el plan en BD ya cambió.
- **Consecuencia:** Si el webhook no se ejecutó o falló, el usuario ve éxito pero el negocio sigue en Starter.

### Corrección
- No mostrar el mensaje de éxito solo por el query param.
- Tras detectar `payment=success`, refrescar negocio (o consultar estado del pago/plan) y **mostrar éxito solo cuando** `business.planSlug` (o el plan esperado) refleje la actualización en BD. Mientras tanto, mostrar estado “Verificando pago…” o similar.

---

## Resumen de correcciones aplicadas

1. **Monto:** Enviar `amount` en **unidad principal** en `create-dlocal-checkout` (sin multiplicar por 100).
2. **Webhook:** Añadir logs en `dlocal-webhook` (payload recibido, `order_id`, `status`, si se encontró `paymentRecord`) para poder confirmar si fue llamado y por qué no se actualizaría el plan.
3. **Frontend:** Mostrar “Pago realizado. Tu plan se ha actualizado.” solo cuando, tras refrescar, el plan en BD esté realmente actualizado; si no, mensaje de verificación o pendiente.

---

## Payload y datos que conviene revisar (por prueba)

- **Payload enviado a dLocal:** logs `[dlocal-payload]` en `create-dlocal-checkout` (incl. `planChange.finalAmount`, `amountForDlocal`, `dlocalPayload` completo).
- **Respuesta de dLocal:** logs `[dlocal-response]` (status, rawBody, parsed). Si el pago quedó cancelled por error HTTP, la respuesta cruda está en `wa_payments.metadata.raw_dlocal_error_response`.
- **Último registro en wa_payments:** `id`, `status`, `provider_payment_id`, `plan_slug`, `amount`, `metadata` (ahí va `raw_dlocal_response` en éxito o `raw_dlocal_error_response` en error).
- **Último registro en wa_payment_events:** si existe fila con `provider = 'dlocal_go'` y `payment_id` = id de ese wa_payment (o `provider_payment_id` igual al id de pago de dLocal). Si **no hay ninguna fila** para ese pago, el webhook **no fue llamado** para ese intento.
- **wa_businesses:** `plan_slug`, `plan_expires_at` del negocio que pagó.
- **Webhook llamado o no:** si `wa_payments.status = cancelled` y `provider_payment_id = null`, el flujo nunca llegó a recibir redirect de dLocal (error antes de checkout); en ese caso **no puede haber webhook** para ese registro (dLocal no tiene id de pago para notificar).

---

## Dónde se marca status = 'cancelled' (diagnóstico por logs)

En `create-dlocal-checkout` el pago se marca `cancelled` solo en **tres** puntos. En los logs de la Edge Function busca la línea `[dlocal-checkout] CANCELLED_REASON:` para saber cuál ocurrió:

| CANCELLED_REASON en log | Significado |
|-------------------------|-------------|
| `dLocal devolvió error HTTP` | `!dlocalRes.ok`: dLocal respondió con 4xx/5xx. Revisar `[dlocal-response] rawBody` y/o `wa_payments.metadata.raw_dlocal_error_response`. |
| `error de parseo de respuesta JSON` | La respuesta fue 2xx pero el body no es JSON válido. Revisar `[dlocal-response] rawBody`. |
| `dLocal no devolvió redirect_url` | La respuesta es JSON válido pero no trae `redirect_url`. Revisar `[dlocal-response] parsed`. |

Para el caso real con `status = cancelled` y `provider_payment_id = null`: lo más probable es **dLocal devolvió error HTTP** (primer caso). Confirmar en logs buscando `CANCELLED_REASON: dLocal devolvió error HTTP` y el contenido de `raw_dlocal_error_response` en ese registro de `wa_payments`.

---

## Monto: evidencia para comparar

- **En logs:** `[dlocal-payload] planChange.finalAmount`, `[dlocal-payload] amountForDlocal`, `[dlocal-payload] dlocalPayload` (incl. `amount`).
- **Respuesta cruda:** `[dlocal-response] rawBody` (y si hay error, `metadata.raw_dlocal_error_response` en wa_payments).
- **Monto mostrado en checkout:** viene de dLocal (su UI). Si el monto mostrado no coincide con el esperado, comparar el `amount` que enviamos en el payload con lo que documenta dLocal para este endpoint (unidad principal vs mínima).
