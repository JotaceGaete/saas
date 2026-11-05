# fiscal-emit (F2.2 / F2.3) — emisor fiscal server-side, DTE 39

Estado: **implementación en rama de desarrollo (PR #108, borrador). No desplegada. Emisión automática deshabilitada.**

**Actualización 2026-11-02** (ver `docs/fiscal/DTE39_TPV_INTEGRACION.md`): contrato de DTE Core fijado
contra los XML aceptados 51105/51106 (precio **bruto**, sucursal opcional); adaptador real
`lib/providers/siisolutions-http.mjs` con validación del XML devuelto, 409 y recuperación por GET;
acción `status` para el TPV; migración E (estado SII separado, documento inmutable, sin emisión
retroactiva); base local reproducible (`supabase/fiscal-recovery/localdb/build.sh`). El adaptador
real solo se activa con `FISCAL_PROVIDER=dtecore`; sin esa variable se usa el bloqueado. Las secciones
siguientes describen la ronda anterior y pueden citar supuestos ya corregidos (precio neto, sucursal obligatoria).

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

Migración asociada: `supabase/fiscal-recovery/proposed/20261031_fiscal_single_ledger_guard.sql` (A; aplicada en producción el 4-11-2026 como `20261104164731 fiscal_a_single_ledger_guard`, ver `supabase/fiscal-recovery/PRODUCTION-MIGRATION-LEDGER-2026-11-04.md`).

## CORS y autenticación de la plataforma

- `verify_jwt = true` (`supabase/config.toml`). La plataforma rechaza con 401 cualquier POST sin JWT
  de usuario válido (HS256 o claves de firma asimétricas) antes de ejecutar el código. Las claves
  publicables/secretas nuevas no son JWT y no pasan esta comprobación: la función no las acepta.
- El preflight `OPTIONS` llega a la función (precedente en producción: `mp-point-terminal-preference`,
  `verify_jwt=true`, OPTIONS 200 y POST 200 desde el navegador).
- `lib/cors.mjs`: lista cerrada de orígenes exactos (producción `go.walinka.com`, `go.ventalink.app`;
  alias de rama de las Preview de #119 y #123). Sin comodines; las URL por despliegue de Vercel no se
  admiten. Origen fuera de la lista → 403 `ORIGIN_NOT_ALLOWED`, sin cabeceras CORS, antes de
  autenticar y sin tocar la base. Sin `Origin` (no navegador) → sin cabeceras CORS y autenticación
  igual de obligatoria. Todas las respuestas de la función, errores incluidos, llevan `Vary: Origin`
  y, si el origen está autorizado, las cabeceras `Access-Control-*`. No se usan cookies
  (`Access-Control-Allow-Credentials` ausente).
- Añadir un origen = cambio de código revisado + nuevo despliegue.
- Pruebas: `test/deno/cors.test.ts`.

## Modelo de permisos

- **Tenant**: el `business_id` sale siempre de la venta. Un usuario sin rol fiscal activo en ese negocio
  recibe `SALE_NOT_FOUND`, igual que si la venta no existiera.
- **Rol**: el permiso sale de `fiscal.business_fiscal_roles` (fila activa, negocio activo), no de
  `wa_businesses.user_id`. Un rol insuficiente recibe `FISCAL_ROLE_REQUIRED` (403).
- **Dueño**: un trigger en `wa_businesses` siembra la fila `fiscal_owner` al crear el negocio.
- **Reconciliación**: sus permisos tributarios específicos **no están definidos**. Por eso queda fuera de la API.
- **Empresas autorizadas** (alcance actual: las empresas propias de Walinka): variable de servidor
  `FISCAL_ALLOWED_ISSUERS="<uuid del negocio>=<RUT>,..."` (`lib/allowlist.mjs`), en los secretos de la
  Edge Function **y** en Vercel (`api/fiscal/connection`, `api/fiscal/applications`). Nunca `VITE_*`.
  Se compara el id del negocio de la venta con el RUT del emisor guardado en `fiscal.issuers`; un
  negocio fuera de la lista, o con otro RUT, recibe `FISCAL_BUSINESS_NOT_ALLOWED` (403) antes del
  reclamo: no se crea fila ni se llama al proveedor. Vacía o inválida = nadie autorizado.
- **Consultas** (no emiten): `lookup` (fiscal_owner, fiscal_reconciler) pregunta a DTE Core por el
  `idBoletaOperacion` de una venta `unknown` y valida XML/PDF del folio informado; no cambia la venta.
  `sii-status` (fiscal_owner, fiscal_operator, fiscal_reconciler) consulta el envío al SII de un folio
  emitido y solo registra `sii_status` con palabras inequívocas; lo demás queda «sin verificar».
- **Modo real en Preview**: `status` devuelve `liveAuthorized`; el TPV en Preview usa el modo real
  solo si es `true`. Cada emisión vuelve a pasar todas las reglas del servidor.

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

## Migración H — identidad fiscal por comercio (aplicada en producción el 2026-11-05 como `20261105200532 fiscal_h_identity_integrity`)

`supabase/fiscal-recovery/proposed/20261105_fiscal_identity_integrity.sql` (después de G). Prechequeo,
recuperación y verificación en `supabase/fiscal-recovery/backups/2026-11-05-H/`.

- **C1 RUT del comercio.** DTE Core (servicio individual): una API key = un RUT y no hay endpoint para
  consultarlo. El comercio ingresa RUT y key; antes de la primera boleta el propietario confirma el RUT
  mostrado (`crm_fiscal_confirm_issuer_rut`, atado a la huella de la credencial: cambiar key o RUT
  exige confirmar de nuevo). Sin confirmación no pasa nada a `sending`. Si el XML devuelto trae otro
  `<RUTEmisor>`, la venta queda `unknown` (conciliación) sin reemitir. Ver `docs/CONTRATO-DTECORE.md`.
- **A1 RUT único.** RUT canónico con dígito verificador; un RUT por comercio salvo grupo de RUT
  compartido creado por un administrador para comercios del mismo dueño. API: `RUT_NOT_AVAILABLE`.
  La lista `FISCAL_ALLOWED_ISSUERS` sigue rechazando RUT repetidos: un grupo compartido no puede estar en
  la lista mientras exista.
- **A2 folios.** `crm_fiscal_issuances.issuer_rut` permanente y `fiscal.document_folios` con clave
  (RUT, tipo, folio). Un folio repetido del mismo emisor o un XML de otro emisor no queda `issued`: la
  recuperación lo pasa a `unknown` (`FOLIO_DUPLICATE` / `DOCUMENT_ISSUER_MISMATCH`) sin detener a los
  demás comercios.
- **A4 venta fiscalizada inmutable** (sending/unknown/issued/cancelled): totales, descuento, estado,
  líneas y pagos bloqueados en la base (`FISCAL_SALE_TRIBUTARY_LOCKED`). Corrección: administrador,
  una venta, una transacción, auditada.
- **A3 nota de crédito**: borradores en `fiscal.credit_notes` con clave foránea al documento original;
  emisión bloqueada (`docs/NOTA-CREDITO-DTE61.md`).

Pruebas: `test/db/lab-multiempresa.db.test.mjs` (A/B, garantías 1–10 y A3),
`supabase/fiscal-recovery/tests/adversarial-ab.sql` (27 pruebas de la auditoría) y
`backups/2026-11-05-H/test-recuperacion-H.sh`.

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

## Pendientes y riesgos conocidos (paso 2: lista de empresas, consultas, modo real en Preview)

- **Pruebas de Deno sin ejecutar.** `app.ts` e `index.ts` cambiaron (reciben `allowedIssuers`, leen
  `FISCAL_ALLOWED_ISSUERS`), pero `test/deno/` no se ejecutó: el entorno donde se hizo el cambio no
  tiene `deno`. La lógica que usan está cubierta por las pruebas de Node (`npm test`, `npm run test:db`).
  Antes de desplegar: `npm run test:deno` y `deno check index.ts`.
- **Preview y producción comparten el emisor.** Hay un solo proyecto Supabase y una sola Edge Function
  `fiscal-emit` para los dos sitios. La autorización (`liveAuthorized`, lista de empresas, control de
  emisión, emisor aprobado) es por negocio, no por sitio: una empresa autorizada con la emisión
  encendida emite desde Preview **y** desde producción si allí `VITE_FISCAL_AUTO_EMIT=live`. Mantener
  producción en `off` mientras dure la prueba, y apagar `fiscal.dte39_emission_control` al terminar cada
  emisión controlada.
- **Formatos no documentados.** `/dte/operaciones/39/{id}` y `/dte/emitidos/39/{folio}/envio-sii` no
  tienen ejemplo de respuesta. Los lectores son conservadores (ante la duda: indeterminado / sin
  verificar); revisar la primera respuesta real y ajustarlos. Un 404 de operaciones no prueba que no se
  emitió: la venta sigue bloqueada.
- **La lista vive en dos lugares** (secretos de Supabase y variables de Vercel) y deben coincidir. Si
  falta o es inválida, nadie emite (falla cerrado).

## Qué no hace todavía

- Proveedor real DTECore: bloqueado hasta verificar el contrato por escrito.
- Impresión: `lib/print-plan.mjs` prepara el plan desde el PDF guardado; no envía nada. Rasterizar el
  PDF a GS v 0 y la prueba de PDF417 en XP-80C están pendientes. Print Connector no se modificó.
- Migraciones A–H aplicadas en producción (A–G el 4-11-2026, H el 5-11-2026). Estado y correspondencia con los archivos: `supabase/fiscal-recovery/PRODUCTION-MIGRATION-LEDGER-2026-11-04.md`.
- Endpoints de PDF y descarga en `main` (`api/fiscal/document.js`, `download.js`, `pdf.js`): siguen
  usando el guard solo de dueño (`api/_lib/siisolutions-owner-guard.js`). No se cambiaron en esta rama.

## Revisión de seguridad (PR #108, ronda 3)

Cambios y estado. Ninguna migración aplicada en producción; no hay despliegue, no hay llamadas a DTECore, no se consumen folios.

- **Cambio de dueño**: trigger `wa_businesses_owner_change` revoca todos los roles activos del dueño anterior en ese negocio, audita en `fiscal.admin_audit` (`owner_changed`) y siembra `fiscal_owner` al nuevo. Sin herencia de acceso. Probado en DB (`test/db/security.db.test.mjs`) y en memoria.
- **Endpoints de lectura** (`api/fiscal/document`, `download`, `pdf`): autorización por rol activo con la RPC `crm_fiscal_actor_role` (`api/_lib/siisolutions-fiscal-role-guard.js`). Roles de lectura: owner, operator, viewer. El historial no cambia: la guarda decide quién entra, no qué documento se devuelve. Pruebas en `api/fiscal/*.test.js` y `api/_lib/siisolutions-fiscal-role-guard.test.js`.
- **Reconciliación administrativa** (`createAdminReconciler` -> `public.crm_fiscal_reconcile_admin`): una sola transacción. Rol `fiscal_reconciler` verificado dentro de la RPC (un cajero o un dueño sin ese rol no concilia); revisor = actor; evidencia, cambio de estado y auditoría `applied` se confirman juntos o no se confirma nada. Resultados: éxito; error de dominio `FISCAL_*` (transacción revertida, se audita el rechazo aparte); cualquier otro error = **resultado desconocido** (`RECONCILE_OUTCOME_UNKNOWN`, se audita `response_lost`, nunca `rejected`). Probado: reversión completa si la auditoría falla dentro de la transacción (`test/db/security.db.test.mjs`).
- **Bloqueo retroactivo**: `fiscal.retroactive_emission_blocks` con las cuatro ventas Point antiguas; `crm_claim_fiscal_issuance` rechaza con `FISCAL_RETROACTIVE_BLOCKED` antes de crear fila.
- **Recibos**: solo se guardan con fila en `sending` y para la misma venta, negocio y operación; contenido distinto -> `FISCAL_RECEIPT_CONFLICT`; clave compuesta impide asociarlos a otro negocio.
- **Recuperación**: `staleAfterMs` por defecto 15 minutos, configurable con `FISCAL_STALE_AFTER_MS` (límites 5 min - 24 h). Si el valor es inválido, el arranque falla (`lib/config.mjs`, `app.ts: buildRecoveryRunner`).
- **Contrato PostgREST**: `test/helpers/postgrest-client.mjs` replica las reglas de supabase-js; sus reglas están probadas con `fetch` falso (`test/unit/postgrest-client.test.mjs`). La prueba contra PostgREST real está en `test/contract/` y se ejecuta con `npm run test:contract` (ver abajo). **No se ha ejecutado aquí**: no hay binario de PostgREST disponible.

### Ejecutar

- `npm test`: unidad en memoria (159).
- `FISCAL_TEST_PG_DB=walinka_test npm run test:db`: Postgres real local (87).
- `npm run test:deno`: Deno (11).
- `node --test api/fiscal/*.test.js api/_lib/*.test.js` (desde la raíz del repo; requiere `@supabase/supabase-js` instalado): 35.
- `npm run test:contract`: requiere `POSTGREST_BIN` y `PGRST_DB_URI` apuntando a una base local de prueba. Se niega si la URL es de producción o no es local. Sin esas variables la prueba se salta.

### Pendientes antes de aprobar

1. Política tributaria de la reconciliación sin definir: qué evidencia basta para resolver un `unknown`.
2. Trigger de cambio de dueño: `SECURITY DEFINER`. Ningún cliente puede actualizar `wa_businesses.user_id` (privilegio revocado para `anon` y `authenticated`); la transferencia queda solo para `service_role`. Revisar antes de aplicar en producción.
3. Ejecutar `test:contract` contra un PostgREST real (no verificado).
4. Ningún planificador ejecuta la recuperación todavía.
5. Las ventas Point bloqueadas son las cuatro identificadas en la lectura de solo lectura; confirmar la lista.

## Plan de integración PostgREST (no ejecutado aquí)

Objetivo: verificar que `store-supabase` se comporta igual que contra PostgREST real. Solo lectura y `SELECT` de UUID inexistentes.

Comando (desde `supabase/functions/fiscal-emit`):

```
POSTGREST_BIN=/ruta/a/postgrest \
PGRST_DB_URI='postgres://postgres:<clave-local>@localhost:5544/walinka_test' \
npm run test:contract
```

Dependencias exactas:
- Binario PostgREST 12 o superior (`POSTGREST_BIN`). No está instalado en este entorno.
- Postgres local de prueba (`walinka_test`) con la migración `20261031_fiscal_single_ledger_guard.sql` aplicada.
- Roles `anon`, `authenticated` y `service_role` (verificados en `walinka_test`). El rol `authenticator` no existe: se usa el superusuario local `postgres` como conexión, lo que es menos fiel a producción.
- `PGRST_DB_URI` debe ser local; el script se niega si apunta al proyecto de producción o a un host no local.
- `PGRST_JWT_SECRET` se genera al azar por ejecución si no se define (no se imprime). El JWT de prueba se firma con ese mismo secreto.

Criterio de aprobación: los 5 casos de `test/contract` pasan contra PostgREST real, en particular `PGRST202` para RPC inexistente, `42501` para `anon`, y `null` para lecturas puntuales sin filas.
