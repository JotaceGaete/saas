# F1 — Arquitectura de emisión única (boleta electrónica, TPV Chile)

Estado: propuesta. No se ha desplegado ni ejecutado nada. Emisión automática: **deshabilitada**.
Base: migraciones recuperadas en `migrations/` (34/34 verificadas por md5) y lectura de solo lectura
de la base de producción y de las ramas del repo.

## 1. Hallazgos que condicionan el diseño

### 1.1 El emisor que produjo la boleta 51106 no está versionado
- `public.crm_fiscal_issuances` contiene la 51106 (`issued`, XML 8.108 caracteres, PDF 8.740), con
  `operation_id = WLK-<business>-<sale>`.
- Ninguna rama del repo (locales ni remotas) referencia las RPC `crm_claim_fiscal_issuance`,
  `crm_finalize_fiscal_issuance`, `crm_reconcile_fiscal_issuance`, `crm_begin_manual_single_emission`
  ni el endpoint `dte/boletas/emitir`. Las únicas referencias están en las migraciones recuperadas.
- Las edge functions desplegadas no incluyen ninguna función fiscal. Sus rutas de origen apuntan a
  directorios (`/saas-walinka-standby`, `/saas-mp-oauth-deploy`, `/saas-walinka`) que no están en
  este repo.
- **Consecuencia**: no podemos auditar el código que emitió la primera boleta real. Hace falta el
  fuente de ese emisor antes de reutilizarlo o reemplazarlo.

### 1.2 Cuatro pipelines con llaves de idempotencia distintas
Cada tabla tiene su propia unicidad. Ninguna restricción impide que **la misma venta** tenga filas
en varias tablas, así que hoy una venta puede emitirse por dos caminos.

| # | Pipeline | Tabla / función | Clave de operación | Unicidad | Estados | Guarda XML/PDF |
|---|---|---|---|---|---|---|
| P1 | Piloto SII (`sii_pilot_*`) | `fiscal.operations` | `business:sale:39` | (business, sale, 39) | pending, submitting, submitted, accepted, rejected, unknown, cancelled | No |
| P2 | Emisión CRM (`crm_*_fiscal_issuance`) | `public.crm_fiscal_issuances` | `WLK-<business>-<sale>` | (business, sale, 39) y (business, op, 39) | pending, sending, unknown, issued, failed, cancelled | Sí (base64) |
| P3 | Outbox POS DTE39 | `fiscal.pos_dte39_outbox` | `WALINKA-DTE39-<invoice>` | (business, invoice, 39) y op | pending, claimed, unknown, issued, failed, skipped | No (solo `provider_response` jsonb) |
| P4 | Outbox Point (MP) | `public.crm_point_fiscal_outbox` | `point_operation_id` | point_operation_id | pending, processing, prepared, blocked | No |

Riesgos concretos:
- **Doble emisión entre pipelines.** `crm_begin_manual_single_emission` solo bloquea si hay
  operaciones `sending`/`unknown` en P2; no mira P1 ni P3.
- **Tres formatos de operación para la misma venta** (`business:sale:39`, `WLK-…`,
  `WALINKA-DTE39-…`). Si el proveedor usa `idBoletaOperacion` como llave de idempotencia, cada
  formato es una llave distinta y no evita un segundo envío.
- **P3 no guarda documento.** Si emite, el folio, XML y PDF quedan en `provider_response` jsonb o
  se pierden; no hay almacenamiento atómico del documento.
- **Estado actual protegido por configuración, no por diseño.** `fiscal.dte39_emission_control`
  tiene `enabled=false` y `payment_voucher_policy_approved=false`; el claim de P3 devuelve `null`.
  Los triggers de encolado de P3 y P4 están deshabilitados (migración `disable_fiscal_enqueue_triggers`).
  Ambas barreras son correctas, pero no son la arquitectura.

### 1.3 Estado de producción (solo lectura, 2026-10-31)
- Boleta 51106: `issued` en P2. Su venta no tiene filas en P1, P3 ni P4.
- P3: 17 filas `pending` de prueba (pendiente de limpieza autorizada).
- P1: 2 filas `pending` (ventas de 2026-10-29), intactas.
- P4: 0 filas. Evidencias de reconciliación: 0. Autorizaciones manuales: 1 (consumida por la 51106).

## 2. Arquitectura propuesta: un solo ledger y un solo emisor

### 2.1 Principios
1. **Un registro por venta y tipo de documento**, en una sola tabla: `public.crm_fiscal_issuances`
   (ya guarda folio, XML y PDF, y tiene `unique (business_id, sale_id, dte_type)`).
2. **Una sola clave de operación, determinista**: `WLK-<business_id>-<sale_id>-39`. Es la misma que
   usa la 51106. Se envía al proveedor como `idBoletaOperacion`, y se usa internamente.
3. **Un solo emisor** (edge function server-side) que es el único que llama al proveedor.
4. **Documento persistido de forma atómica** con el resultado: folio, XML y PDF en la misma
   transacción que pasa a `issued`. Nunca `issued` sin los tres.
5. **`unknown` nunca se reintenta automáticamente**. Solo reconciliación manual con evidencia.
6. **Imprimir y reimprimir desde el documento guardado**. Ningún reimpreso llama al proveedor.
7. **Venta independiente de la emisión**. La venta se cobra y se imprime un ticket de venta; la
   boleta se marca pendiente si falla. Un fallo del SII no bloquea la caja.

