# IVA 19%: límites del diagnóstico (piloto privado)

Estado: **NO APTO PARA EMISIÓN SII**. Esta documentación no sustituye las instrucciones oficiales vigentes.

## Lo implementado

- `iva19-diagnostic.mjs` descompone un total CLP entero positivo con IVA incluido mediante aritmética `BigInt` y una hipótesis explícita: neto = redondeo mitad hacia arriba de total × 100 / 119; IVA = total − neto.
- Verifica conservación exacta de total, incluso en casos de un peso, y rechaza datos inseguros.
- Se calcula **a nivel de documento**, no por línea, porque ambas estrategias pueden dar resultados diferentes. No se ha demostrado que la estrategia sea la exigida por el SII para todas las boletas.
- Todas las respuestas indican `fiscalEligible:false` y `siiValidated:false`. No se firma, no se genera XML y no se reservan folios.

## Pendiente antes de cualquier emisión

1. Confirmar contra documentación oficial SII vigente el redondeo, tratamiento del IVA incluido y el nivel de agregación exigido para boleta tipo 39.
2. Resolver descuentos por línea y por documento, su efecto en base imponible y su representación en XML; hoy se rechazan.
3. Resolver ventas mixtas afectas/exentas, recargos, propinas y otras partidas; hoy se restringe a `IVA_AFECTO_19` verificado.
4. Comprobar que los montos de la venta y pagos corresponden a un snapshot transaccional bloqueado y que el emisor está autorizado por RUT.
5. Validar XML y firma contra esquemas oficiales SII vigentes; el ZIP de XSD disponible presenta un conflicto de restricciones documentado en `OFFICIAL-XSD-VALIDATION.md`.
6. Obtener certificación, CAF y certificado reales por cada RUT, solo cuando el titular autorice el piloto correspondiente.

## Alcance de seguridad

El diagnóstico no se importa en el orquestador de emisión. Ningún resultado de esta función constituye una autorización fiscal. Mantener el registro privado de emisores deshabilitado por defecto y no desplegar el piloto a producción.
