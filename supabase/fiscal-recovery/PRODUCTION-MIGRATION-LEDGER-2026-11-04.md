# Historial fiscal de producción — 2026-11-04

Proyecto Supabase: `hxxdketymcntadffmajf` (Walinka). Auditoría de solo lectura realizada el 2026-11-04. Esta documentación **no ejecuta SQL** ni modifica el historial de Supabase.

## Orden real y correspondencia

| Paso | Versión registrada en `supabase_migrations.schema_migrations` | Nombre registrado | Archivo fuente en este repositorio | Cómo se aplicó |
|---|---|---|---|---|
| A | `20261104164731` | `fiscal_a_single_ledger_guard` | `proposed/20261031_fiscal_single_ledger_guard.sql` | Herramienta de migraciones; SQL completo |
| B | `20261104165458` | `fiscal_b_connection` | `proposed/20261101_fiscal_connection.sql` | Herramienta de migraciones; SQL completo |
| C | `20261104171833` | `fiscal_c_provider_claim_guard` | `proposed/20261102_fiscal_provider_claim_guard.sql` | Herramienta de migraciones; SQL completo |
| D | `20261104182155` | `fiscal_d_manual_sql_editor_verified` | `proposed/20261031_issuer_sucursal_config.sql` | **SQL completo aplicado manualmente en SQL Editor**; la entrada registrada posteriormente ejecutó **solo verificaciones** |
| E | `20261104182301` | `fiscal_e_sii_status` | `proposed/20261102_fiscal_sii_status.sql` | Herramienta de migraciones; SQL completo |
| F | `20261104182830` | `fiscal_f_onboarding_review` | `proposed/20261104_fiscal_onboarding_review.sql` | Herramienta de migraciones; SQL completo |
| G | `20261104183454` | `fiscal_g_manual_sql_editor_verified` | `proposed/20261104_fiscal_product_tax_category.sql` | **SQL completo aplicado manualmente en SQL Editor**; la entrada registrada posteriormente ejecutó **solo verificaciones** |
| H | `20261105200532` | `fiscal_h_identity_integrity` | `proposed/20261105_fiscal_identity_integrity.sql` | Herramienta de migraciones (`apply_migration`); SQL completo (agregado el 2026-11-05) |

Los archivos fuente de A–G corresponden al commit `9baacf1509e10e58e23f93cdfbbb2850c541104f` de la rama de trabajo de PR #119. El de H, al commit `80e8d69` de la rama de PR #123 (`claude/fiscal-multiempresa-integridad`). **No inferir el orden por las fechas de los nombres de archivo**: seguir el orden A→B→C→D→E→F→G descrito en `F4-procedimiento-puesta-en-marcha-fiscal.md`.

## Huellas del contenido registrado

Valores MD5 de `md5(array_to_string(statements, E'\\n'))` obtenidos de la tabla de migraciones:

| Paso | MD5 de la entrada registrada |
|---|---|
| A | `160faa10c87791490eec7e2fffd5b66d` |
| B | `1db2d679ae43cfdd64af60ca738ac2e4` |
| C | `f8f3b4e449d5cf98260fa1077385824c` |
| D (verificación, **no SQL original**) | `1aa5f9019c6e1f237fd91460a85434da` |
| E | `4bb634b26688ef7b5e7c4b92fa3950ec` |
| F | `69a9f756a36fc6ce1292a295f78077e2` |
| G (verificación, **no SQL original**) | `e951ceea658909b106dc10df754b3a8f` |
| H | `0c71ae71c9ab4ac1be9e78b70f8f3ded` |

Huellas de F, G y H incorporadas el 2026-11-05 (solo lectura). A, B, C, E, F y H coinciden con el md5 de su archivo fuente. G, igual que D, contiene únicamente el bloque de verificación en el registro de Supabase, no el SQL original.

La huella de D corresponde al bloque de verificación `DO $verify$ ...`, **no** al archivo `20261031_issuer_sucursal_config.sql`. No sustituirla por la huella del archivo original ni afirmar que la migración registrada ejecutó el archivo original.

## Estado verificado

