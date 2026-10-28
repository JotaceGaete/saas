# Walinka — Piloto de emisión tributaria SII (Chile)

Estado: diseño y validación normativa. **No habilitado para emitir documentos reales**.

## Objetivo
Emitir boleta electrónica afecta tipo 39 desde Walinka para pagos en efectivo; conservar Mercado Pago Point como procesador de cobros. Posteriormente admitir segundo RUT, boleta exenta 41 y facturas 33/34.

## Alcance inicial y límites
- Dos contribuyentes piloto, cada uno con autorización, certificado, folios CAF y configuración propios.
- No emitir ni simular boletas fiscales en producción antes de habilitación y pruebas oficiales.
- No asumir que un voucher de tarjeta requiere boleta adicional: modelar la modalidad tributaria declarada por cada contribuyente y prevenir duplicados.
- No registrar XML, CAF, claves privadas ni contraseñas en logs, Git, tablas públicas o navegador.
- No modificar el circuito actual de cobro Point ni la conciliación de caja en esta fase.

## Comprobaciones previas con SII (bloqueantes)
1. Verificar documentación técnica vigente de boletas, ambiente de certificación y pasos exactos de incorporación por RUT.
2. Confirmar para cada piloto su situación actual: emisor autorizado, modalidad boleta/voucher, software vigente y certificado digital.
3. Confirmar esquema XML, TED/CAF, firma, autenticación, envío, consulta de estados y tratamiento de contingencias.
4. Verificar reglas actuales de facturas, diferencias con boletas y requerimientos adicionales antes de implementar DTE 33/34.

## Diseño técnico propuesto (pendiente de revisión del esquema actual)
- Tabla de configuración tributaria por business_id y RUT, con país CL; acceso exclusivamente autorizado.
- Referencias a secretos cifrados en servidor; almacenamiento privado de certificados/CAF y rotación.
- Tabla de documentos fiscales con venta origen, tipo DTE, folio, estado, huella/idempotencia, timestamps y referencias a XML/representación imprimible.
- Tabla de eventos/auditoría de envío y consulta; no exponer material sensible.
- Servicio aislado fiscal-sii: preparar -> validar -> reservar folio -> firmar -> enviar -> consultar -> emitir representación.
- Transiciones seguras y recuperables ante timeout: jamás asignar un nuevo folio automáticamente si el estado remoto es ambiguo.
- Integración TPV: efectivo solicita emisión; tarjeta registra resultado Point y aplica reglas fiscales para evitar doble documento.
- Funciones backend protegidas; RLS tenant, autorización de operador y controles de concurrencia.

## Plan de ejecución
1. Auditoría del código y esquema CRM actual, con inventario de migraciones, pagos y tickets.
2. Prueba local de construcción y validación XML tipo 39 usando fixtures sintéticos, sin credenciales reales.
3. Prueba de firma y CAF con material de certificación bajo resguardo; tests de duplicados, aislamiento multi-RUT y reintentos.
4. Habilitación del primer contribuyente en SII y pruebas oficiales supervisadas.
5. Integración UI y térmica en staging, con estados visibles de emisión y fallos.
6. Incorporación del segundo contribuyente y pruebas de aislamiento.
7. Revisión legal/tributaria, piloto real controlado y posterior despliegue gradual.

## Criterios de aceptación mínimos
- Una venta no genera dos DTE ni consume dos folios por reintentos concurrentes.
- Un comercio no puede acceder a certificado, CAF, folios ni documentos del otro.
- Caída del SII o timeout no transforma un estado desconocido en «emitido» ni provoca reemisión insegura.
- Los cobros Point no se duplican ni se registran como efectivo.
- Folio, XML, estado tributario y representación impresa son rastreables desde la venta.

## Pendientes del propietario
- Confirmar si ambas empresas ya emiten boletas y con qué sistema.
- Identificar cuál RUT será piloto 1 (sin compartir claves o certificados por chat).
- Autorizar expresamente cada prueba o despliegue que interactúe con SII real o producción.
