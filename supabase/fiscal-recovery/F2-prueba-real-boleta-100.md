# Prueba real controlada: boleta de $100 CLP desde el TPV

Estado: **NO EJECUTADA**. Requiere autorización explícita del propietario.

## 1. Resultado de la simulación (sin red real)

Ejecutado con `npm run test:unit` en `supabase/functions/fiscal-emit`: 176/176 pasan.
Incluye el flujo completo TPV -> emisor -> adaptador HTTP -> servidor local que replica
las respuestas documentadas (200, 400, 500) y verifica:

- folio, XML base64 y PDF base64 guardados en el ledger;
- payload con `folio: null`, `montoPago` como texto, `total` numérico, `vuelto: "0"`;
- cabecera `X-Api-Key` (sin login JWT);
- una segunda emisión de la misma venta no vuelve a llamar al proveedor;
- 400 de validación -> `failed` sin folio; 500 -> `unknown`; ambos con una sola llamada.

## 2. Qué falta antes de la prueba real (bloqueos)

1. **Precio neto vs. bruto (crítico).** El ejemplo oficial muestra `precio: 10000` con
   `total: 11900` (IVA 19 %). El emisor asume que el precio del TPV es bruto y envía
   `precio` neto = round(bruto / 1.19). Si el TPV ya guarda netos, los importes se
   inflan un 19 %. Confirmar antes de emitir.
2. **Sucursal y cliente.** Se usan los valores del ejemplo (`CASA MATRIZ` / `0`,
   cliente `66666666-6` "Consumidor final"). Confirmar los valores reales del negocio.
3. **Adaptador no conectado a la función desplegada.** `fiscal-emit` sigue usando el
   proveedor bloqueado (`ready: false`). Activarlo requiere cambiar `app.ts`, desplegar
   la función y poner `VITE_FISCAL_EMIT_ENABLED=true`. Nada de eso se ha hecho.
4. **URL base.** La colección trae `https://https://api.siisolutions.cl`. Usar
   `https://api.siisolutions.cl` tras confirmarla.
5. **Idempotencia.** No documentada: qué pasa si `idBoletaOperacion` se repite.

## 3. Procedimiento exacto (cuando se autorice)

1. Crear una venta de prueba en el TPV: 1 línea "Prueba integración", precio 100,
   cantidad 1, categoría IVA_AFECTO_19, pagada en efectivo (EF). Total $100.
2. Con la función todavía apagada, confirmar el payload generado (sin enviarlo) y que
   `precio = 84`, `precioSubtotal = 100`, `total = 100`.
3. Autorizar explícitamente el envío. Pulsar **una sola vez** "Emitir boleta electrónica".
4. Resultado esperado: `issued`, folio asignado, XML y PDF guardados.
5. Verificar el XML: `MntNeto` 84, `IVA` 16, `MntTotal` 100. Si no coincide, **no
   emitir más** y reportar.
6. Abrir y imprimir el PDF desde la venta.

Reglas de la prueba:
- Error de validación (400): copiar el texto exacto de `error` y corregir el payload. No reintentar la misma venta sin corregir.
- Resultado incierto (timeout, 5xx, 401, red): **no repetir**. El botón queda bloqueado; resolver por reconciliación.
- Un único intento real. Cualquier otro requiere nueva autorización.
