# Módulo Admin: Pagos y Suscripciones

## Qué quedó implementado

### 1. Base de datos (migración `20260310400000_admin_payments_and_notifications.sql`)

- **wa_admin_notifications**: tabla de notificaciones internas (tipo, título, cuerpo, payload, read_at). Solo admins pueden leer y actualizar (marcar leídas). Inserciones desde triggers y desde Edge Functions (service_role).
- **wa_admin_audit_log**: auditoría de acciones manuales (extend_plan, change_plan) con admin_user_id, entity_type, entity_id, payload.
- **wa_admin_notify(type, title, body, payload)**: función SECURITY DEFINER para insertar notificaciones (usada por triggers).
- **Trigger en wa_payments**: al pasar un pago a `approved` o `rejected`, se crea una notificación (subscription_approved / payment_rejected).
- **Vista wa_payments_admin_view** ampliada: incluye `user_id`, `metadata`, `origin` (mercado_pago | internal).
- **wa_admin_payments_stats()**: RPC que devuelve totales (approved, pending, rejected, activeSubscriptions, expiredSubscriptions, revenueThisMonth, recentRenewalsCount).
- **wa_admin_plans_sold()**: RPC que devuelve conteo por plan_slug de pagos aprobados.
- **wa_admin_extend_plan(business_id, days, reason)**: extiende plan_expires_at y registra en audit_log.
- **wa_admin_change_plan(business_id, new_plan_slug, reason)**: cambia plan del negocio y registra en audit_log.

### 2. Backend / Edge Functions

- **mp-webhook**: inserciones en `wa_admin_notifications` para:
  - `duplicate_ignored` cuando el pago ya estaba procesado como approved.
  - `webhook_error` cuando la API de MP devuelve error al consultar el pago.

### 3. Frontend (servicio y UI)

- **adminPaymentsService.js**: getAdminPaymentsStats, getAdminPlansSold, getAdminPayments (filtros: status, planSlug, origin, dateFrom, dateTo, search), getAdminPaymentDetail, getAdminBusinessSubscription, getAdminNotifications, markAdminNotificationRead, markAllAdminNotificationsRead, adminExtendPlan, adminChangePlan.
- **Ruta**: `/admin/payments` (solo admin).
- **Sidebar**: enlace "Pagos y Suscripciones" visible solo para admin (junto a "Panel admin").
- **Panel admin** (`/admin`): botón "Pagos y Suscripciones" que navega a `/admin/payments`.

### 4. Pantalla Pagos y Suscripciones

- **Resumen**: tarjetas con total aprobados, pendientes, rechazados, suscripciones activas/vencidas, ingresos del mes, planes más vendidos.
- **Notificaciones**: panel desplegable con listado, marcar una como leída y "Marcar todas como leídas".
- **Filtros**: estado (approved, pending, rejected, etc.), plan, origen (mercado_pago / internal), rango de fechas, buscador por nombre negocio, email o ID de pago.
- **Tabla de pagos**: fecha, negocio, usuario, plan, monto, estado, origen, fecha vencimiento, mp_payment_id. Clic en fila abre detalle.
- **Detalle (drawer)**:
  - Si se abrió desde un pago: datos del pago, external_reference, mp_payment_id, preference_id, metadata, eventos del webhook; enlace "Ver negocio".
  - Si se abrió desde un negocio (o "Ver negocio"): datos del negocio, plan actual, vencimiento, historial de pagos, auditoría; acciones "Extender plan" (días + motivo) y "Cambiar plan" (selector + motivo).

### 5. Trazabilidad

- Pagos y cambios de estado ya se registraban en `wa_payments` y `wa_payment_events`.
- Acciones manuales admin se registran en `wa_admin_audit_log`.
- Notificaciones internas en `wa_admin_notifications` (sin correo; preparado para integrar email después).

---

## Qué quedó pendiente

- **Revalidar estado de un pago**: consultar de nuevo la API de MP y actualizar `wa_payments` (requiere Edge Function o RPC que llame a MP).
- **Reprocesar webhook**: re-ejecutar lógica de aprobación para un `mp_payment_id` (riesgoso; solo si se documenta bien).
- **Activar manualmente una suscripción** (sin pago): ya cubierto de forma indirecta con "Cambiar plan" y "Extender plan"; no hay botón explícito "Activar suscripción para este pago" que marque el pago como approved y actualice el negocio (se puede añadir una RPC si lo necesitas).
- **Notificaciones "plan próximo a vencer" y "suscripción vencida"**: no se crean automáticamente; se puede añadir un cron o una comprobación al cargar el módulo que llame a una RPC que inserte esas notificaciones.
- **Integración con correo**: la estructura de notificaciones está lista; falta configurar envío de email al crear o al marcar tipos concretos.

---

## Cómo probar

### Requisitos

- Usuario con `role = 'admin'` (en `app_metadata` o `user_metadata` en Supabase Auth).
- Migración `20260310400000_admin_payments_and_notifications.sql` aplicada.
- Edge Function `mp-webhook` desplegada (con inserciones en `wa_admin_notifications`).

### Pruebas

1. **Acceso**
   - Iniciar sesión como admin.
   - En el sidebar debe aparecer "Panel admin" y "Pagos y Suscripciones".
   - Ir a "Pagos y Suscripciones" y comprobar que se carga la pantalla sin error.

2. **Resumen**
   - Ver que las tarjetas muestran números (aunque sean 0) y que "Planes más vendidos" muestra datos si hay pagos aprobados.

3. **Tabla y filtros**
   - Aplicar filtros por estado, plan, origen, fechas y buscador.
   - Comprobar que la tabla se actualiza y que la paginación funciona.

4. **Detalle de pago**
   - Clic en una fila de la tabla.
   - Comprobar que se abre el drawer con datos del pago, metadata y eventos del webhook.
   - Clic en "Ver negocio" y comprobar que se muestra el detalle del negocio con historial y auditoría.

5. **Acciones admin**
   - En el detalle de un negocio, usar "Extender plan" (días y motivo) y "Cambiar plan" (plan y motivo).
   - Comprobar mensaje de éxito y que en "Auditoría" aparece la acción con payload.

6. **Notificaciones**
   - Abrir el panel "Notificaciones" y comprobar que se listan.
   - Marcar una como leída y "Marcar todas como leídas" y comprobar que el contador de no leídas se actualiza.

7. **Notificaciones desde backend**
   - Generar un pago aprobado (flujo normal con MP o actualizando en BD un pago a `approved`) y comprobar que aparece una notificación "Pago aprobado".
   - En el webhook, si se envía un `mp_payment_id` ya procesado, debe crearse una notificación "Pago duplicado ignorado".

---

## Flujo de Mercado Pago

- No se modificó el flujo de creación de preferencias ni el de pago del usuario.
- Solo se añadieron inserciones en `wa_admin_notifications` en el webhook (duplicado y error de API).
- El trigger en `wa_payments` crea notificaciones cuando un pago pasa a approved/rejected (por webhook o por cualquier otro update).
