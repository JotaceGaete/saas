# Mapa preliminar XML boleta 39 — XSD entregado por usuario

Origen: `schema_envio_bol (1).zip` inspeccionado, `EnvioBOLETA_v11.xsd`.
**No es una boleta emitida ni una validación tributaria.** El esquema histórico no compila sin cambios en lxml; antes de producción confirmar vigencia con SII.

## Sobre EnvioBOLETA/SetDTE

| Ruta | Significado en XSD | Procedencia prevista |
|---|---|---|
| Caratula/RutEmisor | RUT emisor de boletas | Perfil fiscal autorizado por empresa |
| Caratula/RutEnvia | RUT que envía | Identidad certificada autorizada |
| Caratula/RutReceptor | RUT receptor del envío | Configuración oficial del ambiente SII |
| Caratula/FchResol, NroResol | Resolución autorizante | Registro oficial por RUT |
| Caratula/TmstFirmaEnv | Fecha/hora de firma envío | Servicio de firma |
| Caratula/SubTotDTE/TpoDTE, NroDTE | Tipo y cantidad de boletas | Lote preparado |
| DTE | Documentos enviados | XML boletas firmadas |
| ds:Signature | Firma digital del sobre | Servicio de firma |

## Documento

| Ruta | Significado en XSD | Procedencia prevista |
|---|---|---|
| Encabezado/IdDoc/TipoDTE | Tipo de boleta | Constante 39 para este piloto |
| Encabezado/IdDoc/Folio | Folio fiscal | Reserva CAF por RUT |
| Encabezado/IdDoc/FchEmis | Fecha emisión | Operación fiscal |
| Encabezado/IdDoc/IndServicio | Indicador servicio | Determinar según venta y reglas vigentes |
| Encabezado/Emisor/RUTEmisor | RUT empresa | Perfil fiscal por empresa |
| Encabezado/Receptor/RUTRecep | RUT receptor | Según tipo de boleta/reglas SII; no inventar |
| Encabezado/Totales/MntTotal | Monto total | Snapshot de venta validado |
| Encabezado/Totales/MntNeto, IVA, MntExe | Componentes tributarios | Cálculo tributario revisado, no total TPV sin validación |
| Detalle/NroLinDet | Línea | Posición de línea |
| Detalle/NmbItem | Producto/servicio | Snapshot de línea |
| Detalle/MontoItem | Monto línea | Snapshot de línea y reglas de redondeo |
| Documento/TED/DD/CAF | CAF | Archivo autorizado del RUT y tipo 39 |
| Documento/TED/FRMT | Firma timbre | Motor criptográfico CAF |
| Documento/TmstFirma | Fecha firma | Servicio de firma |

El XSD contiene elementos adicionales y restricciones condicionales. La presencia de un elemento en el esquema **no prueba** que deba completarse siempre. No asumir obligatoriedad de RUT del consumidor, impuesto o monto neto sin norma aplicable.

## Inventario reproducible
```bash
python scripts/sii/inventory-boleta-xsd.py "schema_envio_bol (1).zip"
python scripts/sii/inventory-boleta-xsd.py "schema_envio_bol (1).zip" --json
```

## Bloqueos para el generador
1. Confirmar esquema y reglas actuales con SII (el ZIP entregado es histórico y contiene restricciones XSD inválidas para lxml).
2. Obtener snapshot real de venta/cobro, congelado y bloqueado; revisar schema real de Walinka.
3. Definir impuestos, exenciones, descuentos y redondeos por línea, con casos de prueba.
4. Custodiar certificado y CAF por RUT; implementar firmas y timbre según especificación vigente.
5. Validar sobre, firma, envío, respuestas y trazabilidad antes de activar TPV.
