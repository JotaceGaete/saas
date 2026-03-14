# Auditoría: integración dLocal Go en VentALink

## 1. Flujo actual (Mercado Pago)

### Archivos involucrados

| Área | Archivo | Rol |
|------|---------|-----|
| **Frontend planes** | `src/pages/plans/index.jsx` | Usuario elige plan → preview (plan-change-preview) → confirmar → create-mp-preference → redirección a `init_point` (MP). Mensajes success/failure/pending por query params. |
| **Preview cambio plan** | `supabase/functions/plan-change-preview/index.ts` | POST con JWT; calcula prorrateo, upgrade/downgrade/renewal; no cobra. |
| **Crear preferencia MP** | `supabase/functions/create-mp-preference/index.ts` | Resuelve negocio por auth.uid(); crea fila en `wa_payments` (pending); llama a MP API; devuelve `init_point`. Downgrade no paga (programa scheduled_plan_slug). Upgrade con monto 0 aplica cambio interno (metadata.provider = 'internal_proration'). |
| **Webhook MP** | `supabase/functions/mp-webhook/index.ts` | POST público (verify_jwt = false). Idempotencia por `wa_payment_events.mp_payment_id`. Solo si status === 'approved' actualiza `wa_payments` y `wa_businesses.plan_slug` + `plan_expires_at`. |
| **Constantes planes** | `src/constants/plans.js` | PLAN_SLUGS, precios CLP/ARS, límites, helpers. |
| **País/moneda** | `src/config/country.js` | getCountryCode() por hostname (ar.ventalink.app → AR, resto → CL). |
| **Admin pagos** | `src/services/adminPaymentsService.js`, `src/pages/admin/AdminPaymentsPage.jsx` | Listado, filtros, detalle, estadísticas (wa_payments_admin_view, wa_admin_payments_stats). |

### Base de datos actual

- **wa_businesses**: `plan_slug`, `plan_expires_at`, `scheduled_plan_slug`, `scheduled_change_at`.
- **wa_payments**: `id`, `business_id`, `user_id`, `plan_slug`, `amount`, `currency`, `status` (pending | approved | rejected | cancelled | in_process), `mp_preference_id`, `mp_payment_id`, `mp_status`, `mp_status_detail`, `mp_payment_type`, `mp_payment_method`, `external_reference`, `plan_activated_at`, `plan_expires_at`, `raw_mp_response`, `metadata`, `created_at`, `updated_at`.  
  Sin columna `provider`; el origen se infiere en la vista admin por `external_reference` y `metadata->>'provider'`.
- **wa_payment_events**: `id`, `payment_id`, `mp_payment_id`, `event_type`, `mp_status`, `raw_payload`, `processed_at`. Pensado para MP; no hay campo genérico `provider_event_id` ni `provider`.

No existen tablas `subscriptions`, `billing_events` ni `payment_provider_customers`. La “suscripción” es implícita: plan + vencimiento en `wa_businesses`; historial en `wa_payments`.

### Flujo exacto actual (usuario elige plan → plan activado)

1. Usuario en `/plans` elige un plan (ej. Pro) y pulsa el botón (Mercado Pago).
2. Frontend llama `plan-change-preview` con `targetPlanSlug` y `country`; muestra resumen (prorrateo, total).
3. Usuario confirma; frontend llama `create-mp-preference` con `planSlug`, `country`, `success_url`, `failure_url`, `pending_url`.
4. Backend: valida JWT, resuelve negocio por `user_id`, calcula prorrateo. Si downgrade → programa cambio y responde 400 (sin pago). Si upgrade con monto 0 → aplica cambio en BD y responde 200 sin MP. Si monto > 0 → inserta `wa_payments` (status pending, external_reference `waP:<paymentId>:<businessId>:<planSlug>`), crea preferencia en MP, guarda `mp_preference_id` y devuelve `init_point`.
5. Frontend redirige a `init_point` (checkout MP).
6. Usuario paga en MP; MP envía webhook a `mp-webhook`.
7. Webhook: parsea `data.id` (mp_payment_id), comprueba idempotencia en `wa_payment_events`, GET pago a MP API, parsea `external_reference`, registra evento, si status === 'approved' actualiza `wa_payments` y `wa_businesses.plan_slug` + `plan_expires_at`.
8. Usuario puede volver por `success_url`; el front solo muestra mensaje y hace `refreshBusiness()`; el plan ya está actualizado por el webhook.

