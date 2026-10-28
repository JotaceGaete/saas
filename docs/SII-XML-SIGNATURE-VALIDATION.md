# SII: verificación XML y firma (solo certificación)

Este comando **no emite, no firma ni envía** boletas. Rechaza un archivo salvo que pase:
1. Reglas básicas defensivas (sin DTD/entidades, TED y Signature presentes, TipoDTE 39).
2. Validación XSD real mediante `xmllint --nonet` y el **bundle oficial de esquemas de boletas** descargado del SII.
3. Verificación criptográfica XMLDSig mediante `xmlsec1` contra el certificado público del firmante autorizado.

Documentación oficial:
- https://www.sii.cl/servicios_online/1039-formato_xml-1184.html
- https://www.sii.cl/factura_electronica/factura_mercado/formato_boleta_electronica.pdf
- https://www.sii.cl/servicios_online/3532-instructivo_tecnico_be-3811.html

## Ejecutar (Linux / WSL)

Instalar localmente `libxml2-utils` (xmllint) y `xmlsec1`. Descargar y descomprimir los XSD oficiales de **boletas**, conservar sus importaciones locales y escoger el esquema raíz correspondiente al tipo de XML que se valida (boleta individual o envío). No confundir con el esquema general de facturas.

```bash
node scripts/sii/verify-boleta.mjs \
  --xml /ruta/boleta-firmada.xml \
  --xsd /ruta/xsd-oficial/esquema-raiz.xsd \
  --cert /ruta/certificado-publico-firmante.pem
```

No subir a GitHub CAF reales, certificados privados, PFX/P12 ni contraseñas.

## Advertencias críticas

- **No confundir** verificación de XMLDSig con generación de la firma. La firma debe generarse en backend usando certificado vigente, autorizado y llave privada protegida; jamás en React.
- XMLDSig puede tener varios nodos `Signature` (documento y envío); verificar **cada firma aplicable**, su URI/ID y certificado, y bloquear wrapping attacks. El comando actual verifica una firma, por lo que **no basta para autorizar un envío**.
- **No basta** validar XSD y XMLDSig: también hay que verificar CAF y firma de su autorización, TED/FRMT, folio disponible, reglas tributarias, autorizaciones del RUT y recepción/aceptación SII.
- El atributo ID registrado con `--id-attr:ID Documento` debe revisarse contra el esquema oficial y las referencias de firma antes de declarar la verificación como completa.
- El certificado suministrado debe obtenerse de una fuente confiable y su vigencia, revocación y autorización deben comprobarse independientemente. El certificado incluido en XML no es automáticamente confiable.
- No modificar modalidad de emisión de Mercado Pago ni desplegar el módulo a producción durante estas pruebas.
