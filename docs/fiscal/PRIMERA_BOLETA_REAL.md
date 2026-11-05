# Primera boleta real (DTE 39): bloqueos y plan

Fecha: 2026-11-05. Circuito: **venta TPV → fiscal-emit → DTE Core → DTE 39 → XML/PDF → impresión térmica.**
Código: PR JotaceGaete/saas#123 (sobre #119). Nada de esto está desplegado ni aplicado en producción.
Cada etapa necesita autorización expresa antes de ejecutarse.

## Bloqueos restantes

| # | Bloqueo | Quién lo resuelve |
|---|---|---|
| 1 | ~~Migraciones~~ **Resuelto 2026-11-05:** A–H aplicadas y registradas (H = `20261105200532 fiscal_h_identity_integrity`, md5 verificado, 18 comprobaciones en `true`). Ver `supabase/fiscal-recovery/PRODUCTION-MIGRATION-LEDGER-2026-11-04.md`. | — |
| 2 | `fiscal-emit` no desplegada. Pruebas Deno (`npm run test:deno`, `deno check index.ts`) sin ejecutar: este entorno no tiene `deno`. | Ejecutar en un equipo con Deno o CLI de Supabase |
| 3 | Secretos: `FISCAL_MASTER_KEY` (32 bytes base64), **la misma** en Supabase (descifra) y Vercel (cifra); `FISCAL_ALLOWED_ISSUERS="<uuid>=<rut>"` igual en ambos; `FISCAL_PROVIDER=dtecore` solo en Supabase. | Juan |
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

**Etapa 2 — Despliegue sin emisión (con autorización).**
1. `npm run test:deno` y `deno check index.ts`.
2. Secretos de Supabase: `FISCAL_MASTER_KEY`, `FISCAL_ALLOWED_ISSUERS` (solo la empresa piloto),
   `FISCAL_PROVIDER=dtecore`. Desplegar `fiscal-emit`.
3. Vercel (Preview de la rama): `FISCAL_MASTER_KEY` (la misma), `FISCAL_ALLOWED_ISSUERS`,
   `VITE_FISCAL_CONNECTION_ENABLED=true`, `VITE_FISCAL_EMIT_ENABLED=true`, `VITE_FISCAL_AUTO_EMIT=live`.
   Producción: `VITE_FISCAL_AUTO_EMIT=off`.
4. Comprobar que `status` de una venta devuelve `liveAuthorized: false` y un `blockedReason`
   claro (emisión global apagada).

**Etapa 3 — Configuración del comercio piloto.**
1. Configuración → Facturación electrónica: RUT, API key, resolución SII. Enviar.
2. Administrador de Walinka aprueba.
3. El propietario revisa el RUT mostrado y lo **confirma** (casilla + botón).
4. Categoría de IVA por defecto: afecto 19 %.
5. Impresión: conector y Xprinter configurados; resolución visible en la vista previa.

**Etapa 4 — Primera boleta (con autorización, en ventana corta).**
1. Encender `dte39_emission_control.enabled = true` (SQL, postgres).
2. Venta TPV de bajo monto (p. ej. $1.190), un producto afecto, efectivo, sin descuento.
3. Esperado: `issued` con folio; XML con `RUTEmisor` = RUT del comercio, `TipoDTE` 39, total
   correcto; PDF guardado; ticket térmico con timbre.
4. Apagar `enabled = false` inmediatamente.
5. Si queda `unknown`: no reintentar. Revisar el portal de DTE Core por el folio y conciliar.

**Etapa 5 — Validación.**
1. Medir y leer el timbre impreso; verificar el documento en sii.cl.
2. Estado SII en el portal de DTE Core (aceptado).
3. Revisar `crm_fiscal_issuances`, `fiscal.document_folios` y `fiscal.admin_audit` de la venta.
4. Reimprimir desde Walinka: mismo folio, cero llamadas a DTE Core.

**Criterios para detenerse:** cualquier `unknown`, XML con otro RUT, folio repetido, total distinto,
error en Point o en la numeración interna, o un timbre ilegible.
