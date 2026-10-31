# F2 — Diseño de implementación de la emisión fiscal (TPV Chile)

Estado: diseño. No se ha desplegado, migrado ni emitido nada. Emisión automática: **deshabilitada**.
Complementa `F1-arquitectura-emision.md`. Lo que aquí figura como "no verificado" no debe implementarse
como si lo estuviera hasta confirmarlo.

## 0. Hallazgos nuevos (investigación de F1)

### 0.1 Origen de la boleta 51106: identificado por logs, código no versionado
Logs de Postgres/PostgREST (solo lectura, 2026-10-31 10:46 UTC):

| Hora UTC | Cliente | Operación |
|---|---|---|
| 10:46:56.5 | `node` | `GET crm_fiscal_issuances` con `status in (sending,unknown)` → ninguna |
| 10:46:56.8 | `node` | `POST fiscal_test_sales` (marca `PRUEBA_TECNICA_SII`) |
| 10:46:56.9–57.0 | `node` | lectura de venta, pagos, negocio e ítems |
| 10:46:57.2 | `node` | `rpc/crm_begin_manual_single_emission` (reserva la fila, consume la autorización) |
| entre 57.2 y 58.6 | — | llamada a DTECore (saliente, no visible en Supabase) |
| 10:46:58.6 | `node` | `rpc/crm_finalize_fiscal_issuance` → `issued` con folio, XML y PDF |

- El emisor es un **proceso Node con service role**, lanzado manualmente. No es una edge function
  desplegada ni un endpoint de la app.
- Búsqueda en todo el historial de git, todas las ramas remotas y `origin/main`: ninguna referencia a
  `idBoletaOperacion`. Solo aparecen `siisolutions` y `DTECore` en lecturas (`api/fiscal/*`) y en mis
  propios documentos.
- Producción (Vercel `saas`, deployment target `production`) se construye desde `main` `368734d`, que
  no contiene emisor.
- **Conclusión**: el script que emitió la 51106 no está en ningún repo accesible. Falta su fuente.

### 0.2 La 51106 está marcada como prueba técnica
`fiscal_test_sales` la marca `PRUEBA_TECNICA_SII` en el mismo instante de la emisión. Eso significa que
es un documento real con folio consumido, pero identificado como prueba. **Confirmar** si se reportó al
SII como documento de certificación o de producción antes de llamarla "primera emisión real".

### 0.3 Conector de impresión: no acepta PDF
- `POST /v1/print` acepta bytes ESC/POS crudos con `idempotencyKey`. No hay ruta para PDF.
- El validador acepta `GS v 0` (raster) y `ESC *` (imagen). Por eso una imagen rasterizada **sí** es
  imprimible; un PDF no.
- Límite de payload: 256 KB decodificados.
- Por tanto, imprimir el PDF fiscal exige **rasterizarlo en servidor** a ancho de 80 mm y enviarlo como
  `GS v 0`, o usar una ruta de impresión distinta. Ver sección 4.

### 0.4 Seguridad del ledger
Verificado en catálogo (solo lectura):
- `crm_fiscal_issuances`, `fiscal.issuers`, `fiscal.operations`, `fiscal.pos_dte39_outbox`,
  `fiscal.line_tax_verifications`, `fiscal.dte39_emission_control`, `fiscal.business_tax_defaults`,
  `fiscal.dte39_reconciliation_evidence`, `manual_fiscal_authorizations`, `fiscal_test_sales`,
  `crm_point_fiscal_outbox`: **RLS activo, 0 políticas, sin privilegios para `anon` ni `authenticated`**.
- Solo `service_role` puede operar el ledger. Por tanto **el aislamiento entre comercios del ledger
  depende del código del emisor, no de la base de datos** (service_role salta RLS).
- Funciones fiscales: ninguna ejecutable por `anon` o `authenticated`, salvo
  `fiscal.dte39_evidence_append_only()` (función trigger, sin efecto; **revocar por higiene**).
- `crm_invoices`: `anon` tiene `SELECT` en el catálogo, pero RLS con una política solo para
  `authenticated` (`business_id` del usuario). Sin política para `anon`, no devuelve filas. Riesgo bajo;
  **revocar el privilegio de `anon`** por higiene.
- `crm_claim_held_pos_sale` (`SECURITY DEFINER`, ejecutable por `anon`): valida `auth.uid()` y pertenencia
  del negocio. No es fuga; fuera del alcance fiscal.
- Integridad cruzada: `crm_fiscal_issuances` tiene FK compuesta `(sale_id, business_id) → crm_invoices(id,
  business_id)`. Una fila no puede apuntar a una venta de otro comercio. **Esto es correcto y debe
  mantenerse.**

