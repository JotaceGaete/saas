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

## Rama de trabajo

Desarrollar en: `claude/friendly-noether-ala5mx`
Push: `git push -u origin claude/friendly-noether-ala5mx`
No crear PR sin que el usuario lo solicite explícitamente.