### 2.2 Máquina de estados (única)
```
           claim (FOR UPDATE)            respuesta válida con folio/XML/PDF
 (nueva) ──────────────────► sending ─────────────────────────────────► issued (terminal)
                               │
                               ├── error de red / timeout / respuesta ambigua ─► unknown
                               │                                              │
                               │                 reconciliación manual ◄──────┘
                               │                 (evidencia append-only)
                               │                          │
                               │                          ├─ encontrada ─► issued (con folio/XML/PDF)
                               │                          └─ no encontrada ─► failed (puede reemitirse
                               │                                             con nueva autorización)
                               └── rechazo explícito del proveedor ───────────► failed
 pending ──► sending (solo vía claim)        cancelled: solo tras nota de crédito
```
- `pending` se crea al cerrar una venta pagada (sin llamar al proveedor).
- Transiciones permitidas: `pending→sending`, `sending→issued|unknown|failed`,
  `unknown→issued|failed` (solo reconciliación), `issued→cancelled` (solo con NC).
- Ninguna transición de `issued` cambia folio, XML ni PDF (el trigger de P3 ya lo impone; hay que
  replicarlo en el ledger).

### 2.3 Flujo de emisión
1. Al cerrar la venta: `crm_fiscal_register_pending(business, sale, operation_id)`. Solo crea la fila
   `pending`. Sin llamada externa.
2. El emisor reclama la fila con `crm_claim_fiscal_issuance` (pasa a `sending`, atómico).
3. Llama a DTECore con `idBoletaOperacion = operation_id`, `retornarPdf=true`, `formatoPdf="80mm"`,
   `modoPdfSalida="base64"`.
4. Si la respuesta trae folio, XML y PDF: `crm_finalize_fiscal_issuance(…,'issued',…)` en la misma
   transacción. Si falla la red o la respuesta es ambigua: `…,'unknown'`.
5. Impresión: el ticket fiscal es el PDF guardado (con PDF417). No se genera un ticket propio.

### 2.4 Qué se retira o se congela
| Pipeline | Acción propuesta |
|---|---|
| P1 `fiscal.operations` y `sii_pilot_*` | Congelar. Las 2 filas pendientes se resuelven antes del corte. Sin nuevos productores. |
| P2 `crm_fiscal_issuances` | **Ledger único**. Se mantiene. |
| P3 `pos_dte39_outbox` | Congelar productor (trigger ya deshabilitado). La limpieza de 17 filas es el paso previo. |
| P4 `crm_point_fiscal_outbox` | Congelar productor. La venta Point debe encolar en P2 cuando se active. |

Congelar significa que no hay productores nuevos y que las filas existentes se conservan como
evidencia. No se borran.

### 2.5 Controles que faltan (para F2, no para F1)
- Bloqueo cruzado: antes de `claim`, comprobar que no existe otra fila fiscal para la venta en ningún
  pipeline congelado. Con los pipelines congelados esto se vuelve una comprobación de integridad.
- `crm_begin_manual_single_emission` debe consultar el ledger único, no solo P2.
- Clave de idempotencia verificada contra DTECore (ver pendientes).

## 3. Pendientes que no se pueden inventar

Del contrato de DTECore, solo está documentado lo que figura en el informe de integración. Queda por
confirmar (no asumir):

1. Respuesta exacta cuando `retornarPdf=true` (¿`pdfBase64`? ¿anidado?).
2. Comportamiento ante un `idBoletaOperacion` repetido: ¿devuelve el mismo folio, error o emite otra?
   Es **la** pregunta que decide si la idempotencia es real.
3. Endpoint o webhook de estado ante el SII (aceptada/rechazada). Hoy la boleta 51104 quedó en REC
   (-11) y no se resolvió.
4. Multiempresa con una sola cuenta frente a una API key por empresa.
5. Comportamiento con folios agotados y certificado vencido.
6. Origen del código que emitió la 51106 (ver 1.1).

## 4. Plan de migración (propuesta, sin ejecutar)

| Paso | Qué | Ejecuta | Condición |
|---|---|---|---|
| 0 | Limpieza de 17 filas P3 a `skipped` | Owner autoriza | Verificaciones del script |
| 1 | Obtener el fuente del emisor de la 51106 | Owner | Antes de escribir código de emisión |
| 2 | Confirmar contrato DTECore (pendientes 1–2) | Owner con DTECore | Antes de activar cualquier emisión |
| 3 | Migración de bloqueo cruzado y manual sobre el ledger | Revisión en PR | Aprobación explícita |
| 4 | Edge function emisor único | Revisión en PR | Pruebas en staging, sin producción |
| 5 | Pruebas de integración con DTECore en certificación | Owner | Folios de prueba |
| 6 | Activación por negocio con flag `fiscal_enabled` | Owner | Solo Chile, una empresa piloto |

## 5. Criterios de aceptación de F1
- [ ] Un único pipeline productor de emisión (P2).
- [ ] Una venta no puede tener dos filas fiscales activas en ningún pipeline.
- [ ] `unknown` no se reintenta automáticamente (probado).
- [ ] Reimpresión no llama al proveedor (probado).
- [ ] Emisión deshabilitada por defecto; ninguna emisión durante las pruebas sin autorización.
- [ ] Las 51106 y ventas originales intactas tras cualquier cambio.

## 6. Decisiones que necesito del owner
1. Autorizar la limpieza de las 17 filas P3 (script ya revisado).
2. Entregar el fuente del emisor que produjo la 51106 (o confirmar que se rehace desde cero).
3. Confirmar el entorno de la 51106 (certificación o producción).
4. Consultar a DTECore las preguntas 1–2 de la sección 3 antes del 4 de noviembre.
