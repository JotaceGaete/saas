# fiscal-emit (F2.2 / F2.3) — emisor fiscal server-side, DTE 39

Estado: **implementación en rama de desarrollo (PR #108, borrador). No desplegada. Emisión automática deshabilitada.**
El proveedor real (DTECore) está **bloqueado** hasta verificar su contrato por escrito: el adaptador
real lanza `ContractNotVerifiedError` y no hace red. Las pruebas usan un proveedor simulado.

## Piezas

| Archivo | Qué hace |
|---|---|
| `lib/emit.mjs` | Orquestador de `emit` y `reprint`. Deriva el comercio de la venta, exige rol, reclamo atómico, recibo write-ahead, finalización con comprobación de estado. **Sin reconciliación.** |
| `lib/authz.mjs` | Matriz rol → acción. `emit`: `fiscal_owner`, `fiscal_operator`. `reprint`: además `fiscal_viewer`. |
| `lib/recovery.mjs` | Recuperación de filas vencidas en `sending`. **No recibe proveedor.** Con recibo: finaliza desde el recibo. Sin recibo: `unknown`. Nunca reemite. |
| `lib/reconciler.mjs` | Reconciliación de `unknown` con evidencia. **Fuera de la API pública.** Falla cerrado: exige `authorize` explícito. |
| `lib/evidence.mjs` | Validación de la evidencia de reconciliación (mismas reglas que la BD). |
| `lib/document.mjs` | Validación del documento del proveedor: folio entero, XML y PDF en base64 estricto. |
| `lib/eligibility.mjs` | Reglas previas al reclamo: pagada, CL, emisor verificado, emisión global, líneas verificadas, medio de pago (efectivo o Point confirmado con `mercado_pago`). |
| `lib/payload.mjs` | Cuerpo DTECore. Sin folio ni fecha. Descripción ≤ 80, precios enteros, suma = total. |
| `lib/state.mjs` | Máquina de estados. Cada transición indica la vía que puede pedirla (`claim`, `provider`, `recovery`, `reconcile`, `credit_note`). |
| `lib/store-common.mjs` | Mapeo compartido de respuestas. Distingue errores de dominio (`FISCAL_*`) de errores de infraestructura (`StoreError`). |
| `lib/store-supabase.mjs` | Almacén sobre supabase-js (service_role). Solo RPC de `public`. **No verificado contra PostgREST real.** |
| `lib/store-pg.mjs` | Almacén Postgres para pruebas. **Solo** conecta a bases locales cuyo nombre termina en `_test`. |
| `lib/http.mjs` | Manejador HTTP. Solo `emit` y `reprint`; cualquier otra acción responde `UNKNOWN_ACTION`. |
| `lib/providers/simulated.mjs` | Proveedor simulado (ok, rejected, timeout, network, no_pdf, no_folio). Sin red. |
| `lib/providers/dtecore-blocked.mjs` | Adaptador real bloqueado hasta verificar el contrato. |
| `test/unit/` | Pruebas puras, orquestador en memoria, fallos inyectados y mapeo PostgREST (`npm test`). |
| `test/db/` | Pruebas contra Postgres real `walinka_test` (`npm run test:db`). |
| `test/deno/` | Cableado de la Edge Function en Deno (`npm run test:deno`). |

Migración asociada (no aplicada en producción): `supabase/fiscal-recovery/proposed/20261031_fiscal_single_ledger_guard.sql`.

## Modelo de permisos

- **Tenant**: el `business_id` sale siempre de la venta. Un usuario sin rol fiscal activo en ese negocio
  recibe `SALE_NOT_FOUND`, igual que si la venta no existiera.
- **Rol**: el permiso sale de `fiscal.business_fiscal_roles` (fila activa, negocio activo), no de
  `wa_businesses.user_id`. Un rol insuficiente recibe `FISCAL_ROLE_REQUIRED` (403).
- **Dueño**: un trigger en `wa_businesses` siembra la fila `fiscal_owner` al crear el negocio.
- **Reconciliación**: sus permisos tributarios específicos **no están definidos**. Por eso queda fuera de la API.

## Recuperación de `sending`

- Un fallo al guardar el recibo no detiene la finalización: el documento ya está en memoria.
- Un fallo al finalizar deja la fila en `sending` con su recibo. La recuperación la completa desde el recibo.
- Sin recibo y vencida (`updated_at` anterior a `staleAfterMs`, mínimo 5 min), pasa a `unknown`.
- Una respuesta perdida tras confirmar se resuelve leyendo el estado real: no se reintenta la llamada al proveedor.
- Una carrera entre emisión y recuperación no deja una fila `issued` sin recibo: el emisor detecta el cambio de estado.

## Ejecutar

```bash
cd supabase/functions/fiscal-emit
npm install
npm test                                         # 132 pruebas unitarias
FISCAL_TEST_PG_DB=walinka_test npm run test:db   # 77 pruebas contra Postgres local
npm run test:deno                                # 8 pruebas del cableado (requiere deno 2.9.6)
```

Las pruebas de base necesitan una base local `*_test` con la migración propuesta aplicada y con
privilegios de `service_role` (en Supabase vienen por defecto; en la base de prueba se conceden a mano).

## Verificado y no verificado

Verificado (ejecutado en este entorno):
- Orquestador, roles, recuperación, fallos inyectados y mapeo de errores: `npm test` (132).
- Migración propuesta en Postgres 16 (`walinka_test`): RPC de recibo y recuperación, roles,
  permisos de `anon`/`authenticated`, guardas, triggers, evidencia y paridad SQL/JS: `npm run test:db` (77).
  Incluye un extremo a extremo con fallo real de finalización y otro con caída antes del recibo.
- Mutación: quitar la escritura del recibo hace fallar 8 pruebas de recuperación.
- Cableado de Edge Function en Deno 2.9.6: `npm run test:deno` (8).

NO verificado:
- **`lib/store-supabase.mjs` contra PostgREST real.** Las pruebas usan respuestas con la forma
  `{ message, code, details, hint }` y excepciones de red, pero no un servidor PostgREST. Ese servidor
  no está disponible aquí (su binario solo se distribuye desde GitHub y no hay Docker).
- `index.ts` desplegado en Supabase (`supabase functions serve`): no hay CLI ni Docker en el entorno.
- Datos de producción: solo lectura. No se aplicó nada.

## Pendiente de decisión (no implementado)

- Política tributaria de reconciliación: quién puede reconciliar, con qué evidencia y bajo qué norma.
  Hasta entonces `createReconciler` exige un `authorize` explícito y no tiene ruta HTTP.
- Cambio de dueño de un comercio: hoy no revoca las filas de rol. Debe definirse.
- Recibo en conflicto (`FISCAL_RECEIPT_CONFLICT`): hoy la fila queda `unknown` para revisión humana.
  No se elige automáticamente qué documento es válido.
- Umbral `staleAfterMs` en producción: debe ser mucho mayor que el tiempo máximo de una emisión.

## Qué no hace todavía

- Proveedor real DTECore: bloqueado hasta verificar el contrato por escrito.
- Impresión: `lib/print-plan.mjs` prepara el plan desde el PDF guardado; no envía nada. Rasterizar el
  PDF a GS v 0 y la prueba de PDF417 en XP-80C están pendientes. Print Connector no se modificó.
- Migración endurecida solo aplicada en `walinka_test`; no aplicada en producción.
- Endpoints de PDF y descarga en `main` (`api/fiscal/document.js`, `download.js`, `pdf.js`): siguen
  usando el guard solo de dueño (`api/_lib/siisolutions-owner-guard.js`). No se cambiaron en esta rama.
