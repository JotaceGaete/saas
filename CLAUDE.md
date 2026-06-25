# Instrucciones para Claude Code

## Regla general

Antes de hacer cualquier cambio en un módulo, auditar las funcionalidades existentes.
Después del cambio, confirmar explícitamente que ninguna función desapareció.
No hacer commits que introduzcan regresiones funcionales.

---

## Contrato funcional: CrmCustomers (`src/pages/crm/CrmCustomers.jsx`)

Este módulo debe conservar SIEMPRE las siguientes funcionalidades.
Si un cambio elimina alguna, es una regresión y debe corregirse antes del commit.

| Funcionalidad | Descripción |
|---|---|
| Vista tarjetas | Grid de CustomerCard con franja de estado, deuda, contacto, CTAs |
| Vista lista | Tabla compacta CustomerListRow con columnas configurables |
| Toggle tarjetas/lista | Iconos LayoutGrid/List, estado persistido en localStorage |
| Columnas configurables | Popover con checkboxes en vista lista (company, phone, email, rut, debt) |
| Filtro Todos | Chip activo por defecto, muestra todos los clientes |
| Filtro Con deuda | Chip rojo, filtra clientes con balanceMap[id] > 0 |
| Ordenamiento | Por nombre, empresa, deuda (asc/desc); click en cabecera en vista lista |
| Load More | 24 ítems iniciales, botón "Cargar más (N restantes)" en ambas vistas |
| Historial de pagos | Tab "Cuenta corriente" en CustomerDetailDrawer → lista de abonos |
| Registrar abono | Formulario inline por factura dentro del drawer |
| Anular pago | Botón Ban en cada abono activo → VoidPaymentModal → voidCrmPayment() |
| Estados anulados | Pagos anulados muestran badge "Anulado", tachado, motivo y fecha de anulación |

### Componentes que NO deben modificarse sin revisión explícita

- `CustomerCard` — card visual con franja de estado
- `CustomerDetailDrawer` — drawer completo con tabs Perfil / Cuenta corriente
- `CustomerAccountDrawer` — drawer alternativo de cuenta corriente
- `CustomerListRow` — fila de tabla para vista lista
- `VoidPaymentModal` (en `components/VoidPaymentModal.jsx`) — modal de anulación
- `CustomerModal` — formulario crear/editar cliente

### Checklist antes de cada commit en este módulo

- [ ] Vista tarjetas presente y funcional
- [ ] Vista lista presente y funcional
- [ ] Toggle tarjetas/lista funciona y persiste
- [ ] Columnas configurables en vista lista
- [ ] Filtro "Todos" funciona
- [ ] Filtro "Con deuda" filtra correctamente
- [ ] Ordenamiento por nombre/empresa/deuda funciona
- [ ] Load More muestra 24 ítems y carga más
- [ ] Historial de pagos visible en drawer
- [ ] Registrar abono funciona
- [ ] Anular pago funciona (requiere caja abierta)
- [ ] Pagos anulados muestran estado visual correcto

---

## Contrato funcional: Pagos y caja (`crmPaymentsService.js`, `crmService.js`)

| Regla | Detalle |
|---|---|
| Sin pago sin caja | Ningún pago `received` puede insertarse sin `cash_session_id`. Si no hay caja abierta → error `CASH_SESSION_REQUIRED` |
| Anulación siempre crea reverso | `voidCrmPayment` siempre inserta un movimiento `direction='out'` en `crm_cash_movements` (misma caja si está abierta, caja actual si está cerrada) |
| Orden de operaciones en void | Primero el insert en `crm_cash_movements`, luego el update de `voided_at`. Si falla el insert, abortar sin tocar el pago |
| `listPaymentsByInvoice` excluye crédito | Aplica `isCashRelevantPaymentMethod` — no suma `credit` en totales de caja |
| `listAllPaymentsByInvoice` ídem | Igual filtro, pero sin `voided_at IS NULL` (incluye anulados para historial) |

---

## Contrato funcional: Editores de documentos CRM

Aplica a `CrmInvoiceEditor.jsx` y `CrmQuoteEditor.jsx`.

### Principio de bloqueo por sección