## 1. Contrato DTECore: qué está verificado y qué no

| Punto | Estado | Fuente |
|---|---|---|
| Endpoint de emisión `POST /dte/boletas/emitir` con `x-api-key` | Reportado, **no verificado** | Documentación compartida por el owner (no accesible desde aquí) |
| Campos mínimos: `rutOperador`, `idBoletaOperacion`, `detalles[]` con precio con IVA | Reportado, **no verificado** | Ídem |
| Respuesta `{ folio, xmlBase64 }` cuando se pide PDF | **Incierto**: la estructura con `retornarPdf=true` no está confirmada | Ídem |
| Comportamiento ante `idBoletaOperacion` repetido | **Desconocido.** Decide si la idempotencia es real | Pendiente |
| Consulta de estado ante el SII (aceptada/rechazada) | **Desconocida.** La 51104 quedó en REC (-11) sin resolver | Pendiente |
| Anulación por nota de crédito `tpoDocRef "39"` | Reportado, no verificado | Ídem |
| Folios restantes `GET /dte/boletas/folios/resumen` | Reportado, no verificado | Ídem |

Búsqueda web (WebSearch) no encontró documentación oficial de DTECore. El dominio
`api.siisolutions.cl` no está en la lista de dominios permitidos de esta sesión, así que no pude
leer su documentación. **No se debe implementar nada de la tabla como verificado** hasta obtener la
documentación o una respuesta escrita de DTECore.

Regla de diseño: si la respuesta de DTECore no permite distinguir "emitida" de "no emitida" ante un
reintento con el mismo `idBoletaOperacion`, **no hay reintento automático**. Todo fallo ambiguo va a
`unknown`.

## 2. Diseño de la emisión (F2)

### 2.1 Componentes
1. **Disparador**: al cerrar una venta pagada (TPV) o confirmar un cobro Point, se llama a
   `crm_fiscal_register_pending(business, sale, operation_id)`. Solo crea la fila `pending`. No llama
   al proveedor.
2. **Emisor**: edge function `fiscal-emit` (server-side, service role). Único productor de llamadas a
   DTECore. Recibe `sale_id` y **deriva `business_id` de la venta en la base**, nunca del cliente.
3. **Reconciliador**: edge function `fiscal-reconcile`, manual. Consulta a DTECore solo para filas
   `unknown` y registra evidencia append-only. Nunca reemite.
4. **Impresión**: `fiscal-render` rasteriza el PDF guardado. Ver sección 4.

### 2.2 Secuencia de emisión (`fiscal-emit`)
1. Leer la venta y verificar: `business_id` de la venta = `business_id` de la fila; país CL; negocio con
   fiscal habilitado; configuración de impuestos confirmada por el owner; líneas con categoría verificada.
2. `crm_claim_fiscal_issuance(business, sale, operation_id)`: pasa `pending → sending`. Si devuelve
   `false`, **parar** (otra instancia ya la reclamó o ya está emitida/unknown).
3. Llamar a DTECore con `idBoletaOperacion = operation_id` y `retornarPdf=true`, `formatoPdf="80mm"`.
   Timeout corto. No hay reintento automático de la llamada.
4. Respuesta válida con folio, XML y PDF: `crm_finalize_fiscal_issuance(…,'issued',folio,xml,pdf)`.
   Respuesta de error explícito del proveedor: `…,'failed'` con código. Timeout, red o respuesta
   ambigua: `…,'unknown'`.
5. Devolver al TPV el estado. La venta **no se bloquea** por el resultado fiscal.

### 2.3 Invariantes (cada una debe tener prueba)
- I1. Una venta tiene como máximo una fila fiscal activa (`sending`, `unknown`, `issued`) en `crm_fiscal_issuances`.
- I2. Solo `sending` puede pasar a `issued`, `failed` o `unknown`.
- I3. `issued` exige folio, XML y PDF no vacíos. Ninguna transición cambia folio, XML ni PDF de `issued`.
- I4. `unknown` nunca pasa a `sending` automáticamente.
- I5. Ninguna llamada a DTECore sin una fila previamente reclamada (`sending`).
- I6. La reimpresión no invoca al proveedor.
- I7. `business_id` del emisor siempre proviene de la venta, no de la petición.
- I8. Con emisión deshabilitada (`fiscal.dte39_emission_control.enabled=false` o flag del negocio apagado),
  ninguna función llama al proveedor.

### 2.4 Cierre del riesgo de doble emisión entre pipelines (requisito de F2)
Antes de activar cualquier emisión, añadir una comprobación **cruzada** dentro de `crm_claim_fiscal_issuance`:
- Rechazar si existe una fila en `fiscal.operations`, `fiscal.pos_dte39_outbox` o `crm_point_fiscal_outbox`
  para la misma venta que no esté en estado terminal de "no emitido" (`pending`/`cancelled`/`skipped`).