- A–E instaladas; D comprobada mediante columnas de sucursal, constraint, función de contexto y privilegios.
- E registrada y comprobada: seis columnas SII, tres triggers, RLS de eventos, funciones protegidas, boleta histórica intacta y cuatro bloqueos históricos.
- Emisión global `fiscal.dte39_emission_control.enabled = false`.
- F instalada automáticamente; G instalada manualmente y registrada posteriormente mediante verificación (sin repetir SQL).
- G verificada: columnas `wa_products.tax_treatment` y `fiscal.issuers.default_tax_category`, restricciones, trigger de auditoría y cinco funciones accesibles solo a `service_role`.
- Boleta histórica intacta; cuatro bloqueos históricos conservados.

## Verificación del 2026-11-05 (solo lectura, antes de H)

- **D y G contra sus archivos:** huella del catálogo fiscal de producción (funciones, permisos, columnas,
  restricciones, triggers y políticas) comparada con una copia local construida desde los archivos A–G. Sin
  diferencias de fondo. Las únicas diferencias: el privilegio MAINTAIN (`m`) de PostgreSQL 17; las tablas
  `fiscal.business_tax_defaults` y `fiscal.fiscal_pre_a_backup`, que existen solo en producción por migraciones
  anteriores; y los saltos de línea CRLF de las 6 funciones de G (pegadas desde el SQL Editor), idénticas al
  archivo sin `\r`.
- **Migraciones previas a A, también registradas:** `20261102222438 fiscal_p0_admin_tables` (md5
  `2cfd3cdf135a7eba09686fed06d7078e`, igual a `proposed/20261031_p0_fiscal_admin_tables.sql`) y las instantáneas
  `20261102222915 fiscal_pre_a_snapshot` y `20261102223104 fiscal_pre_a_permissions_policies_snapshot`, sin
  archivo en el repositorio.
- **Piloto 20261029–20261031:** producción tiene exactamente 34 filas en ese rango y las 34 coinciden byte a byte
  con `migrations/` (`MANIFEST.tsv`, `verify.sh`). El "37" mencionado en el encabezado de `MANIFEST.tsv` era un
  error de conteo previo.

## H (2026-11-05)

- **Antes:** respaldo PHYSICAL del 2026-11-05 11:22:09 UTC, posterior a A–G, confirmado en el panel. Prechequeo
  `backups/2026-11-05-H/00-precheck-H.sql` sin bloqueos. Emisión apagada, sin emisiones en curso, H no registrada
  y sin objetos. Estructura previa: `backups/2026-11-05-H/01-respaldo-estructura-pre-H.sql`.
- **Aplicación:** `apply_migration` con nombre `fiscal_h_identity_integrity` y el archivo exacto. Un primer
  intento expiró sin respuesta a la confirmación del conector y no cambió nada; se verificó antes de reintentar.
- **Después:**
  - una sola entrada nueva en el historial, con md5 igual al archivo;
  - `backups/2026-11-05-H/03-verificacion-post-H.sql`: 18/18 comprobaciones en `true`;
  - boleta piloto intacta (folio 51106, total 100, XML y PDF sin cambios, RUT emisor del XML = RUT del emisor);
  - ventas, líneas, pagos y operaciones Point sin cambios;
  - emisión global apagada y triggers de colas antiguas desactivados.
- **Recuperación:** `backups/2026-11-05-H/02-recuperacion-H.sql`, probada en local con el archivo exacto.

## Reglas para futuros despliegues

1. **No volver a ejecutar A–H en producción** (en particular D y G) ni editar, borrar o renumerar las filas históricas para hacerlas parecer uniformes.
2. Al reconstruir un entorno desde cero, aplicar **el SQL original de D** en su posición entre C y E, **el SQL original de G** después de F y H después de G (`localdb/build.sh` sigue ese orden). Las entradas `fiscal_d_manual_sql_editor_verified` y `fiscal_g_manual_sql_editor_verified` son comprobantes específicos de producción y **no sustituyen los SQL originales**.
3. Si se crea una cadena formal de migraciones CLI en `supabase/migrations`, preparar una reconciliación separada: el registro del servidor y los archivos CLI todavía requieren un plan de baseline, no una copia automática de estas entradas.
4. Antes de nuevos despliegues: revisar dependencias, respaldar, verificar estructura y permisos, y mantener desactivada la emisión.
5. No desplegar `fiscal-emit`, no activar emisores, no consumir folios y no mezclar el historial de pruebas con producción.

Documento de trazabilidad; no es una migración ejecutable.