El bloqueo es **por sección**, nunca por documento completo.

| Sección | Cuándo editable |
|---|---|
| **Financiera** (cliente, fechas, ítems, precios, descuentos, totales) | Solo cuando `canEditFinancial = true` |
| **Administrativa** (notas, condiciones, OC, despacho) | Siempre que `canEditAdmin = true` |

### Reglas de `canEditFinancial`

| Documento | Condición |
|---|---|
| Factura/nota de venta | `isNew \|\| (status === 'pendiente' && activePayments.length === 0)` |
| Presupuesto | `isNew \|\| (status in {'borrador','enviado'} && !converted_to_invoice_id)` |

### Reglas de `canEditAdmin`

| Documento | Condición |
|---|---|
| Factura/nota de venta | `!isNew && status !== 'anulada'` |
| Presupuesto | `!isNew && status !== 'rechazado' && !converted_to_invoice_id` |

Presupuesto **aceptado** admite edición administrativa (ítems bloqueados, notas/condiciones editables).

### Campos administrativos auditados

Campos: `notes`, `payment_terms`, `delivery_days`, `delivery_method`, `commercial_notes`, `purchase_order_number`, `dispatch_instructions`.

- Los actualiza `updateDocumentAdminFields(docType, docId, businessId, fields, prevValues)`.
- Solo inserta en `crm_document_changes` cuando `oldVal !== newVal` (no registra cambios vacíos ni iguales).
- Nunca se llama al crear un documento nuevo — solo desde `handleAdminSave`, que requiere `!isNew && canEditAdmin`.
- `crm_document_changes` contiene: `document_type`, `document_id`, `business_id`, `changed_by`, `field_name`, `old_value`, `new_value`, `changed_at`.

### Invariantes que nunca deben romperse

- **Preview PDF** — botón `setShowPdf(true)` presente en PanelHeader (desktop + mobile) y en el footer de la página. `CrmDocumentPdf` debe renderizar todos los campos administrativos, incluidos `purchase_order_number` y `dispatch_instructions` (en el bloque "Condiciones").
- **Botón Volver/Cancelar** — siempre presente, navega de vuelta al listado.
- **Registro de pago** — `createPayment` con `business_id` y `cash_session_id`. Error `CASH_SESSION_REQUIRED` si no hay caja abierta.
- **Anulación de pago** — `VoidPaymentModal` + `voidCrmPayment`. Inserta reverso en `crm_cash_movements` ANTES de marcar `voided_at`.
- **Historial de abonos** — sección visible en `CrmInvoiceEditor` cuando `!isNew && saved`, independiente del estado de edición.
- **Creación nueva** — `isNew` siempre activa `canEditFinancial`; la sección administrativa NO aparece hasta que el documento está guardado.

### Checklist antes de cada commit en estos módulos

- [ ] Crear documento nuevo funciona (canEditFinancial = true, no muestra admin section)
- [ ] Documento pendiente sin pagos → edición financiera completa
- [ ] Documento con pago → cliente/fechas/ítems deshabilitados, admin section visible y funcional
- [ ] Documento anulado/rechazado → todo bloqueado, sin admin section
- [ ] `handleAdminSave` guarda solo campos admin, registra en `crm_document_changes`
- [ ] Historial de cambios colapsable aparece y carga correctamente
- [ ] PDF preview muestra N° OC e instrucciones de despacho si están completados
- [ ] Botón Volver presente y funcional
- [ ] Registrar pago funciona
- [ ] Anular pago funciona
- [ ] Historial de abonos visible

### Requisito de migración para deploy

Antes de merge/deploy confirmar que `supabase/migrations/20260625000002_document_admin_edit.sql` fue aplicada en Supabase. Agrega:
- `purchase_order_number TEXT` y `dispatch_instructions TEXT` en `crm_invoices` y `crm_quotes`.
- Tabla `crm_document_changes` con RLS por `business_id`.

---

## Rama de trabajo

Desarrollar en: `claude/friendly-noether-ala5mx`
Push: `git push -u origin claude/friendly-noether-ala5mx`
No crear PR sin que el usuario lo solicite explícitamente.
