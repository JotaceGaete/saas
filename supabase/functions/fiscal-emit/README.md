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
npm test                                  # 86 pruebas unitarias
npm run test:deno                         # 6 pruebas del cableado en Deno (requiere deno)
FISCAL_TEST_PG_DB=walinka_test npm run test:db   # 65 pruebas contra Postgres local (concurrencia entre pipelines, triggers, evidencia, paridad SQL/JS)
```

Las pruebas de base necesitan una base local `*_test` con la migración propuesta aplicada y con
privilegios de `service_role` (en Supabase vienen por defecto; en la base de prueba se conceden a mano).

## Verificado y no verificado

Verificado (ejecutado en este entorno):
- Lógica del emisor, reglas de pago, máquina de estados, cifrado y HTTP: `npm test` (86).
- Migración propuesta en Postgres 16 real (`walinka_test`): RPC, guardas SQL, triggers, evidencia de
  reconciliación y permisos: `npm run test:db` (65). Incluye transacciones intercaladas entre
  P1/P2/P3/P4 con bloqueo comprobado en `pg_stat_activity`.
- Cableado de Edge Function en Deno 2.9.6 (`app.ts`, `index.ts`): tipos correctos y `npm run test:deno` (6).
  Cliente de base falso con la forma de supabase-js.

NO verificado:
- `lib/store-supabase.mjs` contra PostgREST real: el binario de PostgREST solo está en GitHub, y GitHub
  no está habilitado en esta sesión. Los paquetes de npm/PyPI llamados postgrest son clientes, no el servidor.
- `index.ts` desplegado en Supabase (`supabase functions serve`): no hay CLI ni Docker en el entorno.
- Datos de producción: solo lectura. No se aplicó nada.

## Qué no hace todavía

- Proveedor real DTECore: bloqueado hasta verificar el contrato por escrito.
- Impresión: `lib/print-plan.mjs` prepara el plan desde el PDF guardado; no envía nada. Rasterizar el
  PDF a GS v 0 y la prueba de PDF417 en XP-80C están pendientes. Print Connector no se modificó.
- Migración endurecida solo aplicada en `walinka_test`; no aplicada en producción.
- Reconciliación con evidencia implementada (`crm_fiscal_reconcile_with_evidence`). No consulta a DTECore: la verificación la hace una persona en el portal.
