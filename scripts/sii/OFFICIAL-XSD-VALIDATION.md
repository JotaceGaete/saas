# Validación XSD oficial SII — boleta electrónica

Fuente SII: https://www.sii.cl/servicios_online/1039-formato_xml-1184.html
Descarga publicada: https://www.sii.cl/servicios_online/docs/xml/schema_envio_bol.zip

El SII publica **un esquema específico de Boletas Electrónicas** distinto del esquema general de DTE. La página recomienda comprobar XML bien formado y cumplimiento del esquema antes del envío.

## Estado comprobado
- Se verificó que la página oficial enlaza el ZIP `schema_envio_bol.zip`.
- **Actualización 2026-10-28:** se inspeccionó un ZIP aportado por el usuario; sus nombres, hashes y error de compilación están detallados abajo. La procedencia exacta y vigencia normativa del archivo no quedan demostradas solo por esa inspección. No copiar esquemas de terceros.
- El validador adjunto admite un XSD oficial extraído localmente, sin acceso a red y sin resolver entidades externas.
- **No existe todavía evidencia de que un XML de Walinka valide contra ese XSD**. Validación XSD tampoco implica firma correcta, CAF vigente, aceptación SII ni certificación.

## Procedimiento reproducible (entorno local aislado)
1. Descargar ZIP desde el enlace oficial, registrar fecha de descarga y SHA-256 del ZIP.
2. Extraer en carpeta privada; identificar el XSD raíz real leyendo los includes/imports. Para el ZIP inspeccionado se identificó `EnvioBOLETA_v11.xsd`.
3. Instalar `lxml` en entorno de desarrollo aislado.
4. Ejecutar:
   ```bash
   python scripts/sii/validate-official-boleta-xsd.py --schema-dir /ruta/esquemas --schema NOMBRE_REAL.xsd --xml /ruta/boleta-fixture.xml
   ```
5. Guardar resultado, hash de XSD/ZIP y versión. Preparar fixtures válidos e inválidos, sin RUTs reales ni secretos.
6. No activar emisión en producción sin pruebas de timbre, firma, envío, estados, consulta, contingencias y autorización del SII para cada RUT.

## Hallazgo importante
El documento histórico `https://www.sii.cl/factura_electronica/boletas_elec.pdf` está fechado **2010-07-12** y afirma que boletas no se enviaban individualmente. **No usar esa instrucción histórica como regla operativa vigente** sin contrastar con normativa actual.

## Inspección del ZIP aportado (2026-10-28)

- SHA-256 del ZIP recibido: `cd9bbb1297cf9c6e6cb887f4d1686c91c8476e8c01afaafc5d0948f48bec044d`.
- Contiene exactamente `EnvioBOLETA_v11.xsd` (52.608 bytes) y `xmldsignature_v10.xsd` (7.135 bytes).
- XSD raíz `EnvioBOLETA_v11.xsd`; namespace `http://www.sii.cl/SiiDte`; importa el esquema de firma `xmldsignature_v10.xsd`.
- El comentario interno registra modificaciones de 2007 y 2010.
- **Resultado real:** `lxml.etree.XMLSchema` no logra compilar el XSD sin modificaciones. En línea 678, `DescuentoPct` restringe `SiiDte:PctType` con `minInclusive=0.00`, pero el tipo base exige `minInclusive=0.01`. La restricción es inválida conforme a XSD. Esto bloquea validación documental contra el esquema original con este motor; no prueba que Walinka sea inválido.
- No editar el XSD original ni declarar validación oficial. Confirmar con SII una versión actualizada/corrección autorizada o documentar una copia de compatibilidad estrictamente para diagnóstico, nunca como prueba de conformidad oficial.
- El ZIP se inspeccionó localmente, no se agregó al repositorio.

## Segunda inspección reproducible (archivo del usuario)

El script `scripts/sii/audit-official-xsd-archive.py` comprueba hashes SHA-256 de los dos XSD antes de intentar compilar el original **sin modificarlo**. Ejecución local:

```bash
python -m pip install lxml
python scripts/sii/audit-official-xsd-archive.py "/ruta/schema_envio_bol (1).zip"
```

Resultado observado: **exit code 2 (esquema inválido para lxml/libxml2)**. Hay **dos** restricciones incompatibles: líneas **678 y 700** (`minInclusive=0.00` sobre `PctType` cuyo mínimo es `0.01`). Los errores secundarios señalan la misma incompatibilidad del tipo base.

Esto es un diagnóstico del archivo concreto, no prueba de vigencia normativa ni aceptación/rechazo del SII. No se ha validado todavía ningún XML de Walinka contra el esquema original. El ZIP no se guarda en el repositorio.
