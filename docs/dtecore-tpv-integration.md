# DTECore DTE39 — integración con cierre TPV (fase segura)

## Punto exacto identificado
- UI: `src/pages/crm/CrmTerminal.jsx`, al resolver exitosamente `createPosInvoice` (alrededor de la línea 1337 de main).
- Servicio: `src/services/crmService.js:createPosInvoice`.
- Autoridad de la venta: RPC `public.crm_create_pos_sale` (migración `20260910220000_crm_pos_atomic_sale.sql`).
- La RPC recibe `p_idempotency_key`, crea venta y pagos de forma atómica, y puede devolver venta pendiente cuando el cobro no cubre el total.

## Flujo de emisión propuesto (NO activado)
1. En la misma transacción que confirma una venta **pagada**, registrar una tarea fiscal durable única por `(business_id, invoice_id, document_type=39)`. Si la venta queda pendiente, no emitir.
2. El servidor consume la tarea, comprueba dueño, RUT emisor, configuración del proveedor, importes, líneas y clasificación tributaria; bloquea la tarea de forma atómica.
3. Construir el payload desde los datos persistidos de la venta, no desde el carrito editable. `idBoletaOperacion` estable derivado de invoice_id.
4. Llamar a DTECore exclusivamente desde servidor y guardar folio, respuesta y estado. Si hay timeout, marcar resultado desconocido y **consultar al proveedor antes de reenviar**; no asumir que falló.
5. Recuperar PDF 80mm y asociarlo al ticket; error de impresión no vuelve a emitir DTE.
6. Mostrar estado fiscal no intrusivo. Mantener flujo Point sin emisión según decisión del negocio.

## Bloqueos de seguridad
- `DTECORE_ENABLE_EMISSION` apagado por defecto. No activarlo hasta probar idempotencia durable y simulación.
- La clave `X-Api-Key` se guarda solo en variables de entorno del servidor, nunca `VITE_*`.
- No usar el outbox específico de Mercado Pago Point.
- No deducir `esExento` de nombres de productos.
- No insertar un POST directo desde el navegador o desde el `setTicketData` de la UI.
- No confundir ticket comercial con boleta tributaria: registrar la venta no prueba emisión.

## Validación pendiente
- Confirmar columnas y estructura reales de `crm_invoice_items`, `crm_payments` y la RPC en producción.
- Diseñar claim/reconciliación y migración SQL revisable; luego pruebas de concurrencia y simulación.
- Ejecutar `vitest run api/sii/lib/dtecore39.test.js` en CI o entorno local antes de merge.
