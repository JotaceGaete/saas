# Lógica de cambio de plan con prorrateo

## Reglas de negocio

1. **Prorrateo solo en upgrades**
   - control → pro, control → business, pro → business

2. **Downgrades**
   - No se cobra nada; no se crea preferencia de Mercado Pago.
   - Se programan para el próximo ciclo: al vencer `plan_expires_at`.
   - Se persisten en BD: `wa_businesses.scheduled_plan_slug`, `wa_businesses.scheduled_change_at`.
   - Para aplicar el cambio cuando venza el plan: ejecutar `wa_apply_scheduled_plan_changes()` (cron o Edge Function `apply-scheduled-plan-changes`).

3. **Renewal (mismo plan)**
   - Sin crédito; `finalAmount = precio del plan`.
   - Si `plan_expires_at` está en el futuro: extender desde esa fecha.
   - Si ya venció o es null: extender desde now().

4. **Fórmula de crédito (tiempo exacto)**
   - `remainingMs = max(plan_expires_at - now, 0)`
   - `remainingDaysFraction = min((remainingMs / ms_en_30_días) * 30, 30)`
   - `creditAmount = floor((precio_plan_actual / 30) * remainingDaysFraction)`; el crédito no supera el precio del plan actual.
   - `finalAmount = max(0, precio_nuevo - creditAmount)`

5. **Si finalAmount = 0 en un upgrade**
   - No se crea preferencia en Mercado Pago.
   - Se aplica el cambio internamente (actualiza `wa_businesses` y crea fila en `wa_payments` con `provider: 'internal_proration'`, `amount: 0`).

6. **Cálculo solo en backend**
   - `plan-change-preview` y `create-mp-preference` usan el mismo catálogo y la misma lógica.

7. **Catálogo centralizado (backend)**
   - Orden: starter=0, control=1, pro=2, business=3.
   - Por slug: displayName, price, durationDays.

## Trazabilidad en wa_payments.metadata

- currentPlanSlug, currentPlanPrice, targetPlanSlug, targetPlanPrice
- daysRemaining, creditAmount, finalAmount, changeType
- computedAt, prorationFormulaVersion, effectiveAt, scheduledChange
- Para pago interno: provider: 'internal_proration'

## Endpoints

- **POST /functions/v1/plan-change-preview**  
  Body: `{ "targetPlanSlug": "pro" }`.  
  Respuesta: `{ currentPlanSlug, currentPlanPrice, targetPlanSlug, targetPlanPrice, daysRemaining, creditAmount, finalAmount, changeType, message?, effectiveAt?, scheduledChange?, prorationFormulaVersion }`.

- **POST /functions/v1/create-mp-preference**  
  Body: `{ "planSlug", success_url, failure_url, pending_url, origin }`.  
  - Si downgrade: persiste scheduled_* en `wa_businesses`, responde 400 y no crea preferencia.
  - Si finalAmount > 0: crea `wa_payments` y preferencia MP.
  - Si finalAmount = 0: aplica cambio interno, crea `wa_payments` con provider `internal_proration`, responde 200 `{ applied: true, planSlug, plan_expires_at, payment_id }`.

- **POST /functions/v1/apply-scheduled-plan-changes**  
  Ejecuta `wa_apply_scheduled_plan_changes()` en BD. Requiere Bearer (service_role o JWT). Respuesta: `{ applied: number, changes: [...] }`. Útil para cron o llamada al cargar planes.

## Cómo probar

1. **Upgrade con pago**  
   Plan actual con días restantes; elegir plan superior. Ver resumen con crédito y total > 0; confirmar → redirige a MP.

2. **Renewal**  
   Mismo plan que el actual. Preview: changeType renewal, finalAmount = precio del plan. Confirmar → MP con ese monto.

3. **Downgrade**  
   Elegir plan inferior. Preview: changeType downgrade, mensaje. No se muestra “Confirmar y pagar”. Si se llama create-mp-preference con ese plan, backend persiste scheduled_* y devuelve 400.

4. **Upgrade “gratis” por prorrateo**  
   Plan actual con muchos días restantes; elegir plan superior de menor precio o con crédito que cubra el total. Preview: finalAmount = 0. Confirmar → backend aplica cambio sin MP y responde `{ applied: true }`; la UI muestra éxito y refresca el negocio.

5. **Aplicar downgrades programados**  
   Llamar POST `/functions/v1/apply-scheduled-plan-changes` con Bearer (o configurar cron que ejecute la RPC `wa_apply_scheduled_plan_changes` en la BD). Comprobar que los negocios con `plan_expires_at` vencido y `scheduled_plan_slug` pasan a ese plan y se limpian scheduled_*.
