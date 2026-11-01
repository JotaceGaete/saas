# Representación impresa de la boleta electrónica (DTE 39) en 80 mm

Estado: **en prueba. No es una representación oficial todavía.** Mientras no se complete la validación de la sección 4, cada ticket sale rotulado `PRUEBA DE IMPRESION - NO OFICIAL` y la función queda apagada salvo `VITE_FISCAL_THERMAL_PRINT=preview`.

## 1. Reparto de responsabilidades

| Quién | Qué hace |
|---|---|
| DTE Core | Emite el DTE, asigna el folio del CAF, firma el XML y el timbre (TED) y lo envía al SII. |
| Walinka | Lee el XML ya emitido, comprueba que el timbre corresponde al documento y genera su propia representación térmica, con el PDF417 del TED. No emite, no firma y no cambia el estado fiscal. |
| Impresión | Walinka Print Connector (o QZ Tray) hacia la Star TSP100, en ESC/POS. |

## 2. Flujo

1. `/api/fiscal/download?format=xml` (solo lectura, con guarda de dueño) entrega el XML guardado en `crm_fiscal_issuances`.
2. `decodeDteBytes` decodifica en ISO-8859-1, que es la codificación declarada por los DTE.
3. `parseDteXml` lee el documento y falla cerrado si no hay coherencia interna:
   - el timbre (RE, TD, F, FE, MNT) coincide con el encabezado;
   - el folio está dentro del rango del CAF;
   - se cumple neto + IVA + exento = total;
   - hay un solo TED y el XML no trae DOCTYPE.
4. `verifyTedSignature` verifica la firma FRMT del timbre con la clave pública del CAF (RSA-SHA1, implementado con BigInt). Si la firma no es válida, no se imprime.
5. `encodeTedPdf417` codifica el TED completo (sin espacios entre etiquetas, ISO-8859-1) en PDF417 con nivel de corrección 5 y 12 columnas de datos.
6. `buildBoletaReceipt` arma el ticket solo con datos del XML. Nada se recalcula desde la venta del TPV.
7. `renderEscPosReceipt` genera el ESC/POS, que se envía por la ruta de impresión configurada (`buildPrintTarget`).

Reimprimir repite los pasos 1 a 7. Nunca llama al proveedor.

## 3. Contenido del ticket

Encabezado: nombre de fantasía (opcional), razón social, RUT, giro, dirección, comuna y sucursal si existe. Recuadro: "BOLETA ELECTRONICA", folio y "S.I.I. - <unidad>" si se configura. Cuerpo: fecha de emisión, detalle, neto, IVA y total. Pie: timbre PDF417, "Timbre Electronico SII", "Res. <N> de <AAAA>" y "Verifique documento: www.sii.cl".

Los textos van sin tildes porque el renderer no selecciona página de códigos. El TED dentro del PDF417 sí conserva los caracteres ISO-8859-1 originales.

## 4. Validación de cumplimiento pendiente (condición para uso oficial)

| # | Requisito | Fuente | Estado |
|---|---|---|---|
| 1 | Timbre en PDF417 con el TED | SII, manual de muestras impresas, secciones 1.1 y 1.5 | Implementado. Se verificó con un lector PDF417 independiente (ZXing) sobre el TED real de 51105 y 51106. |
| 2 | Tamaño del timbre: mínimo 2 x 4,5 cm (boletas); máximo 4 x 9 cm | SII, preguntas frecuentes de boleta electrónica (001_380_6277); manual de muestras impresas | Calculado: unos 68 x 31 mm a 203 dpi. **Falta medirlo impreso.** |
| 3 | Timbre impreso a más de 200 dpi | SII, preguntas frecuentes (001_380_6277) | Variantes A (GS v 0) y B (ESC * 33) apuntan a 203 dpi. **Ninguna validada en la TSP100.** La variante C (ESC * 0, la que usa hoy el logo) imprime a unos 101 x 69 dpi y **no cumple**. |
| 4 | Papel de al menos 5,7 cm de ancho | SII, preguntas frecuentes (001_380_6277) | 80 mm. Cumple. |
| 5 | Leyendas "Timbre Electrónico SII", "Res. N de AAAA" y "Verifique documento: www.sii.cl" bajo el timbre | SII, manual de muestras impresas, sección 1.5 | Implementado. **Falta el número y año reales de la resolución del emisor** (pedírselos a DTE Core o revisarlos en el SII). |
| 6 | Margen en blanco alrededor del timbre | Manual de muestras impresas | Hay zona de silencio lateral de unos 2 mm y líneas en blanco arriba y abajo. Falta confirmarlo impreso. |
| 7 | Elementos obligatorios específicos de la boleta (recuadro, unidad del SII, IVA, etc.) | El SII indica que el manual de muestras de boletas "estará pronto disponible" | **No verificado.** Revisar con el contador o con DTE Core la resolución vigente de boletas. |
| 8 | Lectura del timbre impreso con un lector y en sii.cl | Prueba física | **Pendiente.** |
| 9 | Aceptación del documento por el SII | Portal de DTE Core | 51104, 51105 y 51106 siguen en estado REC al 1-11-2026. Es independiente de la impresión. |

Fuentes:
- https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_6277.htm
- https://www.sii.cl/factura_electronica/manual_muestras_impresas.pdf

## 5. Prueba física en la Star TSP100

1. Activar `VITE_FISCAL_THERMAL_PRINT=preview` en un entorno de prueba y abrir la nota de venta de una boleta emitida.
2. Pulsar **Diagnóstico del timbre**. Se imprime el mismo timbre en tres variantes:
   - **A**: GS v 0 a 203 dpi. En pruebas anteriores, con la impresora en otro modo, se imprimió como texto. Hay que repetir la prueba en modo ESC/POS.
   - **B**: ESC * 33, en franjas de 24 dots a 203 dpi.
   - **C**: ESC * 0, la ruta del logo. Sirve solo como referencia; no cumple el requisito de dpi.
3. Para cada variante, anotar:
   - ancho y alto medidos con regla, comparados con los "Esperado" impresos;
   - si hay franjas blancas o desplazadas;
   - si una app lectora de PDF417 devuelve un texto que empieza por `<TED version="1.0">` y contiene el folio.
4. Elegir la variante que cumpla el tamaño, se lea y sea de 203 dpi. Dejarla como `DEFAULT_TIMBRE_STRATEGY_ID`.
5. Pulsar **Imprimir ticket de prueba** con la resolución real y revisar el ticket completo con el contador.

## 6. Pendiente después de validar

- Guardar la resolución del SII, la unidad regional y el nombre de fantasía en la configuración fiscal del comercio, en lugar del campo de prueba.
- Quitar el rótulo de prueba, solo después de la validación de la sección 4.
- Descargar y enviar de forma digital la representación generada por Walinka (PDF propio o imagen) con el mismo contenido.
- Imprimir automáticamente tras una emisión exitosa, cuando exista el emisor desde la interfaz.
