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
6. Mostrar estado fiscal no intrusivo. Incluir ventas Point aprobadas en emisión, al igual que cualquier otro medio de cobro.

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

## Decisión de producto: fiscalidad independiente del terminal de pago
- Toda venta fiscalmente completada en Walinka debe tener exactamente un documento tributario correspondiente. Predeterminado: boleta electrónica DTE39.
- Mercado Pago Point, Haulmer y futuros terminales son **solo adquirentes/medios de cobro**. Nunca son la autoridad fiscal ni deben emitir un documento tributario paralelo dentro del flujo Walinka.
- Cobros Point: esperar confirmación definitiva y venta persistida antes de emitir. Un cobro rechazado, pendiente o cancelado no dispara DTE.
- Futuro: selector de documento solicitado **antes de confirmar la venta**: boleta DTE39 o factura electrónica DTE33. Una factura reemplaza a la boleta de esa venta; no emitir ambas. Capturar y validar los datos fiscales del receptor para factura.
- Mantener modelo de emisión agnóstico al medio de pago, con tipo de documento y datos del receptor separados de transacciones de cobro. Ajustar el outbox actualmente limitado a DTE39 cuando se implemente DTE33; no activar DTE33 en esta etapa.
- Devoluciones, anulaciones y correcciones deberán tramitarse mediante documentos tributarios apropiados y trazabilidad; nunca borrar una emisión ya realizada.
- Fase actual: terminar DTE39 con pruebas de idempotencia, simulación y recuperación ante respuestas desconocidas. La emisión real continúa desactivada.
