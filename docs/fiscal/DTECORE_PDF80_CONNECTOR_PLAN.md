# DTE Core PDF 80 mm → Walinka Print Connector (plan de integración, SIN emisión)

Estado: propuesta técnica aislada. **No activar emisión, no desplegar, no migrar producción.**

## Hallazgos verificados en código

- `tools/walinka-print-connector/ConnectorServer.cs` expone `POST /v1/print` con `DataBase64`, exige `Copies=1`, token de emparejamiento, origen permitido y clave de idempotencia.
- `PayloadPolicy.ValidatePayload` solo acepta ESC/POS, inicia con `ESC @`, valida comandos y limita a 256 KiB. Un PDF enviado a `/v1/print` es rechazado correctamente.
- `Spooler.SendRaw` usa Windows RAW; **no interpreta PDF**.
- `src/services/fiscalThermalPrintService.js` ya imprime desde XML auténtico verificado, con el renderizador ESC/POS y flag `VITE_FISCAL_THERMAL_PRINT=preview`.
- `api/fiscal/pdf.js` y `api/fiscal/download.js` leen el PDF guardado de `crm_fiscal_issuances`; no solicitan el formato 80 mm al proveedor.
- Manual DTE Core suministrado por el usuario: `GET /dte/documentos/39/{folio}/pdf?formatoPdf=80mm`, con autenticación server-side. **Confirmar disponibilidad en cuenta cliente, no asumir privilegios de revendedor.**

## Decisión de integración

1. **Conservar sin cambios `POST /v1/print` y sus defensas ESC/POS.** Nunca aceptar `%PDF-` en ese endpoint.
2. Implementar **un endpoint separado**, por ejemplo `POST /v1/print-pdf`, solo cuando se haya elegido y probado un motor de rasterización local seguro. Debe exigir los mismos controles de origen, token, impresora, idempotencia, rate limit y una sola copia.
3. Validar tamaño máximo de PDF, firma `%PDF-`, páginas, dimensiones, y limitar recursos antes de rasterizar. No usar `Process.Start`/ShellExecute ni abrir un visor de PDF externo silenciosamente. Prohibir URLs arbitrarias; el navegador solo entrega bytes ya obtenidos desde API autorizada.
4. Renderizar a 203 dpi (o dpi real configurado), ancho útil real de impresora y convertir a `GS v 0` / `ESC * 33` según compatibilidad. Reusar el validador ESC/POS y la ruta de impresión existente. No reescalar el PDF417 hasta hacerlo ilegible.
5. En backend, obtener PDF 80 mm **solo para folios `issued` del comercio autenticado**. Usar credencial del negocio exclusivamente en servidor, y confirmar que DTE Core soporta `formatoPdf=80mm` para esa cuenta. No llamar a `/emitir` durante reimpresión.
6. La ruta actual XML→ESC/POS queda como fallback **explícito**, no automático después de un fallo ambiguo de spooler: el cajero decide reimprimir.
7. Conservar copia/identificador del documento, registrar auditoría de impresión sin secretos ni PDF/XML, y distinguir `sent_to_spooler` de impresión física confirmada.
8. Mantener `VITE_FISCAL_THERMAL_PRINT` y cualquier nuevo flag PDF apagados por defecto. No modificar `FISCAL_PROVIDER` ni `VITE_FISCAL_EMIT_ENABLED`.

## Pruebas obligatorias antes de fusionar

- PDF válido de 80 mm; PDF truncado, cifrado, demasiado grande, malicioso o con varias páginas; impresora de ancho incorrecto.
- Sin token, origen no autorizado, impresora inexistente, reintento con misma clave y dos clics.
- El endpoint ESC/POS previo sigue rechazando PDF y comandos prohibidos (incluido cajón).
- Confirmar en Xprinter 80 mm: folio, totales, corte y lectura real del PDF417; comprobar que no se llama a emisión.
- Reimpresión desde PDF 80 mm de DTE Core ya emitido; fallo de red con estado desconocido no provoca reemisión.
- Probar impresión desde Windows y conector instalado. Tests unitarios no equivalen a impresión física.

## Bloqueo actual

No existe todavía rasterizador PDF local validado ni contrato confirmado para obtener PDF 80 mm con credenciales de cliente. **No activar el nuevo flujo hasta resolver ambos.** Mientras tanto, la ruta XML→ESC/POS existente es la opción de piloto sin nuevas emisiones.
