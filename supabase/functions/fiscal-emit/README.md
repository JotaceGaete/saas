# fiscal-emit (F2.2 / F2.3) — emisor fiscal server-side, DTE 39

Estado: **implementación en rama de desarrollo. No desplegada. Emisión automática deshabilitada.**
El proveedor real (DTECore) está **bloqueado** hasta verificar su contrato por escrito: el adaptador
real lanza `ContractNotVerifiedError` y no hace red. Las pruebas usan un proveedor simulado.

## Piezas

| Archivo | Qué hace |
|---|---|
| `lib/emit.mjs` | Orquestador: deriva el comercio de la venta, idempotencia, reclamo atómico, unknown, reimpresión, reconciliación. |
| `lib/eligibility.mjs` | Reglas previas al reclamo: pagada, CL, emisor verificado, emisión global, líneas verificadas, medio de pago (efectivo o Point confirmado). |
| `lib/payload.mjs` | Cuerpo DTECore. Sin folio ni fecha. Descripción ≤ 80, precios enteros, suma = total. |
| `lib/state.mjs` | Máquina de estados única (F1 §2.2). |
| `lib/secrets.mjs` | AES-256-GCM para credenciales por comercio, AAD ligado a `business_id`. |
| `lib/store-pg.mjs` | Almacén Postgres. **Solo** conecta a bases locales cuyo nombre termina en `_test`. |
| `lib/providers/simulated.mjs` | Proveedor simulado (ok, rejected, timeout, network, no_pdf, no_folio). Sin red. |
| `lib/providers/dtecore-blocked.mjs` | Adaptador real bloqueado hasta verificar el contrato. |
| `test/unit/` | Pruebas puras y orquestador con almacén en memoria (`npm test`). |
| `test/db/` | Pruebas contra Postgres real `walinka_test` (`npm run test:db`). |

Migración asociada (no aplicada en producción): `supabase/fiscal-recovery/proposed/20261031_fiscal_single_ledger_guard.sql`.

## Ejecutar

```bash
cd supabase/functions/fiscal-emit
npm install
npm test                                  # 80 pruebas unitarias
FISCAL_TEST_PG_DB=walinka_test npm run test:db   # 48 pruebas contra Postgres local (incluye concurrencia entre pipelines)
```

Las pruebas de base necesitan una base local `*_test` con la migración propuesta aplicada y con
privilegios de `service_role` (en Supabase vienen por defecto; en la base de prueba se conceden a mano).

## Verificado y no verificado

- Verificado con node y Postgres 16 real: toda la lógica, las RPC, las guardas SQL, la concurrencia
  entre P1/P2/P3/P4 (transacciones intercaladas con bloqueo comprobado) y la paridad SQL/JS del pago.
- **No verificado en runtime**: `index.ts` (Deno no está instalado; solo pasó chequeo de sintaxis) y
  `lib/store-supabase.mjs` (probado con cliente falso; no contra PostgREST, porque no hay daemon Docker).
- Antes de desplegar: `supabase functions serve fiscal-emit` contra una base local, y prueba de
  `store-supabase` contra PostgREST real.

## Qué no hace todavía

- Proveedor real DTECore: bloqueado hasta verificar el contrato por escrito.
- Impresión: `lib/print-plan.mjs` prepara el plan desde el PDF guardado; no envía nada. Rasterizar el
  PDF a GS v 0 y la prueba de PDF417 en XP-80C están pendientes. Print Connector no se modificó.
- Registro de evidencia de reconciliación (`fiscal.dte39_reconciliation_evidence`) no se escribe aún.
- Migración endurecida solo aplicada en `walinka_test`; no aplicada en producción.
