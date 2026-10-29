# Integración del motor criptográfico SII — trabajo en certificación

El módulo `scripts/sii/crypto-engine.mjs` ejecuta operaciones RSA sobre **bytes previamente canonicalizados**, sin inventar un formato XMLDSig o TED. Incluye inspección de vigencia de un certificado X.509, pero **no** sustituye validación de cadena de confianza, revocación, RUT del firmante ni poderes ante el SII.

## Flujo que se debe completar en el backend

1. Validar identidad del negocio y venta contra registros internos autorizados.
2. Reservar folio atómicamente y verificar firma de autorización del CAF.
3. Generar DD del TED con campos exactos del formato SII, preservar codificación y serialización requeridas.
4. Firmar DD con clave privada del CAF usando el algoritmo exigido por el SII; construir TED/FRMT.
5. Construir Documento/DTE/EnvioBOLETA con namespaces y orden exacto del XSD oficial.
6. Canonicalizar SignedInfo y referencias XMLDSig con una biblioteca XMLDSig madura, sin concatenar strings a mano; firmar con el certificado digital del contribuyente.
7. Verificar firmas y referencias, XSD, folio, montos, identidad y autorización antes de enviar.
8. Enviar a ambiente SII de certificación y persistir respuestas; conciliar estados desconocidos sin reemitir folios.

## Seguridad y límites

- **No** importar `scripts/sii/crypto-engine.mjs` en React/Vite. Ejecutar solo en un proceso Node backend protegido.
- **No** entregar certificados privados, claves CAF ni contraseñas al cliente; guardar cifrados en infraestructura de servidor con controles por RUT.
- El algoritmo SHA1 está disponible únicamente como primitiva de compatibilidad para pruebas del TED; no significa que cualquier uso de SHA1 sea aceptado por el SII.
- No se generan aún TED, XMLDSig ni XML enviables. Ningún certificado ni CAF real se ha procesado.
- No habilitar emisión ni cambiar la modalidad Mercado Pago hasta certificación.
