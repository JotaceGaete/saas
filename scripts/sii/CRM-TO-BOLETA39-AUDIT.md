# Auditoría del origen de datos para boleta 39 — Walinka

**Estado:** auditoría de código, sin conexión a BD de producción. NO autoriza emisión.
**Fuentes de código revisadas:** `scripts/sii/walinka-fiscal-adapter.mjs`, `walinka-sale-eligibility.mjs`, `walinka-fiscal-reconciliation.mjs`, `scripts/sii/BOLETA39-XML-FIELD-MAP.md`.
**Nota:** `docs/DATA-MODEL.md` (auditoría 2026-05-25) no prueba el esquema actual de CRM; verificar en migraciones y BD de pruebas.

## Campos que el adaptador realmente consulta

| Origen | Campos | Propósito actual | Brecha para XML |
|---|---|---|---|
| `wa_businesses` | id, user_id, country_code, is_active | tenant CL, propietario, activo | No lee razón social, giro, dirección fiscal, resolución |
| Registro fiscal externo de confianza | issuerRut, fiscalEnabled, issuerVerified | Emisor aprobado | No prueba autorización SII, CAF o certificado |
| `crm_invoices` | id, business_id, status, paid_at, total | Venta pagada | No lee fecha fiscal, moneda, descuento, receptor, identificador inmutable |
| `crm_invoice_items` | id, invoice_id, quantity, unit_price, subtotal | Cantidades y totales | No lee descripción/nombre producto; falta mapeo NmbItem |
| `crm_payments` | invoice_id, amount, payment_method, payment_status, voided_at | Conciliación | Debe confirmar estados reales y tratamiento de reembolsos/contracargos |
| `taxMapping.getVerifiedLineTaxes` | businessId, saleId, invoiceItemId, verified, category | Clasificación tributaria | Solo acepta IVA_AFECTO_19; no define redondeo ni base imponible |

## Hallazgos del código
1. `getSale()` devuelve siempre `fiscalEligible:false`, incluso cuando `preEligible` y `reconciled` sean verdaderos. **Esto es una protección deliberada que se debe mantener.**
2. `canIssue()` comprueba propiedad del negocio y país CL, pero no es autorización tributaria por sí sola; la reserva en BD debe volver a validar permiso, RUT y snapshot.
3. `assessWalinkaCrmSale()` exige estado `pagada`, `paid_at`, total entero positivo, ítems no vacíos y suma de subtotales igual al total.
4. `assessFiscalReconciliation()` exige pagos recibidos no anulados y suma idéntica al total; rechaza mixtos/exentos y clasificaciones no verificadas.
5. El adaptador **no selecciona el nombre del ítem**, por lo que no puede construir `Detalle/NmbItem` de forma fiel. No inventar descripciones.
6. La reconciliación no demuestra por sí sola bloqueo transaccional de pagos, ítems e impuestos durante la reserva. Hay que revisar SQL contra el esquema real y concurrencia.
7. No se ha verificado que los nombres de columnas consultados existan en la BD CRM actual. No alterar producción para descubrirlo.

## Próximas tareas técnicas, en orden
1. Confirmar esquema CRM vigente mediante migraciones y una base aislada (columnas, tipos, estados, índices, FK).
2. Obtener nombres de producto/servicio desde snapshot de línea de venta, nunca desde catálogo mutable.
3. Definir snapshot fiscal inmutable por RUT, venta, líneas, pagos, impuesto, descuento y fecha.
4. Implementar cálculo de neto/IVA/total con reglas oficiales vigentes y pruebas de redondeo.
5. Implementar serializador XML a partir del snapshot validado; sin emitir, firmar ni reservar folios reales.
6. Validar contra el XSD vigente/corregido oficialmente; conservar original para trazabilidad.

## Seguridad y despliegue
La emisión queda deshabilitada por defecto. No se han agregado endpoints, secretos, migraciones de producción ni activación de CAF.
