# Contrato DTE Core Solutions: qué está verificado y qué falta confirmar (A5)

Fecha: 2026-11-05. Fuentes: la colección Postman oficial de DTE Core (292 solicitudes, solo 16 con
respuesta de ejemplo), su LEEME, los XML 51105/51106 aceptados por el SII y el código que emitió la
51106. **No se hizo ninguna llamada a DTE Core** para preparar este documento.
`/public/openapi.json` no se pudo leer (el proxy del entorno responde 403), así que no hay especificación
OpenAPI que contraste lo que sigue.

Leyenda: **Verificado** = hay evidencia en la colección, en un XML aceptado o en una emisión real.
**No verificado** = el endpoint existe en la colección, pero sin respuesta documentada, o no aparece.
Ningún punto "No verificado" se usa para habilitar emisión.

## 1. Relación cuenta – API key – RUT

| Punto | Estado | Evidencia |
|---|---|---|
| Una cuenta ("tenant") por empresa, con su API key, certificado y CAF | Verificado (estructura) | Carpetas TenantApiKey, DteCertificados y DteCaf; `GET /tenant/api-key`, `POST /tenant/api-key/regenerate`. |
| La API key autentica con el encabezado `X-Api-Key` | Verificado | LEEME y la emisión de la 51106. |
| Una API key pertenece a **un solo RUT** | **No verificado** | No hay respuesta documentada que asocie la key a un RUT. |
| Cuentas "holding" (varias empresas) | Existe, sin contrato | `GET /auth/holding/empresas`, `POST /auth/holding/cambiar-empresa` (con tenantId) usan token de usuario, no API key. **Confirmar si una API key de holding puede emitir por varias empresas.** Si puede, la verificación credencial↔RUT de Walinka tiene que fijar también la empresa activa. |
| Regenerar la key invalida la anterior | **No verificado** | Solo existe el endpoint. |

## 2. Identidad del emisor con endpoints de solo lectura (C1)

Candidatos en la colección, **todos sin respuesta de ejemplo**:
`GET /tenant/profile`, `GET /tenant/profile/mis-datos`, `GET /tenant/config`, `GET /dte/emisor/estado`,
`GET /admin/datos-empresa`, `POST /auth/api-key/login`.

Estado: **No verificado.** No se sabe cuál devuelve el RUT del tenant, con qué campo ni con qué formato.
Por eso:

- `lib/providers/siisolutions-http.mjs` declara `identityContractVerified: false` y su `verifyIdentity`
  lanza `ContractNotVerifiedError` sin llamar a la red.
- `verifyIssuerIdentity` (lib/emit.mjs) responde `IDENTITY_CONTRACT_PENDING` sin registrar nada.
- La base (migración H) exige, para pasar a `sending`, una verificación vigente con un método aceptado
  en `fiscal.dte39_emission_control.identity_methods_accepted`, que nace **vacío**.

**Resultado: con H aplicada, ningún comercio puede emitir hasta que se decida un método.**

Para habilitar `provider_api` hace falta, por escrito de DTE Core:
1. Qué endpoint de solo lectura devuelve el RUT del tenant dueño de la API key.
2. El campo exacto y el formato (con o sin puntos, con dígito verificador).
3. Que ese endpoint no tiene efectos (no consume folios, no cambia la empresa activa).
4. Su comportamiento con una key de holding.

Alternativa que **decide Walinka**, no el código: aceptar `manual_admin` (un administrador constata en
el panel de DTE Core que la cuenta dueña de la key tiene el RUT del comercio y deja la evidencia). Es
más débil que una consulta automática y depende de un procedimiento humano.

## 3. Idempotencia de `idBoletaOperacion`

| Punto | Estado | Evidencia |
|---|---|---|
| Campo `idBoletaOperacion` en la emisión de boleta | Verificado | Cuerpo de la 51106. |
| Repetir el mismo `idBoletaOperacion` devuelve 409 con `folioExistente` | **No verificado en la cuenta** | Referencia del proveedor "si la validación de operación está activa". **Confirmar que la opción esté activa en cada cuenta.** |
| Repetirlo nunca emite un segundo documento | **No verificado** | Walinka no depende de esto: `unknown` nunca se reenvía. |
| Alcance de la unicidad (¿por tenant? ¿global?) | **No verificado** | Walinka usa `WLK-<negocio>-<venta>`, único por diseño. |
| La nota de crédito usa `idOperacion` (otro nombre) | Verificado | Ejemplo de `POST /dte/notas-credito/emitir`. Su idempotencia no está documentada. |

## 4. Consulta de operaciones

`GET /dte/operaciones/{codigoDte}/{idOperacion}`: existe, **sin respuesta de ejemplo**. El lector
(`parseOperationLookup`) es conservador: ante cualquier duda da "indeterminado", y un 404 no prueba que
no se emitió. **Confirmar** el formato de respuesta, los estados posibles y si un 404 significa "nunca
recibida".

## 5. Recuperación de XML y PDF

