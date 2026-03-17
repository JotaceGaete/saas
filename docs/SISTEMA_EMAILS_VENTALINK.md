# Sistema de emails Ventalink

## Resumen

El sistema de emails está reorganizado para **no enviar correo por cada pedido individual**, evitando molestar a comercios con muchas ventas. Se priorizan:

- **Resúmenes diarios** (activos)
- **Resúmenes semanales** (preparados, no activos aún)
- **Emails importantes**: welcome, trial_expiring, payment_confirmed, plan_changed, password_recovery

---

## Estado actual: NO hay email por pedido

En el código base **no existe** ningún disparo de correo al crear un pedido. La función `createOrder` (waBusinessService.js) solo inserta en `wa_orders`; no llama a `send-email` ni a ningún servicio de correo.

**Eventos que actualmente NO envían correo:**
- `createOrder` → ninguna notificación por correo
- Triggers en `wa_orders` → ninguno envía email

---

## Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/20260317000000_email_logs.sql` | Nueva tabla `wa_email_logs` para registrar envíos |
| `supabase/migrations/20260317000001_cron_daily_summary.sql` | Extensiones pg_cron/pg_net y job programado |
| `supabase/functions/send-email/index.ts` | Extendido con `type`+`data`, templates, y logs en `wa_email_logs` |
| `supabase/functions/send-daily-summary/index.ts` | **Nueva** función que recorre negocios con actividad y envía resumen |
| `supabase/config.toml` | Configuración `send-daily-summary` (verify_jwt = false para cron) |

---

## Cómo funciona el resumen diario

1. **Trigger**: Cron ejecuta `send-daily-summary` una vez al día (02:00 UTC por defecto).
2. **Criterio**: Solo se envía si el negocio tuvo **al menos un pedido** en el día (por defecto: día anterior).
3. **Contenido**: Nombre del negocio, cantidad de pedidos, total vendido, productos más vendidos, link al panel.
4. **Destinatario**: `wa_businesses.email` o, si está vacío, el email del usuario en Auth.

---

## Cómo disparar el resumen diario

### Opción A: Cron con pg_cron (recomendado)

1. Crear secrets en Supabase Vault:
   ```sql
   SELECT vault.create_secret('https://TU-PROJECT-REF.supabase.co', 'project_url');
   SELECT vault.create_secret('tu_supabase_anon_key', 'anon_key');
   ```

2. Descomentar el bloque `cron.schedule` en `supabase/migrations/20260317000001_cron_daily_summary.sql` y aplicar la migración.

3. El job `send-daily-summary` se ejecutará todos los días a las 02:00 UTC.

### Opción B: Invocación manual (pruebas)

```bash
curl -X POST "https://TU-PROJECT.supabase.co/functions/v1/send-daily-summary" \
  -H "Authorization: Bearer TU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-03-16"}'
```

O con GET: `.../send-daily-summary?date=2025-03-16`

---

## Cómo reactivar email por pedido (si lo necesitaras en el futuro)

1. **Dónde disparar**: Tras crear el pedido en `createOrder` (waBusinessService.js) o mediante un trigger en `wa_orders` que invoque una Edge Function.

2. **Plantilla**: `send-email` ya tiene el template `new_order`. Datos esperados:
   ```json
   {
     "to": "comercio@email.com",
     "type": "new_order",
     "data": {
       "businessName": "Mi Tienda",
       "customerName": "Cliente",
       "total": 15000,
       "dashboardUrl": "https://cl.ventalink.app"
     },
     "businessId": "uuid",
     "userId": "uuid"
   }
   ```

3. **Ejemplo de integración** (en createOrder, tras insert exitoso):
   ```javascript
   // Tras return { data: order, error: null } en createOrder,
   // llamar a send-email (desde front o desde una Edge Function invocada por trigger)
   try {
     await fetch(`${supabaseUrl}/functions/v1/send-email`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
       body: JSON.stringify({
         to: businessEmail,
         type: 'new_order',
         data: { businessName, customerName: orderData.customerName, total: totalAmount, dashboardUrl },
         businessId, userId,
       }),
     });
   } catch (e) { console.warn('email new_order failed', e); }
   ```

4. **Alternativa con trigger**: Crear un trigger `AFTER INSERT ON wa_orders` que llame a una Edge Function (vía pg_net) con los datos del pedido. La Edge Function construiría el payload y llamaría a `send-email`.

---

## API de send-email

### Con templates (recomendado)

```json
{
  "to": "destino@email.com",
  "type": "daily_summary",
  "data": {
    "businessName": "Mi Tienda",
    "orderCount": 5,
    "totalSold": 45000,
    "topProducts": [
      { "productName": "Producto A", "totalQty": 3, "totalRevenue": 15000 }
    ],
    "date": "2025-03-16",
    "currency": "CLP"
  },
  "userId": "uuid-opcional",
  "businessId": "uuid-opcional"
}
```

Tipos: `daily_summary`, `weekly_summary`, `welcome`, `trial_expiring`, `payment_confirmed`, `plan_changed`, `new_order`, `custom`.

### Sin template (compatibilidad)

```json
{
  "to": "destino@email.com",
  "subject": "Asunto",
  "html": "<p>Contenido</p>"
}
```

---

## Tabla wa_email_logs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | PK |
| user_id | UUID | Usuario (opcional) |
| business_id | UUID | Negocio (opcional) |
| to_email | TEXT | Destinatario |
| type | TEXT | Tipo de email |
| status | TEXT | sent \| failed |
| provider_message_id | TEXT | ID de Resend |
| error_message | TEXT | Mensaje de error si falló |
| created_at | TIMESTAMPTZ | Fecha de creación |
