# Primera boleta real (DTE 39): bloqueos y plan

Fecha: 2026-11-05. Circuito: **venta TPV → fiscal-emit → DTE Core → DTE 39 → XML/PDF → impresión térmica.**
Código: PR JotaceGaete/saas#123 (sobre #119). Nada de esto está desplegado ni aplicado en producción.
Cada etapa necesita autorización expresa antes de ejecutarse.

## Bloqueos restantes

| # | Bloqueo | Quién lo resuelve |
|---|---|---|
| 1 | ~~Migraciones~~ **Resuelto 2026-11-05:** A–H aplicadas y registradas (H = `20261105200532 fiscal_h_identity_integrity`, md5 verificado, 18 comprobaciones en `true`). Ver `supabase/fiscal-recovery/PRODUCTION-MIGRATION-LEDGER-2026-11-04.md`. | — |
| 2 | ~~`fiscal-emit` no desplegada~~ **Resuelto 2026-11-06 (Etapa 2 completada):** versión 3 desde `fae2b05`, en modo aislado con proveedor bloqueado. Ver Etapa 2. | — |
| 3 | Secretos. **Supabase (main): hecho 2026-11-06** — `FISCAL_MASTER_KEY` (32 bytes base64, verificada por el arranque) y `FISCAL_ALLOWED_ISSUERS` (formato válido); `FISCAL_PROVIDER` ausente. **Vercel (Preview autorizada): pendiente** — `FISCAL_MASTER_KEY` **idéntica** a la de Supabase (la vigente desde el 6-11-2026 12:28 UTC; Vercel cifra, Supabase descifra) y `FISCAL_ALLOWED_ISSUERS` igual. `FISCAL_PROVIDER=dtecore` solo en Supabase y solo en la Etapa 4, con autorización expresa. | Juan |
| 4 | Cuenta DTE Core de la empresa piloto: CAF de boletas (tipo 39) con folios disponibles, certificado activo, ambiente de producción. Confirmar que la "validación de operación" (409 `folioExistente` con `idBoletaOperacion` repetido) esté activa. | Juan con DTE Core |
| 5 | Datos del emisor en Walinka: RUT + API key guardados, resolución SII (número y fecha reales), sucursal si aplica, solicitud aprobada por un administrador, **RUT confirmado por el propietario**. | Juan (propietario y admin) |
| 6 | IVA de los productos: categoría por defecto del negocio o `tax_treatment` por producto en `IVA_AFECTO_19` (sin eso: `FISCAL_TAX_LINES_NOT_VERIFIED`). Solo ventas 100 % afectas, sin descuento, pagadas en efectivo o Point confirmado, del mismo día. | Juan |
| 7 | Impresión: el timbre PDF417 se validó con ZXing sobre el TED real, pero **falta medirlo impreso** (mínimo 2 x 4,5 cm), **leer el timbre impreso** y verificarlo en sii.cl (docs/fiscal/REPRESENTACION_BOLETA_80MM.md, filas 2, 6 y 8). | Prueba física con la Xprinter |
| 8 | Respuestas no documentadas de DTE Core para la recuperación: `GET /dte/operaciones/39/{id}` y estado SII. No bloquean la emisión: ante un `unknown`, la venta queda bloqueada y se concilia en el portal de DTE Core. | Revisar la primera respuesta real |
| 9 | Notas de crédito (DTE 61): diseño y esquema listos, emisión bloqueada. Una boleta mal emitida no se puede anular desde Walinka todavía: se hace en el portal de DTE Core. | Después de la primera boleta |

## Plan

**Etapa 1 — Base de datos (con autorización).**
**Hecho (2026-11-05).** A–H aplicadas y registradas en producción (`supabase/fiscal-recovery/PRODUCTION-MIGRATION-LEDGER-2026-11-04.md`). H se aplicó con
`apply_migration` tras repetir el prechequeo, con respaldo físico del 5-11-2026 11:22:09 UTC; historial con el
md5 del archivo y las 18 comprobaciones de `03-verificacion-post-H.sql` en `true`.
4. Correr `test-flujos-criticos.sql` en una copia o verificar a mano TPV, Point y numeración.
   `dte39_emission_control.enabled` sigue en `false`.

**Etapa 2 — Despliegue aislado sin emisión (con autorización).**
**Completada (2026-11-06).** Evidencia:
- `fiscal-emit` versión 3, ACTIVE, `verify_jwt=true`, publicada desde el commit `fae2b05`: los 18
  archivos del grafo de `index.ts` idénticos (sha256) a los del commit, sin archivos extra.
- Historia: v1 (`65f7e60`, 2026-11-05) caía al arrancar, primero por secretos ausentes y luego por
  `ReferenceError: Buffer is not defined` (el Deno local expone `Buffer` como global; Supabase Edge no).
  `fae2b05` importa `Buffer` de `node:buffer`, añade el diagnóstico de arranque y un respaldo que
  respeta CORS y responde 503 `FISCAL_NOT_CONFIGURED` si la configuración es inválida. Una primera
  `FISCAL_MASTER_KEY` no medía 32 bytes (`MASTER_KEY_INVALID`); se reemplazó el 2026-11-06 12:28 UTC.
