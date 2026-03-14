# dLocal Go — Integración descartada

**Estado:** La integración con dLocal Go fue **eliminada** del proyecto. No se usa en producción ni en desarrollo.

## Flujo de pagos vigente

- **Chile:** Mercado Pago (Checkout Pro por redirección). Planes en `/plans` → crear preferencia con `create-mp-preference` → redirección a MP → webhook `mp-webhook` actualiza `wa_payments` y `wa_businesses`.
- **Resto de países:** En la página de planes se muestra el mensaje *"Pago con tarjeta próximamente en tu país"*. No hay proveedor activo.

## Qué se eliminó

- Frontend: botones y flujo de pago con dLocal en `/plans`.
- Edge Functions: `create-dlocal-checkout` y `dlocal-webhook` fueron reemplazadas por stubs que responden **410 Gone** (no ejecutan lógica).
- Config: `src/config/paymentProvider.js` ya no expone dLocal; solo Mercado Pago para Chile.
- Variables de entorno: `DLOCAL_GO_API_KEY`, `DLOCAL_GO_SECRET_KEY`, `DLOCAL_GO_BASE_URL`, `DLOCAL_GO_WEBHOOK_URL`, `DLOCAL_GO_WEBHOOK_SECRET` **no se usan**. Pueden eliminarse de Supabase Dashboard si estaban definidas.

## Base de datos

Las tablas `wa_payments` y `wa_payment_events` siguen teniendo la columna `provider`; el valor `dlocal_go` se mantiene por historial. No se crean nuevos pagos con ese proveedor.
