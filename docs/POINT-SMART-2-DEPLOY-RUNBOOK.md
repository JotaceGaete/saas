# POINT-SMART-2-9 — Runbook de despliegue controlado

Este documento es deliberadamente operativo: no despliega nada por sí solo.

## Gate 0 — no cobrar todavía
El PR #86 debe permanecer Draft hasta completar este runbook. La primera prueba
debe ser una venta de importe mínimo y controlado, con una sola Smart 2 y una
caja abierta.

## 1. Variables/secrets requeridos
Las funciones Point reutilizan la conexión OAuth del comercio guardada en
`mp_connections`; no necesitan un access token MP global.

Supabase/runtime:
- `SUPABASE_URL` (provista por Supabase)
- publishable/client key: `SUPABASE_PUBLISHABLE_KEYS["default"]`, o fallback
  local `SUPABASE_PUBLISHABLE_KEY`, o legacy `SUPABASE_ANON_KEY`
- admin key: `SUPABASE_SECRET_KEYS["default"]`, o fallback local
  `SUPABASE_SECRET_KEY`, o legacy `SUPABASE_SERVICE_ROLE_KEY`

OAuth Mercado Pago ya existente:
- `MP_CLIENT_ID_CL`
- `MP_CLIENT_SECRET_CL`
- `MP_CLIENT_ID_AR`
- `MP_CLIENT_SECRET_AR`
- `MP_OAUTH_REDIRECT_URI`
- `MP_OAUTH_APP_RETURN_URL`

No agregar `MP_ACCESS_TOKEN_*` para Point: cada cobro usa el token OAuth del
comercio obtenido server-side por `wa_get_mp_connection_for_checkout`.

## 2. Orden obligatorio de base de datos
Aplicar primero las migraciones, en orden:
1. `20260923160000_point_smart_operations.sql`
2. `20260923170000_point_finalize_reservations_cash_guard.sql`
3. `20260923180000_pos_respects_point_stock_reservations.sql`

No desplegar `mp-point-create-order` antes de que las tres estén aplicadas:
la función necesita `cash_session_id`, `crm_point_reserve_stock` y el
finalizador.

## 3. Edge Functions
Después de las migraciones:
1. `mp-point-terminals`
2. `mp-point-setup-terminal`
3. `mp-point-create-order`
4. `mp-point-get-order`
5. `mp-point-cancel-order`
6. `mp-point-webhook`

Las seis tienen `verify_jwt=false` en config.toml por diseño:
- las cinco invocadas por Walinka validan el JWT real dentro del handler;
- el webhook es público y nunca confía en el status del payload: reconsulta la
  order en MP con el OAuth del comercio.

## 4. Frontend
Desplegar frontend solamente después de DB + Edge Functions:
- `src/services/crmService.js`
- `src/pages/crm/CrmTerminal.jsx`

Así nunca aparece el botón Point apuntando a backend incompleto.

## 5. Webhook Mercado Pago
Configurar la URL pública de `mp-point-webhook` en la aplicación MP usada por
OAuth para las notificaciones de Orders/Point admitidas por la configuración
actual de Mercado Pago.

El handler acepta `data.id`/order id solo como hint. Una notificación no puede
crear una venta por sí sola: antes hace GET authoritative de la order y exige
coincidencia de `mp_order_id + external_reference`.

## 6. Smoke test SIN cobro
Antes de enviar una order:
1. iniciar sesión en Walinka;
2. abrir caja;
3. confirmar Mercado Pago conectado;
4. abrir TPV > Cobrar;
5. comprobar que lista la Smart 2 correcta;
6. comprobar `operating_mode=PDV`;
7. si se cambia a PDV, reiniciar físicamente la terminal si MP lo requiere;
8. recargar y volver a listar terminales.

Si falla cualquiera, detenerse: todavía no crear order.

## 7. Primera prueba física
Usar un producto controlado con stock conocido y un importe pequeño.
Registrar antes:
- stock_actual;
- caja abierta / cash_session_id;
- total esperado.

Flujo:
1. Enviar cobro una sola vez.
2. Confirmar que Smart 2 muestra exactamente el total.
3. Pagar físicamente.
4. Esperar `processed`; no pulsar cobrar otra vez.
5. Confirmar una sola invoice, un solo crm_payment mercado_pago y un solo
   movimiento de stock.
6. Confirmar que la operación tiene `crm_invoice_id` y `finalized_at`.
7. Confirmar ticket/reimpresión.
8. Confirmar que stock bajó exactamente una vez.

## 8. Pruebas de recuperación antes de ampliar uso
Ejecutar separadamente:
- refresh mientras está `created/at_terminal`: debe recuperar la misma
  operation, no cobrar de nuevo;
- cancelación en `created`: debe liberar reserva;
- cancelación en `at_terminal`: debe pedir cancelación física;
- intentar cerrar caja con cobro pendiente: debe bloquear;
- webhook + polling concurrentes: una sola invoice;
- order expirada/fallida: sin invoice y reserva liberada.

## 9. Rollback
Si falla la UI pero no hay pagos processed:
- retirar/revertir frontend Point y conservar backend/ledger.

Si existe una order `processed`:
- NO borrar operación, NO volver a cobrar y NO hacer rollback destructivo;
- consultar `mp-point-get-order` y resolver/finalizar esa misma operación.

No revertir migraciones que ya contengan operaciones reales sin una migración
de rollback diseñada para preservar trazabilidad financiera.

## Gate de salida
Solo habilitar Point para uso normal cuando:
- terminal discovery + PDV funcionan;
- primera venta genera exactamente una invoice;
- recovery no duplica;
- cancel/expiry liberan stock;
- cierre de caja queda protegido;
- ticket se imprime/reimprime correctamente.
