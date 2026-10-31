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

## 4. Estado tras la revisión de producción (31-oct)

- Sucursal: no existe fuente en el esquema de producción. La emisión se rechaza con
  `SUCURSAL_NOT_CONFIGURED` antes de reclamar la venta. Los valores de ejemplo se eliminaron del código.
- Emisor (Bonita Casualidad, RUT 77804207-K): `enabled=false`, `verified=false` en producción.
- Precio bruto/neto: no hay campo de IVA en `crm_invoice_items`; no se puede determinar desde el código.
- La boleta 51106 corresponde a una venta de $100 (ítem "prueba", precio 100) del mismo comercio.
  Su XML no está guardado en producción; el propietario puede verificar `MntNeto`/`MntTotal` en el proveedor.
- Activación: `FISCAL_PROVIDER=siisolutions` en la función (no desplegada).

## 5. Estado final antes de autorizar (31-oct, 20:20)

Bloqueos reales en producción (verificado con SELECT):
- `fiscal.business_credentials`, `crm_fiscal_claim_with_credentials` y `crm_fiscal_save_credentials` no existen.
  Dependen de `20261101_fiscal_connection.sql` y `20261102_fiscal_provider_claim_guard.sql`, aún sin aplicar.
- `crm_fiscal_emission_context` de producción no devuelve sucursal. La versión con sucursal está en
  `proposed/20261031_issuer_sucursal_config.sql` (no aplicado).
- `fiscal.dte39_emission_control.enabled = false`.
- `fiscal.issuers` de Bonita Casualidad: `enabled=false`, `verified=false`, sin sucursal.
- Sin fuente de sucursal verificada. Valores del proveedor pendientes de confirmar.

Redondeo: `round(precio_bruto / 1.19)` puede producir un total distinto de un peso (p. ej. 999 -> neto 839).
El contrato no define cómo el proveedor redondea el IVA. Se verifica en el XML emitido (`MntTotal` = monto),
pero una boleta ya emitida no se puede deshacer. No se rechaza la venta por esto; se confirma antes.

Pasos mínimos, no ejecutados:
1. Autorizar la lectura del XML de la 51106 (`scratchpad/consulta-solo-lectura-51106.md`) y leer `Sucursal`.
2. Aplicar en producción, con autorización: 20261031_fiscal_single_ledger_guard, 20261101, 20261102 y
   20261031_issuer_sucursal_config (en ese orden).
3. Guardar la sucursal verificada en `fiscal.issuers` (sucursal_nombre, sucursal_codigo).
4. Pasar `emission_control.enabled` a true y `issuers.enabled/verified` a true solo en el momento de la prueba autorizada.
5. Desplegar `fiscal-emit` con `FISCAL_PROVIDER=siisolutions` y `FISCAL_MASTER_KEY`. Sin despliegue autorizado no se hace nada.
6. Crear la venta de $100 en efectivo y pulsar el botón una sola vez. Verificar XML y PDF.
7. Si el proveedor responde error de validación, copiar el texto exacto. Si el resultado es incierto, no repetir.
