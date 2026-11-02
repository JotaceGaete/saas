# Boleta electrónica DTE 39 desde el TPV (DTE Core)

Estado al 2026-11-02: implementado y probado en aislamiento. **Nada aplicado en producción, nada
desplegado, ninguna boleta emitida.** La emisión sigue apagada en todas las capas.

## Flujo

1. El cajero confirma la venta en el TPV (efectivo o Point confirmado por Mercado Pago).
2. El ticket muestra el panel «Boleta electrónica · SII» (`TpvFiscalEmitPanel`), solo con
   `VITE_FISCAL_EMIT_ENABLED=true`. El panel pide `status` a la función `fiscal-emit` (solo lectura).
3. El botón «Emitir boleta electrónica» se habilita solo si el servidor responde `canEmit: true`:
   rol fiscal que permite emitir, venta pagada **del mismo día** (hora de Santiago), emisor
   habilitado y verificado, control global encendido, IVA de cada línea verificado, sin descuentos,
   pago único coherente con el total, sin fila previa en el ledger ni en pipelines antiguos.
4. Confirmación explícita (casilla) con el total y la advertencia de folio real.
5. `fiscal-emit` (Edge Function, service_role) reclama la venta, descifra la clave del comercio
   dentro del reclamo y llama a DTE Core una sola vez.
6. El resultado queda en `crm_fiscal_issuances`:
   - `issued`: folio + XML firmado + PDF, validados (DTE 39, folio, emisor, total, TED, PDF).
   - `unknown`: cualquier duda (timeout, 5xx, 401, 409, XML que no cuadra). Guarda el folio si el
     proveedor lo informó y el motivo. **Nunca se reintenta**; se concilia.
   - `failed`: solo con rechazo explícito de validación (400 `success:false`), sin folio.
7. El estado SII (`sii_status`) va aparte: `unverified` al emitir; luego `received`, `accepted`,
   `accepted_with_objections` o `rejected`, registrado con `crm_fiscal_record_sii_status`.
8. Descarga de PDF/XML: `api/fiscal/download` (rol fiscal activo). Impresión térmica: PR #112,
   independiente.

## Contrato DTE Core verificado

| Punto | Evidencia | Decisión |
|---|---|---|
| Precio por línea | XML aceptados: 51106 PrcItem 100 → MntNeto 84, IVA 16, MntTotal 100; 51105 PrcItem 1190 → 1000 + 190 | **Bruto (IVA incluido)**. PR #108 enviaba neto: corregido. |
| Campos del cuerpo | Solicitud que produjo la 51106 (`feat/boleta-real-unica-20261031`) | Se replican exactamente; sin `folio`, `fechaEmision`, `total` ni sucursal. |
| Sucursal | XML 51106 sin sucursal, aceptado | Opcional. PR #108 la exigía: corregido. |
| Receptor | XML: 66666666-6 CLIENTE VARIOS | Igual. |
| Respuesta 2xx | Código que emitió la 51106: `folio`, `esSimulacion`, `documentos.{xml,pdf}`, base64 inline opcional | `esSimulacion` debe ser `false`; si faltan documentos inline se leen por GET. |
| Duplicados | Referencia del proveedor: 409 con `folioExistente` si la validación de operación está activa | 409 → `unknown` con folio. **Confirmar que la opción esté activa en la cuenta.** |

Pruebas que fijan el contrato: `test/contract/accepted-boletas.contract.test.mjs`. Con
`FISCAL_ACCEPTED_XML_DIR` apuntando a los XML originales, también compara contra ellos.

## Idempotencia

- Clave de operación determinista `WLK-<negocio>-<venta>` (también `idBoletaOperacion` en DTE Core).
- `unique (business_id, sale_id, dte_type)` y `unique (business_id, operation_id, dte_type)` en el ledger.
- Reclamo atómico `pending → sending` con credenciales bajo candado. Segunda emisión de una venta
  emitida no llama al proveedor.
- `unknown`/`sending` bloquean el botón y la API. La recuperación nunca llama al proveedor.
- El panel envía una sola vez por montaje y trata cualquier respuesta perdida como incierta.

## Protecciones de datos históricos

- Sin emisión retroactiva: regla en la aplicación (`SALE_NOT_SAME_DAY`) y trigger en la base
  (`FISCAL_SALE_NOT_SAME_DAY`) al crear la fila del ledger.
- `fiscal.retroactive_emission_blocks` con las cuatro ventas Point anteriores (migración A).
- Guardas entre pipelines: una venta con fila en `fiscal.operations` (incluidas las 2 pending del
  29-10), `pos_dte39_outbox` o `crm_point_fiscal_outbox` no se puede emitir.
- Documento emitido inmutable (trigger de la migración E): folio, XML y PDF no cambian; solo pasa a
  `cancelled` con nota de crédito.
- Con la emisión nueva activada, el panel piloto antiguo del ticket se oculta: su botón «Preparar
  operación fiscal» escribía en `fiscal.operations`.

## Migraciones (todas propuestas, ninguna aplicada)

Orden: P0 → A → B → C → D → **E** (`proposed/20261102_fiscal_sii_status.sql`, nueva). Ver F4 para
respaldo y reversión. Reversión de E: `drop trigger` de `crm_fiscal_issuances_guard_issued` y
`crm_fiscal_issuances_same_day`, restaurar las funciones `crm_finalize_fiscal_issuance` (firma de 7
argumentos) y `crm_fiscal_get_issuance` desde C/A, `drop function crm_fiscal_record_sii_status`,
`drop table fiscal.crm_fiscal_sii_status_events` y las columnas `sii_*`, `issued_at`.

## Base local reproducible

`supabase/fiscal-recovery/localdb/build.sh` reconstruye `walinka_test` desde el repo (stub de
Supabase, 189 migraciones del repo, las recuperadas y P0–E). Se niega a usar hosts no locales.

## Pruebas (ninguna emite ni sale a la red)

```bash
cd supabase/functions/fiscal-emit
npm test                                        # unidad + contrato DTE (195)
FISCAL_TEST_PG_DB=walinka_test npm run test:db  # Postgres local (124)
npm run test:deno                               # cableado Edge Function (11)
cd ../../.. && node --test api/fiscal/*.test.js api/_lib/*.test.js   # endpoints de lectura (56)
npx vitest run src/pages/crm/components/TpvFiscalEmitPanel.test.jsx src/services/fiscalEmitService.test.js  # 14
```
