# Integración TPV / boleta electrónica — hallazgo de código

## Punto de entrada real
- `src/pages/crm/CrmTerminal.jsx` registra una venta llamando `createPosInvoice(business.id, { items: cart, payments: appliedPayments, idempotencyKey })`.
- `src/services/crmService.js` llama la RPC `crm_create_pos_sale` con `p_payments`.
- En el TPV, `mercado_pago` es actualmente una opción de `PAYMENT_METHODS`. La ruta examinada no aporta prueba de aprobación de Point.
- No debe emitirse DTE 39 simplemente por encontrar `payment_method = mercado_pago` en una venta.

## Contrato para conectar el cobro
1. Efectivo: cajero autenticado confirma recepción; backend persiste venta y pago recibido. Solo entonces se prepara la emisión.
2. Tarjeta: backend crea orden Point para el comercio y el importe. El terminal espera; **no** registra la venta como pagada por seleccionar el medio.
3. Backend verifica con Mercado Pago el pago aprobado, monto, moneda, terminal, comercio y correlación con la venta. Los webhooks no se aceptan como prueba por sí solos: se consulta el estado oficial.
4. Backend marca el pago como recibido una sola vez y registra la venta usando una clave idempotente. Luego inicia el mismo emisor DTE 39 que efectivo.
5. El emisor reserva la operación en `crm_fiscal_issuances` antes de contactar al proveedor. Ante timeout, estado `unknown` y conciliación manual; nunca reintento automático.
6. Solo el PDF tributario auténtico emitido por el proveedor se imprime en la Star 80 mm. No inventar folio ni timbre.
7. Si Point aprueba y SII Solutions falla, **no repetir el cobro**. Mantener pago confirmado y emisión pendiente de conciliación.

## Pendientes técnicos antes de activar
- Localizar el servicio/Edge Function real de Point y su webhook/consulta de pagos; los paths `api/mp-point-create-order.js` y `supabase/functions/mp-point-create-order/index.ts` no existen en esta rama.
- Verificar esquema real de `crm_create_pos_sale`, `crm_invoices` y `crm_payments`, incluidos estados y claves de conciliación.
- Implementar persistencia confiable de cobros Point (pago aprobado y no registrado todavía), y transición atómica al estado pagado.
- Confirmar entorno de prueba del proveedor SII Solutions: el endpoint configurado apunta a la API real y el valor local `simulation` no convierte una emisión real en simulación.
- Aplicar migración solo tras revisión, correr pruebas y habilitar por comercio piloto.

**Producción permanece deshabilitada.**
