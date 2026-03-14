# Auditoría dLocal Go: amount y pago pending

Objetivo: obtener evidencia exacta de qué valor se envía a dLocal, qué responde, y por qué la UI queda en "El pago está en proceso".

---

## 1. Valor real enviado a dLocal (código y logs)

### Código actual en `create-dlocal-checkout/index.ts`

```ts
const amountForDlocal = Math.round(planChange.finalAmount);
// ...
const dlocalPayload = {
  amount: amountForDlocal,
  currency: currencyId,
  // ...
};
```

- **No hay multiplicación por 100.** Se envía el monto interno tal cual (unidad principal).
- Ejemplo: si `planChange.finalAmount === 14553`, entonces `amountForDlocal === 14553` y `dlocalPayload.amount === 14553`.
- Si se enviara 1455300, en el código tendría que existir algo como `* 100`; en el código actual **no existe**.

### Logs que debes ver en cada invocación

Al ejecutar un checkout, en los logs de la Edge Function `create-dlocal-checkout` deberías ver (en este orden):

1. `[dlocal-version] amount-mode=main-unit (no multiplication, value sent as-is)`  
   → Confirma que la versión desplegada es la que usa monto en unidad principal.

2. `[dlocal-audit] EXACT amount sent to dLocal: <número> | planChange.finalAmount: <número>`  
   → El número es el que se envía en `amount`. Debe ser 14553 (o el monto del plan), no 1455300.

3. `[dlocal-payload] planChange.finalAmount: ...`
4. `[dlocal-payload] amountForDlocal: ...`
5. `[dlocal-payload] dlocalPayload: {"amount":<número>, ...}`  
   → En el JSON, `amount` debe ser el mismo número (ej. 14553).

6. `[dlocal-response] status: ... rawBody (full for audit): ...`  
   → Respuesta cruda de dLocal (éxito o error).

7. Si hubo redirect: `[dlocal-audit] payment row updated | paymentId (wa_payments.id): <uuid> | provider_payment_id: ...`

**Conclusión desde código:** Hoy se envía **14553** (unidad principal), no 1455300. Si en los logs aparece 1455300, la función desplegada no es la actual (ver punto 2).

---

## 2. Cómo verificar que la función desplegada es la correcta

1. **Despliega la última versión**  
   Desde el repo (con el código que tiene `[dlocal-version] amount-mode=main-unit`):
   ```bash
   npx supabase functions deploy create-dlocal-checkout
   ```

2. **Ejecuta un intento de pago** (aunque no completes el pago en dLocal).

3. **Revisa los logs en Supabase**  
   - Dashboard → Edge Functions → `create-dlocal-checkout` → Logs.  
   - Busca la línea: `[dlocal-version] amount-mode=main-unit`  
   - Si **aparece**: la función que está corriendo es la que usa monto en unidad principal.  
   - Si **no aparece**: está corriendo una versión antigua; vuelve a desplegar y a probar.

4. **Comprueba el valor enviado**  
   En la misma invocación, busca `[dlocal-audit] EXACT amount sent to dLocal:`. El número debe ser el del plan (ej. 14553), no ese número × 100.

---

## 3. Último registro de wa_payments (cómo obtenerlo)

No se puede consultar tu base desde aquí. Debes ejecutar tú la consulta en Supabase.

**Opción A – Por usuario (recomendada)**  
Sustituye `<USER_ID>` por el `auth.users.id` del usuario que hizo la prueba (o déjalo si usas una vista que filtre por sesión):

```sql
SELECT
  id,
  status,
  amount,
  currency,
  provider,
  provider_payment_id,
  external_reference,
  plan_slug,
  plan_activated_at,
  plan_expires_at,
  metadata,
  created_at,
  updated_at
FROM public.wa_payments
WHERE provider = 'dlocal_go'
  AND user_id = '<USER_ID>'
ORDER BY created_at DESC
LIMIT 1;
```

**Opción B – Último pago dLocal de todo el proyecto**

```sql
SELECT
  id,
  user_id,
  business_id,
  status,
  amount,
  currency,
  provider,
  provider_payment_id,
  external_reference,
  plan_slug,
  plan_activated_at,
  plan_expires_at,
  metadata,
  created_at,
  updated_at
FROM public.wa_payments
WHERE provider = 'dlocal_go'
ORDER BY created_at DESC
LIMIT 1;
```

**Qué anotar para el diagnóstico**

- `status`: pending / approved / cancelled / rejected.  
  Si la UI dice "en proceso", aquí muy probablemente estará **pending** (o no approved).
- `amount`: debe coincidir con lo que se cobra en el plan (ej. 14553).
- `provider_payment_id`:  
  - Si es **NOT NULL**: dLocal creó el pago y devolvió redirect; el webhook puede haberse llamado.  
  - Si es **NULL**: la función marcó el pago como cancelled (error de dLocal o sin redirect) y no hay pago en dLocal para ese registro.
- `metadata`: incluye `raw_dlocal_response` (si hubo redirect) o `raw_dlocal_error_response` (si dLocal devolvió error). Ahí ves la respuesta real de dLocal.
- `created_at` / `updated_at`: si `updated_at` es igual a `created_at` y status es pending, el webhook no ha actualizado ese registro.

---

## 4. Comprobar si hubo webhook (wa_payment_events)

**Consulta:** eventos dLocal recientes (cambia el límite si quieres más filas):

```sql
SELECT
  id,
  payment_id,
  provider,
  provider_payment_id,
  mp_status,
  event_type,
  raw_payload->>'status' AS raw_status,
  processed_at
FROM public.wa_payment_events
WHERE provider = 'dlocal_go'
ORDER BY processed_at DESC
LIMIT 10;
```

