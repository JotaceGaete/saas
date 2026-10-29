# Puerta de conformidad DTE 39 — documentación SII

Fecha de consulta: 2026-10-28.

## Fuentes primarias
- Formato Boletas Electrónicas de Ventas y Servicios, versión 3.0 (2022-12-28): https://www.sii.cl/factura_electronica/factura_mercado/formato_boletas_elec_20221228_v3.pdf
- Formato XML de Boletas Electrónicas: https://www.sii.cl/servicios_online/1039-formato_xml-1184.html
- Instructivo técnico de boleta electrónica: https://www.sii.cl/servicios_online/3532-instructivo_tecnico_be-3811.html
- Instructivo de certificación: https://www.sii.cl/servicios_online/1039-guia_emitir_boleta_servicio-1184.html
- Resolución 74/2020, anexo técnico: https://www.sii.cl/normativa_legislacion/resoluciones/2020/reso74.pdf

## Estado real
Los cinco casos de `Set Prueba BE.txt` están transcritos a fixtures, con sumas brutas y referencias `CodRef=SET`, `RazonRef=CASO-N`. Las previsualizaciones son XML **NO DTE**, no firmadas, no timbradas y no transmitibles.

## Bloqueos explícitos para emitir
1. Obtener y conservar versión/hashes del ZIP XSD descargado directamente del SII; verificar que el esquema sea compilable por el validador elegido. El ZIP anterior, con `EnvioBOLETA_v11.xsd`, falla en lxml por restricciones incompatibles; no alterar el original ni reportar validación ficticia.
2. Mapear cada campo obligatorio/condicional del formato 3.0 y verificar `IndServicio`, `IndExe`, `QtyItem`, `UnmdItem`, `PrcItem`, `MontoItem`, `Referencia`, `Totales`, `TED` y `Signature` contra el formato aplicable.
3. Confirmar el algoritmo y los redondeos de IVA para precios con impuesto incluido, especialmente el caso 4 (12.720 afectos + 2.000 exentos).
4. Preparar RUT, resolución y CAF del contribuyente autorizado **solo en almacén privado**, nunca en fixtures ni Git.
5. Implementar TED, firma XML, sobre, autenticación y consulta de estado con pruebas aisladas y trazabilidad.
6. Completar procedimiento de certificación de boletas y obtener aprobación del SII antes de habilitar emisión.

## Regla de seguridad
**No hay equivalencia entre prueba unitaria verde y DTE certificado.** Mantener `fiscalEligible=false`, `siiValidated=false`, `transmittable=false` hasta demostrar conformidad y aprobación aplicables.