- `crm_begin_manual_single_emission` debe usar la misma comprobación cruzada, no solo `crm_fiscal_issuances`.
- Los tres pipelines congelados (sección 2.4 de F1) deben quedar sin productores antes de la activación.

Esta comprobación se escribe como migración en PR, se prueba y no se aplica hasta autorización.

### 2.5 Mercado Pago Point
- El cobro Point finaliza por tres caminos: sondeo, webhook y reconciliación. Los tres pueden llegar a
  registrar la misma venta. Por eso `crm_fiscal_register_pending` debe ser **idempotente** (la unicidad
  `(business, sale, 39)` lo garantiza) y **no** emitir: solo registra.
- La emisión ocurre solo en `fiscal-emit`, con la misma máquina de estados que el TPV en efectivo.
- Verificar que el monto de la venta coincide con el monto procesado por Point antes de registrar (ya lo
  exige `harden_fiscal_point_pending`). Un pago `processed` sin `finalized_at` no registra.
- Cobro con tarjeta: el tipo de medio de pago (`medioPago` PE) está reportado, no verificado. La regla
  "solo efectivo" de `dte39_claim_cash_only` debe evaluarse con el owner antes de habilitar tarjeta.

## 3. Aislamiento entre comercios

- Toda consulta de `fiscal-emit` y `fiscal-reconcile` filtra por `business_id` derivado de la venta.
- Credenciales DTECore: una API key por empresa emisora (reportado). **Cifrada** en reposo y nunca
  devuelta al navegador. Almacenamiento (Vault o columna cifrada) **por decidir** con el owner.
- Pruebas de aislamiento (sección 5, grupo T): un comercio A no puede emitir, reconciliar, leer XML/PDF
  ni reimprimir una venta del comercio B, aunque conozca el `sale_id`.

## 4. Impresión del documento fiscal sin reemitir

Requisito del owner: imprimir el documento fiscal con PDF417, sin volver a emitir.

Opciones, en orden de preferencia:

| Opción | Descripción | Ventaja | Riesgo |
|---|---|---|---|
| A | Rasterizar el PDF guardado en servidor a 80 mm y enviarlo como `GS v 0` por `POST /v1/print` | Usa el conector tal cual; sin cambios en el ejecutable | Requiere renderizador PDF en servidor; la legibilidad del PDF417 hay que probarla en XP-80C |
| B | Pedir a DTECore un ticket en formato ESC/POS o raster | Sin renderizado propio | Contrato desconocido; depende de DTECore |
| C | Nueva ruta en el conector para imprimir PDF vía spooler de Windows | Fidelidad total | Cambio en el ejecutable firmado; mayor superficie |

**Recomendación**: A, con prueba de legibilidad del PDF417 en XP-80C antes de habilitarla. Si la
legibilidad falla, B.

Reglas:
- La reimpresión lee `pdf_base64` de la fila `issued`, rasteriza y envía con una **clave de impresión nueva**
  (`idempotencyKey` distinta por intento de impresión, no por emisión). No llama a DTECore.
- La impresión del PDF nunca cambia el estado fiscal.
- Si no hay `issued` con PDF, la reimpresión falla con mensaje claro. No se imprime un ticket propio.

## 5. Pruebas automatizadas requeridas

Ejecutables con `node --test` (unitarias) y con SQL sobre una base de **rama** (no producción), en CI.

### Grupo S — máquina de estados (SQL)
- S1 `pending → sending` solo vía claim; claim repetido devuelve `false`.
- S2 `sending → issued` exige folio, XML y PDF; falta cualquiera → error.
- S3 `issued` no cambia folio, XML ni PDF (intento de UPDATE → error).
- S4 `unknown → sending` rechazado.
- S5 `unknown → issued` solo por `crm_reconcile_fiscal_issuance` con folio coincidente.
- S6 `failed` no se reclama de nuevo sin nueva autorización.

### Grupo D — doble emisión (SQL)
- D1 Dos claims concurrentes sobre la misma venta: exactamente uno gana (`FOR UPDATE`/unicidad).
- D2 Venta con fila `pending` en P1 y claim en P2: rechazo por comprobación cruzada (sección 2.4).
- D3 Venta con fila no terminal en P3 (`pending`/`claimed`) y claim en P2: rechazo.
- D4 Tres registros Point simultáneos (sondeo, webhook, reconciliación): una sola fila.
- D5 Autorización manual consumida dos veces: segundo intento rechazado.
- D6 Reintento tras `unknown` no llama al proveedor (prueba de Node con cliente simulado).

