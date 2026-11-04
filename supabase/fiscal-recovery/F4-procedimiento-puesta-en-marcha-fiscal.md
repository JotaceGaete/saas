# F4 — Procedimiento único de puesta en marcha (NO EJECUTADO)

Alcance: un solo procedimiento para las migraciones pendientes que habilitan la emisión de Bonita Casualidad
(RUT 77804207-K). No incluye emitir, consumir folios ni desplegar: cada paso exige autorización explícita.

## 0. Estado verificado en producción (SELECT, 31-oct)

| Objeto | Existe en producción |
|---|---|
| `fiscal.admin_audit` | NO (sin migración en el repositorio; definición en la base de pruebas) |
| `fiscal.business_fiscal_roles` | NO (sin migración en el repositorio) |
| `fiscal.business_credentials` | NO |
| `crm_fiscal_claim_with_credentials`, `crm_fiscal_save_credentials`, `crm_fiscal_emission_context` (versión nueva), `crm_fiscal_store_receipt`, `crm_fiscal_reconcile_admin` | NO |
| `public.crm_fiscal_issuances`, `crm_claim_fiscal_issuance`, `fiscal.issuers`, `fiscal.dte39_emission_control` | SÍ |
| `fiscal.dte39_emission_control.enabled` | false |
| Emisor Bonita Casualidad | enabled=false, verified=false, sin sucursal |

## 1. Orden de dependencias

P0 → A → B → C → D

- **P0 (prerrequisito, falta en el repositorio):** crear `fiscal.admin_audit` y `fiscal.business_fiscal_roles` con la
  definición de la base de pruebas (`\d` verificado): tabla de auditoría solo-anexar con checks de acción y resultado, y
  roles con `role` en (`fiscal_owner`, `fiscal_operator`, `fiscal_viewer`, `fiscal_reconciler`) y FK a `wa_businesses`.
  Sin P0, B y A fallan (`alter table fiscal.admin_audit` no existe).
- **A = `proposed/20261031_fiscal_single_ledger_guard.sql`:** funciones de ledger, guardas entre pipelines, `fiscal.business_credentials`,
  `crm_fiscal_emission_context`, `crm_fiscal_get_credentials`. Cambia `crm_claim_fiscal_issuance` (ya existe en prod) y
  quita `select` de `anon` sobre `public.crm_invoices`. Riesgo: confirmar que nada de la web pública lea esa tabla como anónimo.
- **B = `proposed/20261101_fiscal_connection.sql`:** requiere P0 y A. Amplía constraints de `admin_audit` e `issuers`, y las
  funciones de conexión.
- **C = `proposed/20261102_fiscal_provider_claim_guard.sql`:** requiere A y B. Redefine `crm_fiscal_store_receipt`,
  `crm_fiscal_mark_failed` y funciones de reconciliación; crea `crm_fiscal_claim_with_credentials`.
- **D = `proposed/20261031_issuer_sucursal_config.sql`:** requiere A (redefine `crm_fiscal_emission_context`) y C.
- **E = `proposed/20261102_fiscal_sii_status.sql`:** estado SII separado e inmutabilidad del documento. Va después de D.
- **F = `proposed/20261104_fiscal_onboarding_review.sql`:** alta por comercio con revisión de Walinka
  (estado de revisión, resolución SII por emisor, `crm_fiscal_submit_application`,
  `crm_fiscal_review_application`, `crm_fiscal_list_applications`). Redefine `crm_fiscal_connection_status`
  y `crm_fiscal_emission_context`. Un emisor solo queda `verified` con `review_status = 'approved'`;
  cambiar o quitar la API key lo devuelve a `draft`.
- **G = `proposed/20261104_fiscal_product_tax_category.sql`:** tratamiento tributario por producto
  (`wa_products.tax_treatment`, nullable: afecto, exento o no afecto) y categoría por defecto del negocio
  (`fiscal.issuers.default_tax_category`). Redefine `fiscal.sale_tax_lines_verified` (todas las líneas deben ser
  afectas para DTE 39) y `crm_fiscal_emission_context`. Agrega una columna a `public.wa_products`: el editor
  solo la envía con `VITE_FISCAL_CONNECTION_ENABLED=true`. Debe ir al final.

## 2. Respaldo (antes de cualquier paso)

Con un rol de solo lectura del proyecto de producción, guardar fuera del repositorio:
```
pg_dump --schema-only --schema=fiscal --schema=public -f respaldo_pre_F4_$(date +%F).sql "$SUPABASE_DB_URL"
```
Y las definiciones exactas de las funciones que A, C y D reemplazan (`pg_get_functiondef`), para poder revertirlas.
Anotar también los privilegios actuales de `public.crm_invoices` para `anon`.

