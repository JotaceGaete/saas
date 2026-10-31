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
npm test                                  # 59 pruebas unitarias
FISCAL_TEST_PG_DB=walinka_test npm run test:db   # 26 pruebas contra Postgres local
```

Las pruebas de base necesitan una base local `*_test` con la migración propuesta aplicada y con
privilegios de `service_role` (en Supabase vienen por defecto; en la base de prueba se conceden a mano).

## Qué no hace todavía

- `index.ts` (envoltorio Deno) **no está escrito**: falta el almacén sobre `supabase-js` (RPC + SELECT) y Deno
  no está instalado aquí para verificarlo.
- Conflictos entre pipelines y elegibilidad Point se comprueban también en la base; la comprobación de
  pago Point confirmado en el reclamo SQL sigue siendo solo de aplicación (decisión pendiente).
- Registro de evidencia de reconciliación (`fiscal.dte39_reconciliation_evidence`) no se escribe aún.
