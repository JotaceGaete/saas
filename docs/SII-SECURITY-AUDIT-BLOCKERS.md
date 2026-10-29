# SII piloto — auditoría de seguridad inicial (bloqueante)

Fecha: 2026-10-28. Revisión estática del código en rama de piloto. **No equivale a auditoría externa ni a certificación SII.**

## Hallazgos críticos que bloquean producción

1. **El orquestador no comprueba que sha256 corresponda a xmlBytes** (`scripts/sii/issuance-orchestrator.mjs`). Solo verifica el formato hexadecimal. Riesgo: integridad no comprobada si el adaptador devuelve un hash incorrecto. **Bloquear hasta verificar digest real**.
2. **La transición a `submitting` y la llamada externa no están protegidas por un lease de emisor ni una exclusión por operación.** Dos workers pueden leer `reserved` simultáneamente; únicamente un adaptador CAS correcto debe impedir que ambos envíen. El orquestador no puede asumir que cualquier implementación de `transition` sea segura. **Bloquear hasta prueba de concurrencia y backend transaccional**.
3. **El error de `submit` se captura sin distinguir timeout de fallo determinista**. Debe persistirse un código de error no sensible y conciliarse con SII. La operación no debe reemitirse por un timeout.
4. **El paso `store` no demuestra inmutabilidad ni persistencia duradera**. Una falla entre almacenar y transicionar puede dejar una operación reservada con XML ya firmado; hay que diseñar recuperación por hash y documento inmutable.
5. **El módulo de prueba TED firma bytes DD entregados por el llamador** pero no construye ni valida DD contra el formato SII, ni verifica la autenticidad criptográfica del CAF.
6. **El validador XMLDSig actual verifica una firma**, no necesariamente todas las firmas/referencias de un sobre. Deben comprobarse URI, IDs, anti-wrapping, certificado autorizado y su revocación.
7. **Las migraciones SQL son propuestas**, no aplicadas ni probadas contra el modelo real de Walinka. El SQL 002 usa `SKIP LOCKED`, requiere una política de reintentos transitorios y prueba de exclusión de rangos.
8. **Sin evidencia de ejecución de pruebas de integración** ni aceptación SII. Los archivos de tests son especificaciones pendientes de ejecución.

## Puertas de salida obligatorias

- G1: revisar esquemas oficiales SII, construir vectores conocidos TED/CAF/XMLDSig y validar cada firma.
- G2: probar integridad SHA-256 y vinculación exacta de XML firmado a RUT, venta, folio y tipo.
- G3: pruebas PostgreSQL con workers concurrentes, fallas entre commits, timeouts y respuestas duplicadas.
- G4: autorización por negocio y RUT, gestión de secretos y certificados, auditoría inmutable.
- G5: certificación con contribuyentes autorizados y conciliación de recepción SII.
- G6: despliegue gradual con rollback; Mercado Pago continúa emitiendo hasta cambio explícitamente aprobado.

**Política:** no habilitar flags de emisión real, no modificar Mercado Pago y no fusionar a main hasta cerrar G1–G5 con evidencia reproducible.

## Hallazgo adicional — autorización de tenant en la reserva (2026-10-28)

La función `fiscal.reserve_boleta39(p_business_id,p_sale_id,p_issuer_rut)` recibe los tres identificadores del llamador. La unicidad por venta y el chequeo de `issuer_rut` en una operación existente **no demuestran autorización del emisor**. Un backend que pase un `business_id` ajeno podría reservar un folio si tiene permisos de ejecución. La prueba `008_tenant_and_issuer_isolation_test.psql` solo demuestra separación de claves y preservación de una operación ya existente; **no prueba control de acceso**.

**Bloqueo G4:** antes de producción, el adaptador backend debe resolver identidad de negocio desde una sesión autenticada y verificar propiedad y RUT autorizado mediante datos confiables, nunca desde campos enviados por el cliente. El rol de ejecución de base de datos debe restringirse y revisarse con pruebas negativas de acceso cruzado; no exponer `fiscal` en Data API. No usar `SECURITY DEFINER` como atajo. Las migraciones siguen siendo propuestas sin aplicar.