---

## 2. Qué partes ya existen y qué reutilizar

- **Planes y precios**: `src/constants/plans.js` y catálogos en Edge Functions (CL/AR). Reutilizar sin tocar lógica de precios.
- **Preview y prorrateo**: `plan-change-preview` y lógica en `create-mp-preference`. Reutilizar para dLocal (mismo input: planSlug, country; mismo output conceptual: finalAmount, changeType, etc.).
- **Tabla de pagos**: `wa_payments` tiene casi todo; falta identificar provider de forma explícita y campos genéricos para dLocal (provider_payment_id, etc.).
- **Eventos de webhook**: `wa_payment_events` es por pago MP; habrá que ampliarlo a “cualquier provider” (provider + provider_payment_id) para idempotencia y auditoría.
- **Admin**: Vista y servicios asumen origen MP o internal; habrá que incluir `dlocal_go` en la vista y filtros.

---

## 3. Archivos que se tocarán (plan)

| Acción | Archivo |
|--------|---------|
| **Migración BD** | Nueva migración: añadir a `wa_payments` columnas `provider` (text, default 'mercado_pago'), `provider_payment_id` (text nullable), opcionalmente `provider_subscription_id` (text nullable); añadir a `wa_payment_events` columnas `provider` (text), `provider_payment_id` (text) para idempotencia multi-provider. Ajustar vista `wa_payments_admin_view` para usar `provider`. |
| **Edge Function: crear checkout dLocal** | Nueva función `create-dlocal-checkout` (o `create-dlocal-payment`): mismo flujo que create-mp-preference (auth, negocio, prorrateo, downgrade/upgrade 0), crea fila en `wa_payments` con provider = 'dlocal_go', llama API dLocal Go para crear pago/sesión, guarda provider_payment_id y redirect_url, devuelve redirect_url al front. |
| **Edge Function: webhook dLocal** | Nueva función `dlocal-webhook`: verify_jwt = false; validar firma si dLocal lo ofrece; guardar payload en wa_payment_events (o tabla billing_events); idempotencia por provider + provider_payment_id; solo si estado = aprobado/pagado actualizar wa_payments y wa_businesses. |
| **Frontend planes** | `src/pages/plans/index.jsx`: añadir opción de “Pagar con dLocal” (o elegir provider según país/config); llamar a la nueva Edge Function en lugar de (o además de) create-mp-preference; redirigir a la URL devuelta. Mantener flujo de preview y mensajes success/failure/pending. |
| **Constantes / config** | Opcional: en `src/config/country.js` o nuevo `src/config/paymentProviders.js` definir por país qué provider usar (MP vs dLocal). Por ahora puede ser feature-flag o segundo botón. |
| **Admin** | `adminPaymentsService` y vista ya filtran por `origin`; asegurar que `provider = 'dlocal_go'` se mapee a un origen visible (ej. 'dlocal_go') en la vista. |
| **Documentación / env** | Documentar variables: DLOCAL_GO_API_KEY, DLOCAL_GO_SECRET_KEY, DLOCAL_GO_WEBHOOK_SECRET (si existe), DLOCAL_GO_BASE_URL (sbx vs live). |

No se eliminará ni se reemplazará la lógica de Mercado Pago; se marcará como legacy solo si en algún momento se deja de usar (por ejemplo comentando “Legacy: preferencia MP” donde corresponda). La nueva ruta será paralela.

---

## 4. Riesgos

- **Duplicar activación**: Si tanto el redirect de vuelta como el webhook actualizaran el plan, habría que tener cuidado. Mitigación: no activar nunca en el redirect; solo mostrar mensaje y refrescar; activación solo en webhook.
- **wa_payment_events atado a MP**: Hoy usa `mp_payment_id`. Para dLocal hay que poder registrar eventos por `provider` + `provider_payment_id` y comprobar idempotencia por ese par. Migración: añadir columnas provider y provider_payment_id a wa_payment_events; en mp-webhook seguir rellenando mp_payment_id para compatibilidad; en dlocal-webhook usar provider + provider_payment_id.
- **Vista admin**: Hoy calcula `origin` con `CASE WHEN ... THEN 'internal' ELSE 'mercado_pago'`. Habrá que incluir `provider` en la vista (o leer de la columna `provider` de wa_payments).
- **Precios y monedas por país**: dLocal Go soporta múltiples países; los catálogos ya tienen CL/AR. Asegurar que currency y country se pasen correctamente al crear el pago en dLocal (API puede requerir country_code y currency).
- **Firma del webhook**: Si dLocal Go documenta firma (ej. HMAC), hay que validarla; si no, al menos registrar payload y procesar de forma idempotente.

