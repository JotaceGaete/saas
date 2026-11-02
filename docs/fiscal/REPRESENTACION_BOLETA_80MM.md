# Representación impresa de la boleta electrónica (DTE 39) en 80 mm

Estado: **en prueba física (Xprinter, 80 mm).** La función queda apagada salvo `VITE_FISCAL_THERMAL_PRINT=preview`. Cada ticket sale rotulado como **REIMPRESION** de un documento ya emitido (arriba: "REIMPRESION / Documento emitido el DD-MM-AAAA / No corresponde a una nueva emision"; abajo: "REIMPRESION BOLETA N - NO ES NUEVA EMISION"), para que no se confunda con una emisión nueva.

## 1. Reparto de responsabilidades

| Quién | Qué hace |
|---|---|
| DTE Core | Emite el DTE, asigna el folio del CAF, firma el XML y el timbre (TED) y lo envía al SII. |
| Walinka | Lee el XML ya emitido, comprueba que el timbre corresponde al documento y genera su propia representación térmica, con el PDF417 del TED. No emite, no firma y no cambia el estado fiscal. |
| Impresión | Walinka Print Connector (o QZ Tray) hacia la impresora térmica de 80 mm (hoy una Xprinter), en ESC/POS. Es independiente del proceso de emisión: reimprimir nunca llama a DTE Core ni toca `crm_fiscal_issuances`. |

## 2. Flujo

1. El XML llega por una de dos vías, ambas de solo lectura:
   - desde la nota de venta: `/api/fiscal/download?format=xml` (con guarda de dueño) entrega el XML guardado en `crm_fiscal_issuances`;
   - desde `/crm/impresion`: el usuario elige el archivo XML (p. ej. `DTE_39_51106.xml` descargado del portal). No se consulta la base de datos.
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
| 3 | Timbre impreso a más de 200 dpi | SII, preguntas frecuentes (001_380_6277) | Las variantes A, B y C apuntan a 203 dpi. **Ninguna validada en papel todavía (Xprinter).** La ruta `ESC *` m=0 del logo imprimía a unos 101 x 69 dpi en la Star y **no cumple**; ya no se ofrece. |
| 4 | Papel de al menos 5,7 cm de ancho | SII, preguntas frecuentes (001_380_6277) | 80 mm. Cumple. |
| 5 | Leyendas "Timbre Electrónico SII", "Res. N de AAAA" y "Verifique documento: www.sii.cl" bajo el timbre | SII, manual de muestras impresas, sección 1.5 | Implementado. **Falta el número y año reales de la resolución del emisor** (pedírselos a DTE Core o revisarlos en el SII). |
| 6 | Margen en blanco alrededor del timbre | Manual de muestras impresas | Hay zona de silencio lateral de unos 2 mm y líneas en blanco arriba y abajo. Falta confirmarlo impreso. |
| 7 | Elementos obligatorios específicos de la boleta (recuadro, unidad del SII, IVA, etc.) | El SII indica que el manual de muestras de boletas "estará pronto disponible" | **No verificado.** Revisar con el contador o con DTE Core la resolución vigente de boletas. |
| 8 | Lectura del timbre impreso con un lector y en sii.cl | Prueba física | **Pendiente.** |
| 9 | Aceptación del documento por el SII | Portal de DTE Core | 51104, 51105 y 51106 aceptadas por el SII (informado por Juan el 2-11-2026). Es independiente de la impresión. |

Fuentes:
- https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_6277.htm
- https://www.sii.cl/factura_electronica/manual_muestras_impresas.pdf

## 5. Prueba física en la Xprinter

### Modos del timbre

Los tres modos cumplen más de 200 dpi (203 dpi, módulo de 2 dots y filas de 5 dots). El Print Connector ya acepta `GS v 0` y `ESC * 33` sin cambios.

| Variante | Comando | Columnas PDF417 | Tamaño | Cuándo usarla |
|---|---|---|---|---|
| A | `GS v 0` raster | 12 | 546 dots, 68,3 x 31,3 mm | Por defecto. Necesita 72 mm imprimibles (576 dots), lo normal en Xprinter de 80 mm. |
| B | `ESC * 33`, franjas de 24 dots | 12 | 546 dots, 68,3 x 31,3 mm | Si A sale como basura o no imprime. |
| C | `GS v 0` raster | 10 | 478 dots, 59,8 x 37,5 mm | Si A o B salen cortados a la derecha (cabezal configurado a 64 mm / 512 dots). |

Con el XML real de la 51106, los tres modos se generaron, pasaron por una copia del validador del conector y la imagen extraída de los bytes ESC/POS se decodificó (ZXing) al TED exacto. La reimpresión completa pesa unos 18 KB (límite del conector: 256 KB).

### Pasos

1. **Preparar la Xprinter en Windows.**
   - Driver de Xprinter instalado y la cola visible en "Impresoras y escáneres".
   - Papel de 80 mm y ancho de impresión de 72 mm (576 dots), si el driver o la herramienta de Xprinter lo permiten.
   - Walinka Print Connector en ejecución.
2. **Abrir Walinka** en el entorno de prueba (Preview de este PR, o `npm run dev` con `VITE_FISCAL_THERMAL_PRINT=preview` en `.env.local`) e iniciar sesión.
3. En **/crm/impresion**, elegir la Xprinter y pulsar el ticket de prueba normal para confirmar que el conector imprime.
4. Bajar al recuadro ámbar **"Reimpresión térmica 80 mm de una boleta emitida (prueba)"** y elegir el archivo `DTE_39_51106.xml`.
5. Pulsar **1. Diagnóstico del timbre**. Sale el mismo timbre en A, B y C. Para cada uno, anotar:
   - ancho y alto con regla, comparados con el "Esperado" impreso;
   - si sale cortado, con franjas blancas o desplazado;
   - si una app lectora de PDF417 devuelve un texto que empieza por `<TED version="1.0">` y contiene `<F>51106</F>`.
6. Elegir en **Modo del timbre** la primera variante que se lea completa, escribir el número y año de la resolución del SII y pulsar **2. Reimprimir boleta**.
7. Revisar el ticket completo: razón social, RUT, giro, dirección, folio, fecha, detalle, neto, IVA, total, timbre y leyendas.

Criterio de éxito: la boleta 51106 impresa en 80 mm con todos los datos correctos y un PDF417 que una app lectora decodifique como el TED.

## 6. Pendiente después de validar

- Guardar la resolución del SII, la unidad regional y el nombre de fantasía en la configuración fiscal del comercio, en lugar del campo de prueba.
- Definir con el contador si la copia entregada al cliente lleva el rótulo de reimpresión o no (la impresión inmediata tras la emisión no es una reimpresión).
- Si se conoce el modelo exacto de la Xprinter, agregar un preset por nombre de cola en `printerCompatibilityProfiles.js` con la variante validada.
- Descargar y enviar de forma digital la representación generada por Walinka (PDF propio o imagen) con el mismo contenido.
- Imprimir automáticamente tras una emisión exitosa, cuando exista el emisor desde la interfaz.