| Punto | Estado | Evidencia |
|---|---|---|
| La emisión devuelve `folio`, `esSimulacion`, `xmlBase64`, `pdfBase64`, `pdfEstado`, `documentos.{pdf,pdfEstado,xml,envioXml}` | Verificado | 16 respuestas de ejemplo (boleta, NC, ND...) y la 51106. |
| `GET /dte/documentos/{tipo}/{folio}/xml` y `/pdf` | Existen, sin ejemplo | El adaptador los usa solo si faltan los base64 inline, y valida el XML (tipo, folio, RUT emisor, total). |
| `xmlBase64` del ejemplo es solo `<?xml ...?>` | Verificado (ejemplo incompleto) | No sirve como fixture del contenido. |

## 6. Estados de envío al SII

`GET /dte/emitidos/{tipo}/{folio}/envio-sii`, `GET /dte/sii/estado-envio/{trackId}` y
`GET /dte/sii/consulta-dte/{tipo}/{folio}`: existen, **sin respuesta de ejemplo**. `mapSiiStatus` solo
acepta textos exactos y deja todo lo demás como `unverified`. **Confirmar** los valores posibles y cuál
endpoint es la fuente de verdad del estado SII de una boleta.

## 7. Certificados, CAF y folios

| Punto | Estado | Evidencia |
|---|---|---|
| Certificado y CAF por cuenta | Verificado (estructura) | `/dte/certificados*`, `/dte/caf*`, `/dte/boletas/folios/resumen?codigoDte=39`. |
| El folio lo asigna DTE Core desde el CAF de la cuenta | Verificado | La emisión no envía folio (`"folio": null` en los ejemplos). |
| Sin folios disponibles → 400 | Verificado | Ejemplo 400 "No hay folios disponibles ... Sube un CAF." (el ejemplo de NC dice "tipo de DTE 33": el texto del ejemplo es inexacto). |
| DTE Core nunca reasigna un folio ya usado | **No verificado** | Walinka lo protege igual: `fiscal.document_folios` rechaza un folio repetido del mismo RUT y tipo (`FISCAL_FOLIO_DUPLICATE`). |
| Anulación de folios no usados | Existe, sin contrato | `/dte/anulacion-folios/*`. No se usa. |

## 8. Límites y errores

| Código | Estado | Significado (LEEME) | Tratamiento en Walinka |
|---|---|---|---|
| 400 | Verificado (ejemplos) | Validación / sin folios | `failed` solo si el cuerpo es un rechazo explícito; si no, `unknown`. |
| 401 | Verificado (ejemplo `{"error":"Credenciales inválidas"}`) | Sin autenticación | `unknown` (no se sabe si llegó a emitir). |
| 402 | Documentado en LEEME | Servicio suspendido | `unknown`. |
| 403 | Documentado en LEEME (`PERMISO_PANTALLA`) | Sin permiso | `unknown`. |
| 409 | Referencia del proveedor | Operación repetida (`folioExistente`) | `unknown` con el folio como pista. |
| Límite de solicitudes / cuota | **No documentado** | — | **Confirmar** límites por minuto y por cuenta, y el código que se devuelve. |
| `traceId` en errores | Verificado | Ejemplos 400 | Útil para soporte. |

## 9. Independencia entre emisores

| Punto | Estado |
|---|---|
| Cada cuenta tiene su certificado, su CAF y sus folios | Verificado (estructura). |
| Una API key no puede emitir por otro tenant | **No verificado**: es el punto 1 y depende de la respuesta sobre holding. |
| Walinka nunca usa la key de un comercio para otro | Verificado en Walinka: credencial cifrada con el id del negocio como dato asociado, leída dentro del reclamo del mismo negocio; pruebas `test/db/lab-multiempresa.db.test.mjs`. |
| El XML devuelto declara el RUT del comercio | Verificado en Walinka (el adaptador y el trigger de la migración H rechazan un `<RUTEmisor>` distinto). |

## Preguntas para DTE Core Solutions (por escrito)

1. ¿Qué endpoint de solo lectura devuelve el RUT del tenant dueño de una API key? ¿Campo y formato? ¿Es libre de efectos?
2. ¿Una API key pertenece siempre a un único RUT? ¿Qué pasa con las cuentas holding: una key puede emitir por varias empresas o por la "empresa activa"?
3. ¿La validación de operación (`idBoletaOperacion` repetido → 409 `folioExistente`) está activa en nuestras cuentas? ¿Es por tenant? ¿Aplica también a `idOperacion` de notas de crédito?
4. Respuesta de `GET /dte/operaciones/{codigoDte}/{idOperacion}`: formato, estados y significado de 404.
5. Valores posibles de estado SII y endpoint de referencia (`envio-sii`, `estado-envio/{trackId}` o `consulta-dte`).
6. ¿Puede DTE Core devolver un folio ya usado (reimportación de CAF, `folio-ficticio`)?
7. Notas de crédito: nombres y formato de los campos de `referencias` (tipo, folio y fecha del documento referenciado, código y razón), receptor exigido para una NC de boleta (`Cliente.RutReceptor` es obligatorio según el ejemplo 400) y si `POST /dte/notas-credito/emitir` admite referenciar una boleta 39.
8. Límites de uso por minuto y por cuenta, y código de respuesta al superarlos.
9. Ambiente de certificación: ¿cómo se separa del de producción en una misma cuenta (`/dte/caf/ambiente`, campo `ambiente` del registro)?