---

## 5. Flujo exacto propuesto (usuario elige plan → plan activado con dLocal Go)

1. Usuario en `/plans` elige plan y pulsa “Pagar con dLocal” (o el flujo único si se decide usar solo dLocal en ciertos países).
2. Frontend: igual que hoy para preview (plan-change-preview); al confirmar, llama a la nueva Edge Function `create-dlocal-checkout` (JWT, planSlug, country, success_url, failure_url, cancel_url).
3. Backend create-dlocal-checkout: valida JWT, resuelve negocio por user_id, calcula prorrateo (misma lógica que create-mp-preference). Si downgrade → responde sin crear pago. Si monto 0 → aplica cambio interno y responde 200. Si monto > 0 → inserta `wa_payments` (provider = 'dlocal_go', status = 'pending', provider_payment_id = null por ahora), llama a dLocal Go API (POST crear pago/sesión con amount, currency, notification_url, return_urls), recibe redirect_url y id de pago, actualiza wa_payments con provider_payment_id y raw response, devuelve redirect_url al front.
4. Frontend redirige a redirect_url (checkout dLocal).
5. Usuario paga en dLocal; dLocal envía webhook a la nueva función dlocal-webhook.
6. dlocal-webhook: valida firma si existe; inserta en wa_payment_events (provider = 'dlocal_go', provider_payment_id); si ya existe evento procesado con mismo provider + provider_payment_id y status approved → 200 idempotente; si no, procesa: si estado = approved/paid → actualiza wa_payments (status approved, plan_activated_at, plan_expires_at) y wa_businesses (plan_slug, plan_expires_at); si no → solo actualiza wa_payments status (pending/failed/cancelled/expired/refunded).
7. Usuario vuelve por return_url; frontend muestra mensaje según query param y hace refreshBusiness(); el plan ya está actualizado por el webhook.

---

## 6. Estados a manejar (dLocal y BD)

En `wa_payments.status` conviene unificar con los que ya existen y ampliar si hace falta:

- pending  
- approved (paid)  
- failed (rejected)  
- cancelled  
- expired  
- refunded (si dLocal lo envía)

En la migración se puede dejar el CHECK de status ampliado para incluir refunded si no está. wa_payment_events seguirá registrando el estado del provider en cada evento.

---

## 7. Preparación para renovación, upgrade, downgrade, cancelación

- **Renovación**: Mismo flujo que un pago nuevo (usuario en planes → renovar); el backend calcula renewal y crea un nuevo pago con provider dlocal_go.
- **Upgrade/downgrade**: Ya resuelto con plan-change-preview y prorrateo; la nueva función de checkout dLocal reutilizará esa lógica.
- **Vencimiento**: Hoy no hay cron que baje el plan al vencer; existe `apply-scheduled-plan-changes` para scheduled_plan_slug. Para vencimiento por fecha (plan_expires_at) se podría reutilizar o añadir un cron que ponga plan_slug = 'starter' cuando plan_expires_at < now() y plan_slug in ('pro','business'). Fuera de alcance de esta integración pero la BD ya soporta plan_expires_at.
- **Cancelación**: dLocal puede enviar evento “cancelled”; el webhook actualizará wa_payments a cancelled; no se cambia el plan del negocio hasta que expire (comportamiento actual con MP).

---

## 8. Variables de entorno necesarias (dLocal Go)

- `DLOCAL_GO_API_KEY` – API key (dashboard dLocal Go).  
- `DLOCAL_GO_SECRET_KEY` – Secret key.  
- `DLOCAL_GO_WEBHOOK_SECRET` – (opcional) Para validar firma del webhook si lo documentan.  
- `DLOCAL_GO_BASE_URL` – `https://api-sbx.dlocalgo.com` (sandbox) o `https://api.dlocalgo.com` (live).  

Solo en Edge Functions (Supabase secrets); nunca en el frontend.

---

## 9. Resumen de entregables tras implementación

