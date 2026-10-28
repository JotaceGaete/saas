# Validación XSD oficial SII — boleta electrónica

Fuente SII: https://www.sii.cl/servicios_online/1039-formato_xml-1184.html
Descarga publicada: https://www.sii.cl/servicios_online/docs/xml/schema_envio_bol.zip

El SII publica **un esquema específico de Boletas Electrónicas** distinto del esquema general de DTE. La página recomienda comprobar XML bien formado y cumplimiento del esquema antes del envío.

## Estado comprobado
- Se verificó que la página oficial enlaza el ZIP `schema_envio_bol.zip`.
- **No se logró descargar/inspeccionar el ZIP desde este entorno**. No conocemos aquí la lista exacta de XSD, versión ni namespaces internos. No inventar nombres ni copiar esquemas de terceros.
- El validador adjunto admite un XSD oficial extraído localmente, sin acceso a red y sin resolver entidades externas.
- **No existe todavía evidencia de que un XML de Walinka valide contra ese XSD**. Validación XSD tampoco implica firma correcta, CAF vigente, aceptación SII ni certificación.

## Procedimiento reproducible (entorno local aislado)
1. Descargar ZIP desde el enlace oficial, registrar fecha de descarga y SHA-256 del ZIP.
2. Extraer en carpeta privada; identificar el XSD raíz real leyendo los includes/imports.
3. Instalar `lxml` en entorno de desarrollo aislado.
4. Ejecutar:
   ```bash
   python scripts/sii/validate-official-boleta-xsd.py --schema-dir /ruta/esquemas --schema NOMBRE_REAL.xsd --xml /ruta/boleta-fixture.xml
   ```
5. Guardar resultado, hash de XSD/ZIP y versión. Preparar fixtures válidos e inválidos, sin RUTs reales ni secretos.
6. No activar emisión en producción sin pruebas de timbre, firma, envío, estados, consulta, contingencias y autorización del SII para cada RUT.

## Hallazgo importante
El documento histórico `https://www.sii.cl/factura_electronica/boletas_elec.pdf` está fechado **2010-07-12** y afirma que boletas no se enviaban individualmente. **No usar esa instrucción histórica como regla operativa vigente** sin contrastar con normativa actual.
