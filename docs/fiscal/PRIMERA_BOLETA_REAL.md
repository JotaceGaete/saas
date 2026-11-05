# Primera boleta real (DTE 39): bloqueos y plan

Fecha: 2026-11-05. Circuito: **venta TPV → fiscal-emit → DTE Core → DTE 39 → XML/PDF → impresión térmica.**
Código: PR JotaceGaete/saas#123 (sobre #119). Nada de esto está desplegado ni aplicado en producción.
Cada etapa necesita autorización expresa antes de ejecutarse.

## Bloqueos restantes

| # | Bloqueo | Quién lo resuelve |
|---|---|---|
| 1 | ~~Migraciones~~ **Resuelto 2026-11-05:** A–H aplicadas y registradas (H = `20261105200532 fiscal_h_identity_integrity`, md5 verificado, 18 comprobaciones en `true`). Ver `supabase/fiscal-recovery/PRODUCTION-MIGRATION-LEDGER-2026-11-04.md`. | — |
| 2 | ~~`fiscal-emit` no desplegada~~ **Desplegada 2026-11-05 en modo aislado:** versión 1, `verify_jwt=true`, 18 archivos idénticos (sha256) al commit `65f7e60`, sin `FISCAL_PROVIDER` (adaptador bloqueado). Base sin cambios. Faltan las pruebas HTTP posteriores desde fuera (401, CORS, `status` → `PROVIDER_NOT_READY`). | Juan (pruebas HTTP) |
| 3 | Secretos: `FISCAL_MASTER_KEY` (32 bytes base64), **la misma** en Supabase (descifra) y Vercel (cifra); `FISCAL_ALLOWED_ISSUERS="<uuid>=<rut>"` igual en ambos. `FISCAL_PROVIDER` **no se configura** en el despliegue aislado (Etapa 2) ni en la configuración (Etapa 3): sin él la función usa el adaptador bloqueado. `FISCAL_PROVIDER=dtecore` solo en Supabase y solo en la Etapa 4, con autorización expresa. | Juan |
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