### Grupo T — aislamiento entre comercios
- T1 `fiscal-emit` con `sale_id` de otro comercio no reclama nada.
- T2 Fila con `(sale_id, business_id)` inconsistente: FK la rechaza.
- T3 `fiscal-download`/PDF de otro comercio: 404, no datos.
- T4 Reimpresión de venta ajena: rechazada.
- T5 `anon` y `authenticated` no pueden leer ni escribir el ledger (catálogo y prueba directa).

### Grupo R — reintentos e idempotencia
- R1 Timeout de DTECore → `unknown`, sin segunda llamada.
- R2 Respuesta sin PDF → no `issued`; queda `unknown` o `failed` según contrato.
- R3 Error explícito del proveedor → `failed` con código, reintento manual.
- R4 Reimpresión N veces → cero llamadas al proveedor (contador de mock).
- R5 Emisión con flag apagado → cero llamadas.

### Grupo P — impresión
- P1 PDF válido → rasterizado 80 mm → `GS v 0` aceptado por el validador.
- P2 PDF inválido o vacío → error claro, sin imprimir ticket propio.
- P3 Payload > 256 KB → rechazado con mensaje.
- P4 Reimpresión usa `idempotencyKey` nuevo y no cambia el estado fiscal.
- P5 (manual, XP-80C) PDF417 legible por lector: **no automatizable**, requiere prueba física.

### Grupo M — Mercado Pago Point
- M1 Pago `processed` sin `finalized_at` no registra.
- M2 Monto Point distinto del total de la venta: no registra.
- M3 Pago cancelado o reembolsado: no registra ni reclama.
- M4 Venta con pago mixto (efectivo + tarjeta): no reclama hasta decisión del owner.

## 6. Plan de implementación F2 (por fases con compuertas)

| Fase | Entregable | Compuerta de salida |
|---|---|---|
| F2.0 | Obtener documentación DTECore o respuestas escritas a las preguntas de la sección 1 | Respuestas en el repo (`docs/`) |
| F2.1 | Fuente del emisor de la 51106 o decisión de rehacerlo | Revisión del owner |
| F2.2 | Migración de comprobación cruzada y de autorización manual sobre el ledger (en PR) | Pruebas D1–D5 y S1–S6 verdes en rama de base |
| F2.3 | Edge function `fiscal-emit` con cliente DTECore mockeado | Pruebas R1–R5, T1–T2 verdes |
| F2.4 | Renderizado PDF → raster 80 mm y envío al conector | Pruebas P1–P4 verdes |
| F2.5 | Prueba física de PDF417 en XP-80C | Lectura exitosa del timbre (manual) |
| F2.6 | Prueba contra certificación DTECore con folios de prueba | Owner autoriza cada emisión |
| F2.7 | Activación por negocio (`fiscal_enabled`), solo un comercio piloto | Owner autoriza |

Ninguna fase ejecuta migraciones en producción, activa emisiones, consume folios ni despliega sin
autorización explícita.

## 7. Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | Emisor de la 51106 fuera del repo; no se puede auditar | Alta | F2.1 |
| R2 | Idempotencia de DTECore no verificada; un reintento podría duplicar | Alta | No reintentar; `unknown` manual; F2.0 |
| R3 | Doble emisión entre tres pipelines | Alta | Comprobación cruzada (2.4) |
| R4 | Ledger sin RLS de aplicación; aislamiento depende del código del emisor | Media | Derivar `business_id` de la venta; pruebas T1–T5 |
| R5 | PDF417 ilegible en XP-80C tras rasterizar | Media | F2.5 antes de activar |
| R6 | 51106 marcada como prueba; estado ante el SII no aclarado | Media | Confirmar con owner (0.2) |
| R7 | Estado 51104 en REC (-11) sin resolver | Media | Consulta a DTECore (F2.0) |
| R8 | Tres triggers de encolado deshabilitados pueden reactivarse por error | Baja | Prueba de catálogo en CI: triggers `D` |

## 8. Decisiones que necesito del owner

1. Entregar el fuente del emisor de la 51106, o autorizar rehacerlo desde cero.
2. Confirmar si la 51106 fue reportada al SII como certificación o producción, y su estado actual.
3. Obtener de DTECore respuestas por escrito a: idempotencia con `idBoletaOperacion` repetido; estructura
   de la respuesta con PDF; consulta de estado; multiempresa (una cuenta o una API key por empresa).
4. Elegir la opción de impresión (A, B o C de la sección 4).
5. Decidir el almacenamiento cifrado de la API key por negocio.
6. Decidir si se habilita tarjeta (Point) antes que solo efectivo.