## 3. Aplicación en un clon primero

1. Crear un clon de la base de producción (sin datos de clientes si es posible).
2. Aplicar P0, A, B, C, D en ese orden. Cada paso debe terminar sin error.
3. Ejecutar `test/db` contra el clon (suite de 115 pruebas de `fiscal-emit`). Deben pasar.
4. Solo si el clon pasa, pedir autorización para producción.

## 4. Aplicación en producción (con autorización)

Un paso por migración, con verificación después de cada uno:

| Paso | Verificación |
|---|---|
| P0 | `to_regclass('fiscal.admin_audit')` y `to_regclass('fiscal.business_fiscal_roles')` no nulos |
| A | `to_regclass('fiscal.business_credentials')` no nulo; `pg_get_functiondef` de `crm_claim_fiscal_issuance` contiene `'siisolutions'` |
| B | `crm_fiscal_save_credentials` y `crm_fiscal_connection_status` existen con grants solo a `service_role` |
| C | `crm_fiscal_claim_with_credentials` existe; `crm_fiscal_issuances_provider_check` admite `siisolutions` y `dtecore` |
| D | columnas `sucursal_nombre`, `sucursal_codigo` en `fiscal.issuers`; `crm_fiscal_emission_context` devuelve `sucursal_nombre` |
| E | columna `sii_status` en `crm_fiscal_issuances` |
| F | columnas `review_status`, `resolucion_numero`, `resolucion_fecha` en `fiscal.issuers`; constraint `issuers_review_check`; las tres funciones de alta solo con `service_role` |
| G | columna `tax_treatment` en `wa_products` con su check; `default_tax_category` en `fiscal.issuers`; trigger `wa_products_tax_treatment_audit`; `crm_fiscal_set_tax_default` solo con `service_role` |

Todas las migraciones se aplican con `enabled=false` en `dte39_emission_control`. Nada emite con el interruptor apagado.

## 5. Reversión

Por paso, en orden inverso:

- **G:** restaurar `fiscal.sale_tax_lines_verified` y `crm_fiscal_emission_context` de F; `drop trigger
  wa_products_tax_treatment_audit`; `drop function crm_fiscal_set_tax_default, fiscal.line_tax_category`; las columnas
  `tax_treatment` y `default_tax_category` se pueden dejar (nullable, sin efecto) o quitar.
- **F:** `drop function` de `crm_fiscal_submit_application`, `crm_fiscal_review_application`, `crm_fiscal_list_applications`;
  `drop trigger business_credentials_reset_review`; restaurar `crm_fiscal_connection_status` y `crm_fiscal_emission_context`
  de E/D; quitar `issuers_review_check` y las columnas nuevas solo si ningún comercio fue aprobado.
- **D:** restaurar la definición de `crm_fiscal_emission_context` guardada en el respaldo; `alter table fiscal.issuers drop column sucursal_nombre, drop column sucursal_codigo`.
- **C:** restaurar desde el respaldo las funciones redefinidas; `drop function public.crm_fiscal_claim_with_credentials`, `crm_fiscal_release_claim`; restaurar el check de `crm_fiscal_issuances`.
- **B:** restaurar `issuers_provider_check` y `admin_audit_action_check` anteriores; `drop function` de las funciones de conexión.
- **A:** `drop table fiscal.business_credentials` **solo si está vacía**; restaurar funciones desde el respaldo; restaurar `grant select` de `anon` sobre `crm_invoices` si se había quitado.
- **P0:** `drop table` solo si está vacía y ningún objeto depende de ella.

Regla: la reversión nunca modifica folios, XML ni PDF ya emitidos. Las filas de auditoría se conservan.

## 6. Qué no hace este procedimiento

- No emite boletas. No consume folios. No despliega `fiscal-emit`.
- No activa el emisor ni la emisión global (`emission_control.enabled`). Eso ocurre solo en la prueba autorizada.

## 7. Lectura de la boleta 51106 (preparada, NO EJECUTADA)

Documentado en la colección: `GET {{baseUrl}}/dte/documentos/{codigoDte}/{folio}/xml`, con `codigoDte=39`, `folio=51106`.
Cabecera de autenticación: `X-Api-Key`, que la colección fija desde la variable `apiKey` en un script de prueba.
Efectos secundarios: la colección no los describe. Por convención GET no escribe, pero no está documentado.

```
curl -sS -H "Accept: application/json" -H "X-Api-Key: $SII_API_KEY" \
  "https://api.siisolutions.cl/dte/documentos/39/51106/xml" -o boleta_51106_xml.json
```
La clave debe estar en el entorno de quien ejecuta, no en el chat. Verificar después: `MntNeto`, `IVA`, `MntTotal`, `Sucursal`, `RUT emisor`.
