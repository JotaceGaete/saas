# Informe de limpieza: eliminación de dLocal Go

**Fecha:** Limpieza completa de la integración dLocal Go. El proyecto queda solo con el flujo de pagos vigente (Mercado Pago en Chile).

---

## 1. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/config/paymentProvider.js` | Eliminados `DLOCAL_COUNTRIES`, `usesDlocal`, referencias a dLocal. `getPaymentProvider()` devuelve `'mercado_pago'` solo para Chile y `null` para el resto. |
| `src/pages/plans/index.jsx` | Eliminados estado `selectedPaymentProvider`, handlers `handlePayWithDlocal` y `confirmPayWithDlocal`, botón y flujo dLocal. Solo se muestra pago con Mercado Pago en Chile; para otros países, mensaje "Pago con tarjeta próximamente en tu país". |
| `supabase/config.toml` | Eliminadas secciones `[functions.create-dlocal-checkout]` y `[functions.dlocal-webhook]`. Añadido comentario de que la integración fue eliminada. |
| `.env.example` | Añadida nota de que las variables `DLOCAL_GO_*` no se usan y pueden eliminarse de Supabase. |
| `docs/DLOCAL_GO_INTEGRATION.md` | Reemplazado contenido: ya no describe la integración activa; indica que dLocal Go fue descartado y documenta el flujo vigente (solo Mercado Pago en Chile). |

---

## 2. Archivos eliminados

| Archivo | Motivo |
|---------|--------|
| `docs/AUDITORIA_DLOCAL_GO.md` | Auditoría obsoleta de la integración dLocal. |
| `docs/audit-dlocal-amount-and-pending.md` | Auditoría de amount y pending ya no aplicable. |
| `docs/audit-dlocal-integration.md` | Auditoría de integración ya no aplicable. |

**Código eliminado (reemplazado por stubs):**

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/create-dlocal-checkout/index.ts` | Código completo de la función eliminado. Sustituido por un stub que responde **410 Gone** con mensaje "dLocal Go integration removed". |
| `supabase/functions/dlocal-webhook/index.ts` | Código completo del webhook eliminado. Sustituido por un stub que responde **410 Gone** con mensaje "dLocal Go webhook removed". |

---

## 3. Variables que ya no se usan

Pueden eliminarse de **Supabase → Project Settings → Edge Functions → Secrets** (o equivalentes) si estaban definidas:

- `DLOCAL_GO_API_KEY`
- `DLOCAL_GO_SECRET_KEY`
- `DLOCAL_GO_BASE_URL`
- `DLOCAL_GO_WEBHOOK_URL`
- `DLOCAL_GO_WEBHOOK_SECRET`

Ninguna parte del código ni de la configuración activa las referencia.

---

## 4. Funciones / endpoints que quedaron fuera de uso

| Recurso | Estado |
|---------|--------|
| **create-dlocal-checkout** | Stub 410. El frontend ya no lo llama. Si algo lo invocara, recibiría 410 Gone. |
| **dlocal-webhook** | Stub 410. No debe configurarse como URL de notificación en ningún proveedor. |

Recomendación: en el próximo despliegue, desplegar solo las funciones que sí se usan (`create-mp-preference`, `mp-webhook`, `plan-change-preview`, etc.). Opcionalmente se pueden eliminar las carpetas `supabase/functions/create-dlocal-checkout` y `supabase/functions/dlocal-webhook` del repositorio; mientras existan, los stubs evitan que un deploy genérico falle por falta de archivo.

---

## 5. Estado final del sistema de pagos

- **Chile (CL):**  
  - Proveedor: **Mercado Pago**.  
  - Flujo: Usuario en `/plans` → "Contratar" / "Subir plan" → preview → Confirmar → `create-mp-preference` → redirección a Checkout Pro → pago → redirect a `success_url` / `failure_url` / `pending_url` → webhook `mp-webhook` actualiza `wa_payments` y `wa_businesses`.  
  - La UI muestra éxito solo cuando `wa_payments.status === 'approved'` (consulta al volver).

- **Resto de países (AR, BO, BR, CO, …):**  
  - No hay proveedor de pago activo.  
  - En `/plans` se muestran precios y planes; en lugar del botón de pago aparece el texto **"Pago con tarjeta próximamente en tu país"**.  
  - Pie de página: "Pago con tarjeta disponible próximamente en tu país."

- **Base de datos:**  
  - `wa_payments` y `wa_payment_events` no se modifican (siguen con `provider` y valores históricos como `dlocal_go`).  
  - No se crean nuevos pagos con `provider = 'dlocal_go'`.  
  - Mercado Pago e internal_proration siguen operando con la lógica actual.

- **Seguridad:**  
  - No hay botones ni handlers activos que envíen al usuario a dLocal o que llamen a `create-dlocal-checkout`.  
  - Los endpoints de dLocal responden 410 y no procesan datos sensibles.

---

## 6. Resumen

- Frontend: solo Mercado Pago en Chile; resto de países con mensaje “próximamente”.
- Backend: create-dlocal-checkout y dlocal-webhook reemplazados por stubs 410.
- Configuración: config y .env.example actualizados; variables dLocal documentadas como no usadas.
- Documentación: dLocal marcado como descartado; eliminadas auditorías obsoletas.
- Sin código muerto de dLocal en `src`; sin referencias activas a dLocal en el flujo de producción.

El branch principal queda centrado en el flujo real: **Mercado Pago en Chile** y **próximamente** para el resto de países.
