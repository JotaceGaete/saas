# Auditoría oficial SII — piloto privado Walinka

Estado: revisión documental inicial; **NO certificación**, **NO producción**, **NO emisión real**.
Alcance: boleta electrónica tipo 39 para cuatro empresas propias, autorización manual para terceros de confianza en una etapa posterior. Cada RUT se certifica y opera por separado según requisitos aplicables.

## Fuentes oficiales verificadas (2026-10-28)
- Certificación boletas: https://www.sii.cl/factura_electronica/guia_emitir_boleta_servicio.htm
- Formato boletas, documento versión 2.0 fechado 2010-07-12: https://www.sii.cl/factura_electronica/boletas_elec.pdf
- Esquemas XML (incluye boletas, DTE, libro y consumo folios): https://www.sii.cl/servicios_online/1039-formato_xml-1184.html

**Advertencia:** La versión del PDF de boletas es de 2010. Algunas obligaciones, procesos de envío y formatos pueden haber cambiado. Confirmar documentación y normativa vigentes del SII antes de usar estas reglas para producción. No convertir reglas históricas en comportamiento fiscal definitivo.

## Matriz de brechas
| Requisito | Evidencia SII | Walinka | Próxima verificación |
|---|---|---|---|
| Postulación del representante legal y set de pruebas | Instructivo de certificación | No realizada | Confirmar situación de cada RUT |
| Emisor DTE autorizado o certificación paralela | Instructivo de certificación | Desconocido | Consultar requisitos actuales |
| Boleta 39, y evaluar boleta exenta 41 | PDF formato boletas | Reserva 39 piloto | Delimitar alcance real |
| XML conforme a XSD de boletas | Página oficial de esquemas | Sin prueba oficial demostrada | Descargar XSD vigente, validar fixtures |
| Encabezado, emisor, receptor, detalle, totales y timbre | PDF formato boletas | No auditado campo por campo | Matriz de campos y casos |
| Certificado, firma y timbre electrónico | Formato boletas | No verificado | Diseñar custodia aislada por RUT |
| Envíos/set de certificación | Instructivo certificación | No realizados | Solicitar set cuando esté listo |
| Consulta pública de documento | Instructivo certificación | No verificada | Diseñar consulta segura, URL en representación |
| Consumo de folios y libro de boletas | Referencias del instructivo y esquemas | No auditados | Verificar vigencia y reglas actuales |
| Seguridad por empresa/RUT | Política interna Walinka | Allowlist SQL 028-031 en rama piloto | Ejecutar CI y revisión SQL |
| Duplicados, retries, revocación | Requisito operativo interno | Pruebas piloto | Ensayo end-to-end y fallas |
| Impresión fiscal | Instructivo certificación | No validada | Comparar representación con formato vigente |

## Condiciones de avance
1. No aplicar SQL piloto en Supabase producción ni desplegar emisión.
2. Revisar SQL 028-031 con pruebas reales de CI antes de considerarlo integrado.
3. Confirmar vigencia del procedimiento SII para boletas (la guía y PDF consultados podrían ser históricos).
4. Elegir una empresa propia para certificación y luego extender a otras tres, sin mezclar folios/CAF/certificados.
5. No habilitar terceros hasta tener operación probada, monitoreo, procedimientos de contingencia y autorización expresa.
