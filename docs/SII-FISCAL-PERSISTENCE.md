# SII — persistencia de operaciones y folios (propuesta sin despliegue)

La propuesta SQL se encuentra en `scripts/sii/sql/001_fiscal_operations_proposal.sql`. **No se aplicó a Supabase**.

## Invariantes protegidas por PostgreSQL

- Un documento tipo 39 por `(business_id, sale_id)`.
- Un mismo folio no puede asignarse dos veces a `(issuer_rut, document_type)`.
- Los estados posteriores a reserva necesitan folio.
- Los estados `submitted`, `accepted` y `rejected` requieren `track_id`.
- Esquema privado `fiscal` sin permisos de `anon` ni `authenticated`, con RLS activado.

## Faltan controles antes de instalar

1. Confirmar el tipo real de `business_id` y `sale_id` y vincularlos con FKs del modelo Walinka.
2. Implementar una operación de reserva de folios con transacción y bloqueo de filas (`SELECT ... FOR UPDATE`) o actualización condicional, bajo autorización de backend. No usar `MAX(folio)+1` sin bloqueo.
3. Evitar acceso directo de clientes a la tabla y exigir identidad/rol/tenant en cada petición del backend.
4. Usar control optimista `UPDATE ... WHERE version = ? AND status = ?` y comprobar exactamente una fila afectada; el SQL actual **no impide por sí solo** todas las transiciones ilegales.
5. Agregar auditoría inmutable y conciliación de respuestas SII. Ante timeout, pasar a `unknown` y consultar el estado original antes de reintentar; jamás asignar un folio nuevo automáticamente.
6. Probar concurrencia real (dos procesos reservando el mismo folio) en una base aislada y revisar políticas/grants antes de migrar.
7. Revisar restricciones de cancelación y el tratamiento de folios consumidos, de acuerdo con normativa y flujos SII.

No desplegar ni cambiar Mercado Pago hasta completar la certificación.
