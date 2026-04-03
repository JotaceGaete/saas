# Validación: `syncService.js` solo PayPal — plan resolution & throws

## 1. Evidencia: quién importa `syncService` (ningún MP / dLocal)

Búsqueda en repo (`import` / `from` hacia `syncService`):

| Archivo | Funciones usadas |
|---------|------------------|
| `backend/src/services/paypal/subscriptionService.js` | `applyCreateSnapshot`, `applyRemoteSnapshot`, `applyCancelSnapshot` |
| `backend/src/services/subscriptions/paypalEventHandlers.js` | `applyEventSnapshot`, `applyRemoteSnapshot` |

**Mercado Pago:** flujo en `supabase/functions/mp-webhook` + `wa_payments` / `wa_businesses` — **no importa** `syncService`.

**dLocal:** `backend/src/services/billing/dlocalWebhookService.js` + `upsertBillingSubscriptionByBusiness` con `provider: 'dlocal'` — **no importa** `syncService`.

**Conclusión:** Las exportaciones públicas de `syncService` (`applyCreateSnapshot`, `applyRemoteSnapshot`, `applyCancelSnapshot`, `applyEventSnapshot`) y la función interna `mirrorToBillingSubscription` **solo** se ejecutan en el árbol de código PayPal.

---

## 2. Cuándo pueden activarse los `throw` nuevos

### A) `resolveInternalPlanSlug` (`syncService.js`)

- Entra al `throw` **solo** si `if (paypalPlanId) { ... }` y `getInternalPlanFromPaypalPlanId` devuelve falsy (líneas 39–45).
- Equivale a: **debe existir `paypalPlanId` truthy**. Sin `paypalPlanId`, retorna `null` sin lanzar.

### B) `mirrorToBillingSubscription` — estado “pagado” + `plan_slug === 'starter'`

- Condición: `PAYPAL_PAID_PROVIDER_STATUSES.has(normalizedProviderStatus) && plan_slug === 'starter'` (aprox. líneas 93–104).
- Esta función **siempre** llama `upsertBillingSubscriptionByBusiness` con `provider: 'paypal'` (no hay rama MP/dLocal aquí).

**MP/dLocal:** no invocan `mirrorToBillingSubscription`, por tanto **no pueden** disparar este bloque.

---

## 3. Condiciones explícitas `provider === 'paypal'` / equivalentes en `syncService`

En el archivo actual no hay `if (provider === 'paypal')` para los throws: el módulo **es exclusivo de PayPal** por diseño.

Equivalentes concretos:

- `mapProviderStatus('paypal', normalizedProviderStatus)` — primer argumento fijo `'paypal'`.
- `upsertBillingSubscriptionByBusiness({ ..., provider: 'paypal', ... })` — `provider` siempre `'paypal'`.

Los throws de plan están acotados a:

1. Resolución con `paypalPlanId` presente (`resolveInternalPlanSlug`).
2. `mirrorToBillingSubscription`, que solo se usa desde las funciones `apply*` de este mismo archivo (cadena PayPal).

---

## 4. Pseudotests (comportamiento esperado)

| Caso | Entrada / contexto | Resultado esperado |
|------|---------------------|----------------------|
| PayPal + `plan_id` Pro válido | DB `paypal_plan_mappings` o env `PAYPAL_PLAN_ID_*` coincide con ID Pro | `internalPlanSlug` → `pro` → `plan_slug` **`pro`**; log `[PAYPAL PLAN RESOLUTION]` con `resolvedPlanSlug: 'pro'` |
| PayPal + `plan_id` Business válido | Mapeo Full/Business → interno `full` | `plan_slug` **`business`**; mismo log con `'business'` |
| PayPal + `plan_id` desconocido | ID no en DB ni en env | **`throw`** en `resolveInternalPlanSlug` (mensaje `[paypal-sync] Cannot resolve PayPal plan_id...`) si se llama con ese `paypalPlanId` |
| Mercado Pago flujo actual | Webhook MP / Edge | **Sin** llamada a `syncService` — comportamiento **sin cambios** respecto a este archivo |
| dLocal flujo actual | `dlocalWebhookService` | **Sin** llamada a `syncService` — **sin cambios** |

### Comprobación manual rápida (no ejecutada en CI aquí)

```bash
# Debe ser vacío: MP/dLocal no deben importar syncService
rg "syncService|subscriptions/syncService" backend --glob "*.js" | rg -v "paypal/"
```

---

## 5. Referencias de código (líneas aproximadas)

- Throws por `plan_id` irreconocible: `syncService.js` → `resolveInternalPlanSlug` (bloque `if (paypalPlanId)`).
- Throw “paid pero starter”: `syncService.js` → `mirrorToBillingSubscription` + `PAYPAL_PAID_PROVIDER_STATUSES`.
- Persistencia siempre PayPal: `mirrorToBillingSubscription` → `provider: 'paypal'`.
