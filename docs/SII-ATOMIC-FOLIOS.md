# Reserva atómica de folios — propuesta para revisión

Archivo: `scripts/sii/sql/002_caf_reservation_proposal.sql`. **No aplicado** a ninguna base.

## Qué hace

- Registra metadatos de rangos CAF con exclusión de intervalos superpuestos por emisor y tipo.
- Reserva un folio bajo bloqueos PostgreSQL, dentro de la misma transacción que registra la operación.
- Reintentos de la misma venta retornan el folio existente; jamás reservan uno nuevo.
- Si una operación queda en estado `unknown`, el folio se conserva.
- La función usa `SECURITY INVOKER` y revoca acceso público.

## Límites obligatorios antes de producción

1. El SQL **no verifica criptográficamente un CAF**. Un proceso seguro externo debe comprobar firma, RUT, tipo, rango, vigencia y autorización antes de insertar un rango con `active=true`. Sin eso, cualquier rango activo sería peligroso.
2. El backend debe comprobar la pertenencia de `business_id` y `issuer_rut` a la sesión autorizada. Esta función no lo sabe. Debe utilizarse únicamente desde una conexión privilegiada controlada.
3. `SKIP LOCKED` puede informar temporalmente que no hay rangos libres bajo alta concurrencia; el backend debe tratarlo como condición transitoria, **no** emitir otro documento.
4. El modelo debe revisarse para impedir que una venta anulada consuma un folio de forma incorrecta y para incorporar el manejo de folios no utilizados conforme a SII.
5. Se requiere auditoría inmutable y restricciones de transición del estado; la función solo cubre reserva.
6. Se requieren pruebas de concurrencia en PostgreSQL real (dos transacciones, misma venta y ventas diferentes), y revisión del uso de extensiones en el proyecto.
7. Antes de ejecutar, revisar tipos reales de IDs y permisos de roles, así como la compatibilidad con migraciones existentes.

No habilitar emisión real ni modificar Mercado Pago.
