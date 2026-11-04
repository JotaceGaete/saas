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

Todos los archivos fuente anteriores corresponden al commit `9baacf1509e10e58e23f93cdfbbb2850c541104f` de la rama de trabajo de PR #119. **No inferir el orden por las fechas de los nombres de archivo**: seguir el orden A→B→C→D→E→F→G descrito en `F4-procedimiento-puesta-en-marcha-fiscal.md`.

## Huellas del contenido registrado

Valores MD5 de `md5(array_to_string(statements, E'\\n'))` obtenidos de la tabla de migraciones:

| Paso | MD5 de la entrada registrada |
|---|---|
| A | `160faa10c87791490eec7e2fffd5b66d` |
| B | `1db2d679ae43cfdd64af60ca738ac2e4` |
| C | `f8f3b4e449d5cf98260fa1077385824c` |
| D (verificación, **no SQL original**) | `1aa5f9019c6e1f237fd91460a85434da` |
| E | `4bb634b26688ef7b5e7c4b92fa3950ec` |

La huella de D corresponde al bloque de verificación `DO $verify$ ...`, **no** al archivo `20261031_issuer_sucursal_config.sql`. No sustituirla por la huella del archivo original ni afirmar que la migración registrada ejecutó el archivo original.

## Estado verificado

- A–E instaladas; D comprobada mediante columnas de sucursal, constraint, función de contexto y privilegios.
- E registrada y comprobada: seis columnas SII, tres triggers, RLS de eventos, funciones protegidas, boleta histórica intacta y cuatro bloqueos históricos.
- Emisión global `fiscal.dte39_emission_control.enabled = false`.
- F (`proposed/20261104_fiscal_onboarding_review.sql`) y G (`proposed/20261104_fiscal_product_tax_category.sql`) **no instaladas** a esta fecha.

## Reglas para futuros despliegues

1. **No volver a ejecutar D en producción** ni editar, borrar o renumerar las filas históricas para hacerlas parecer uniformes.
2. Al reconstruir un entorno desde cero, aplicar **el SQL original de D** en su posición entre C y E. La entrada `fiscal_d_manual_sql_editor_verified` es solo un comprobante específico de producción y **no sirve como sustituto de D**.
3. Si se crea una cadena formal de migraciones CLI en `supabase/migrations`, preparar una reconciliación separada: el registro del servidor y los archivos CLI todavía requieren un plan de baseline, no una copia automática de estas entradas.
4. Antes de F o G: revisar dependencias, respaldar, aplicar **una por vez**, verificar estructura y permisos, y mantener desactivada la emisión.
5. No desplegar `fiscal-emit`, no activar emisores, no consumir folios y no mezclar el historial de pruebas con producción.

Documento de trazabilidad; no es una migración ejecutable.