- Arranque (todos los registrados desde 12:28 UTC): `missing: []`, `fiscalProviderSet: false`,
  `providerMode: "blocked"`, sin `configuración inválida`.
- Pruebas externas (Juan, 2026-11-06):
  A. OPTIONS desde `https://go.walinka.com` → 204 con `access-control-allow-origin` y `Vary: Origin`.
  B. OPTIONS desde `https://evil.example` → 403 `ORIGIN_NOT_ALLOWED`, sin cabeceras CORS.
  C. POST sin token → 401 `UNAUTHORIZED_NO_AUTH_HEADER` (plataforma, `verify_jwt`).
  D. `status` autenticado desde la Preview de #123 (consola del navegador, sin copiar el token) sobre
     la venta `c5a5ddeb-…` → 200, `blockedReason: PROVIDER_NOT_READY`, `liveAuthorized: false`,
     `canEmit: false`. Primera lectura real contra PostgREST (venta, rol, emisión, contexto) sin errores.
- Base después de las pruebas: emisión global apagada; 0 emisores habilitados, 0 credenciales,
  0 confirmaciones de RUT; 1 emisión (boleta piloto 51106), ninguna en curso; 0 filas para la venta
  de prueba; 0 auditoría; 1 folio; triggers de cola deshabilitados; sin cron fiscal; 1.173 ventas,
  1.621 ítems, 1.127 pagos; última migración H.
- No se configuró `FISCAL_PROVIDER`, no se tocó Vercel y no se fusionó ninguna PR.

Procedimiento seguido:
El proveedor queda bloqueado en toda esta etapa: `FISCAL_PROVIDER` **no existe** en los secretos de
Supabase (ni `dtecore` ni `siisolutions`; cualquier otro valor o su ausencia usa el adaptador bloqueado).
1. Pruebas: `npm run test:deno` y `deno check index.ts` (hecho en `438e136`: 20/20, limpio).
2. Secretos de Supabase (revisados por Juan, solo por nombre): `FISCAL_MASTER_KEY`,
   `FISCAL_ALLOWED_ISSUERS` (solo la empresa piloto), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
   `FISCAL_PROVIDER` ausente.
3. Desplegar `fiscal-emit` desde el commit autorizado con `verify_jwt=true` explícito en la llamada de
   despliegue (no basta `config.toml`) y los 18 archivos del grafo de `index.ts`.
4. Vercel: sin cambios. `VITE_FISCAL_AUTO_EMIT` no se pone en `live` en ningún entorno.
5. Comprobar: archivos publicados = commit, `verify_jwt=true`, CORS, y que `emit`/`status` de una venta
   piloto devuelven `PROVIDER_NOT_READY` / `liveAuthorized: false`. Base sin cambios.

**Etapa 3 — Configuración del comercio piloto.**
0. Vercel, Preview autorizada (con autorización): `FISCAL_MASTER_KEY` (la misma que en Supabase),
   `FISCAL_ALLOWED_ISSUERS`, `VITE_FISCAL_CONNECTION_ENABLED=true`. `FISCAL_PROVIDER` sigue ausente en Supabase.
1. Configuración → Facturación electrónica: RUT, API key, resolución SII. Enviar.
2. Administrador de Walinka aprueba.
3. El propietario revisa el RUT mostrado y lo **confirma** (casilla + botón).
4. Categoría de IVA por defecto: afecto 19 %.
5. Impresión: conector y Xprinter configurados; resolución visible en la vista previa.

**Etapa 4 — Primera boleta (con autorización, en ventana corta).**
0. Con autorización expresa: `FISCAL_PROVIDER=dtecore` en Supabase y, en la Preview autorizada,
   `VITE_FISCAL_EMIT_ENABLED=true`, `VITE_FISCAL_AUTO_EMIT=live`
   (producción: `VITE_FISCAL_AUTO_EMIT=off`).
1. Encender `dte39_emission_control.enabled = true` (SQL, postgres).
2. Venta TPV de bajo monto (p. ej. $1.190), un producto afecto, efectivo, sin descuento.
3. Esperado: `issued` con folio; XML con `RUTEmisor` = RUT del comercio, `TipoDTE` 39, total
   correcto; PDF guardado; ticket térmico con timbre.
4. Apagar `enabled = false` inmediatamente y volver a quitar `FISCAL_PROVIDER` si la ventana termina.
5. Si queda `unknown`: no reintentar. Revisar el portal de DTE Core por el folio y conciliar.

**Etapa 5 — Validación.**
1. Medir y leer el timbre impreso; verificar el documento en sii.cl.
2. Estado SII en el portal de DTE Core (aceptado).
3. Revisar `crm_fiscal_issuances`, `fiscal.document_folios` y `fiscal.admin_audit` de la venta.
4. Reimprimir desde Walinka: mismo folio, cero llamadas a DTE Core.

**Criterios para detenerse:** cualquier `unknown`, XML con otro RUT, folio repetido, total distinto,
error en Point o en la numeración interna, o un timbre ilegible.