**Interpretación**

- **Si no hay filas** para el `payment_id` del último `wa_payments` (o para el `provider_payment_id` que guardaste):  
  → El webhook **no se ha llamado** para ese pago (o no llegó a tu proyecto).  
  Posibles causas: URL de webhook no configurada, no accesible, o dLocal no envió aún.

- **Si hay filas:**  
  - `mp_status`: valor normalizado (approved, rejected, pending, etc.).  
  - `raw_payload->>'status'`: valor crudo que envió dLocal (ej. PAID, PENDING).  
  - Si `mp_status = 'approved'` y aun así el pago en `wa_payments` sigue pending, hubo un bug en la actualización (menos probable si el código del webhook es el actual).

---

## 5. Por qué la UI muestra "El pago está en proceso"

La UI usa **solo** el último pago del usuario en `wa_payments` y su campo `status`:

- **Código (plans/index.jsx):**  
  Se hace `supabase.from('wa_payments').select(...).eq('user_id', user.id).order('created_at', { ascending: false }).limit(1)` y:
  - Si `lastPayment.status === 'approved'` → "Pago realizado. Tu plan se ha actualizado."
  - Si `lastPayment.status === 'cancelled' || 'rejected'` → "El pago no pudo completarse..."
  - En cualquier otro caso (pending, in_process, etc.) → **"El pago está en proceso. Cuando se acredite, tu plan se actualizará."**

Por tanto, **"El pago está en proceso"** significa siempre: **el último registro de wa_payments de ese usuario tiene status distinto de approved (y distinto de cancelled/rejected)**.

Posibles causas (una sola suele ser la real):

1. **El pago en dLocal sigue realmente pending**  
   El usuario no completó el pago o dLocal aún no lo marca como PAID. El webhook llegará más tarde con status approved (o no).

2. **El webhook no ha llegado**  
   No hay fila en `wa_payment_events` para ese pago. El status en `wa_payments` nunca se actualiza y queda pending.

3. **El webhook llegó pero no actualizó wa_payments**  
   Hay evento en `wa_payment_events` pero `wa_payments` sigue en pending. Puede pasar si:  
   - no se encontró `paymentRecord` (order_id o provider_payment_id no coinciden), o  
   - el status que envía dLocal no se mapea a `approved` en nuestro código.  
   Revisar logs del webhook: `[dlocal-webhook] paymentRecord` y `[dlocal-webhook] wa_payments updated` o `no paymentRecord found`.

4. **El frontend está leyendo mal el último pago**  
   Poco probable si la query es por `user_id` y `order by created_at desc limit 1`. Solo tendría sentido si hubiera otro pago más reciente (ej. otro intento) que quedó pending.

---

## 6. Resumen de diagnóstico (qué hacer paso a paso)

1. **Desplegar** la última versión de `create-dlocal-checkout` (con los logs de auditoría y versión).
2. **Hacer un intento de pago** (puedes cancelar en dLocal después de ver el monto).
3. **Revisar logs de `create-dlocal-checkout`:**
   - ¿Aparece `[dlocal-version] amount-mode=main-unit`? → Sí = versión correcta.
   - ¿Qué valor tiene `[dlocal-audit] EXACT amount sent to dLocal:`? → Debe ser 14553 (o el monto del plan), no 1455300.
   - ¿Qué hay en `[dlocal-response] rawBody`? → Respuesta real de dLocal (incluye amount si ellos lo devuelven).
   - Anotar `paymentId` (wa_payments.id) y `provider_payment_id` si aparece en el log de audit.
4. **Ejecutar el SELECT de wa_payments** (punto 3) con tu `user_id` y anotar: status, amount, provider_payment_id, metadata (raw_dlocal_response o raw_dlocal_error_response).
5. **Ejecutar el SELECT de wa_payment_events** (punto 4) y ver si existe algún evento para ese payment_id o provider_payment_id y qué mp_status/raw_status tiene.
6. Con eso puedes rellenar el entregable siguiente.

---

## 7. Entregable (plantilla para rellenar con evidencia)

Rellena con lo que obtengas de logs y SQL:

| Dato | Dónde obtenerlo | Tu valor / observación |
|------|------------------|------------------------|
| **Payload real enviado** | Log `[dlocal-payload] dlocalPayload:` (JSON completo). Copiar el JSON. | |
| **Campo amount en payload** | Dentro de ese JSON, clave `amount`. | ¿14553 o 1455300? |
| **Respuesta real de dLocal** | Log `[dlocal-response] rawBody (full for audit):` o `metadata.raw_dlocal_response` / `raw_dlocal_error_response` en wa_payments. | |
| **Estado último pago** | SELECT wa_payments: status, amount, provider_payment_id, external_reference, created_at, updated_at. | |
| **metadata completo** | Campo `metadata` del mismo registro (para raw_dlocal_*). | |
| **¿Función desplegada correcta?** | ¿Aparece `[dlocal-version] amount-mode=main-unit` en los logs de esa invocación? | Sí / No |
| **¿Por qué el checkout muestra monto inflado?** | Si amount enviado es 14553 y aun así dLocal muestra 1.455.300: dLocal está interpretando el amount como centavos (×100). Si amount enviado es 1455300: la función desplegada no es la actual. | |
| **¿Por qué el pago queda pending?** | Según wa_payments.status y existencia de fila en wa_payment_events: (1) pago en dLocal pending, (2) webhook no llegó, (3) webhook no actualizó, (4) otro. | |

Con esta tabla rellena tendrás la evidencia exacta para decidir el siguiente cambio (por ejemplo: enviar amount en centavos si dLocal lo espera así, o revisar URL/firma del webhook si no llega).