- **Archivos creados**: migración SQL (provider y campos genéricos en wa_payments/wa_payment_events), `supabase/functions/create-dlocal-checkout/index.ts`, `supabase/functions/dlocal-webhook/index.ts`, opcional `docs/DLOCAL_GO_INTEGRATION.md`.  
- **Archivos modificados**: `src/pages/plans/index.jsx` (botón/opción dLocal y llamada a nueva función), vista `wa_payments_admin_view` (incluir provider), posiblemente `adminPaymentsService` si se filtra por provider.  
- **Rutas nuevas**: POST `/functions/v1/create-dlocal-checkout`, POST `/functions/v1/dlocal-webhook` (configurar URL en dashboard dLocal).  
- **Flujo de pago final**: como en la sección 5.  
- **Pendiente para producción**: obtener credenciales live de dLocal Go, configurar webhook en su dashboard, pruebas end-to-end con tarjetas de test y luego live; opcional cron de vencimiento de planes.

---

## 10. Referencia rápida dLocal Go (docs)

- Auth: `Authorization: Bearer <API_KEY>:<SECRET_KEY>`.  
- Sandbox: `https://api-sbx.dlocalgo.com`; Live: `https://api.dlocalgo.com`.  
- Crear pago: POST a endpoint de pagos con amount, currency, notification_url, redirect; respuesta con redirect_url.  
- Webhook: configurar notification_url; validar firma si existe; procesar eventos de forma idempotente.

Con esta base se puede pasar a la fase de implementación (migración, create-dlocal-checkout, dlocal-webhook, cambios en frontend y admin).

---

# Informe final de implementación

## Archivos creados

| Archivo | Descripción |
|---------|-------------|
| `supabase/migrations/20260313100000_payments_provider_dlocal.sql` | Añade `provider`, `provider_payment_id` a `wa_payments` y `wa_payment_events`; actualiza vista admin. |
| `supabase/functions/create-dlocal-checkout/index.ts` | Edge Function: auth, negocio, prorrateo, creación de pago en dLocal Go, devuelve `redirect_url`. |
| `supabase/functions/dlocal-webhook/index.ts` | Edge Function: recibe notificaciones, idempotencia, actualiza `wa_payments` y `wa_businesses` solo si approved. |
| `docs/DLOCAL_GO_INTEGRATION.md` | Variables de entorno, despliegue y flujo dLocal Go. |

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `supabase/config.toml` | Añadidos `[functions.create-dlocal-checkout]` y `[functions.dlocal-webhook]` con `verify_jwt = false`. |
| `supabase/functions/create-mp-preference/index.ts` | En el insert de pago interno (upgrade monto 0) se añade `provider: 'internal_proration'`. |
| `src/pages/plans/index.jsx` | Estado `paymentProvider`; `handlePayWithDlocal` y `confirmPayWithDlocal`; botón "Pagar con dLocal" en cada plan; confirm según provider. |

## Variables de entorno necesarias

- **Supabase Edge Functions:** `DLOCAL_GO_API_KEY`, `DLOCAL_GO_SECRET_KEY`, `DLOCAL_GO_BASE_URL` (opcional, por defecto sandbox), `DLOCAL_GO_WEBHOOK_URL`, `DLOCAL_GO_WEBHOOK_SECRET` (opcional).

## Rutas nuevas

- `POST /functions/v1/create-dlocal-checkout` — Crear checkout dLocal (JWT requerido).
- `POST /functions/v1/dlocal-webhook` — Webhook público para notificaciones de dLocal Go.

## Flujo de pago final

1. Usuario elige plan → "Pagar con dLocal" → preview (plan-change-preview).
2. Confirmar → POST create-dlocal-checkout → redirect a `redirect_url` (checkout dLocal).
3. Usuario paga en dLocal; dLocal envía POST a dlocal-webhook.
4. Webhook: registra evento, si status approved actualiza `wa_payments` y `wa_businesses`; si no, solo actualiza status del pago.
5. Usuario vuelve por success_url; frontend muestra mensaje y refresca negocio (el plan ya está activado por el webhook).

## Pendiente para producción

- Ejecutar la migración en la base de datos (Supabase).
- Desplegar las dos Edge Functions y configurar secretos.
- En el dashboard de dLocal Go: configurar la URL del webhook y, si aplica, el secret para firma.
- Probar en sandbox con tarjetas de test; luego activar cuenta live y cambiar `DLOCAL_GO_BASE_URL` a `https://api.dlocalgo.com`.
- Verificar que la API de dLocal Go use exactamente el mismo esquema de creación de pago (campos `order_id`, `success_url`, `notification_url`, etc.); ajustar `create-dlocal-checkout` si la documentación oficial difiere.
