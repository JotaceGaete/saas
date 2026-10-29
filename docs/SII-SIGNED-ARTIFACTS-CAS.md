# SII piloto: transiciones CAS y XML inmutable

Archivo: `scripts/sii/sql/003_signed_artifacts_cas_proposal.sql`. **Propuesta no ejecutada**.

## Garantías buscadas
- Un único XML firmado por operación fiscal; modificación y eliminación rechazadas mediante trigger.
- Digest SHA-256 calculado dentro de PostgreSQL; evita que el backend almacene un XML distinto del hash.
- Compare-and-swap atómico: dos workers que intentan avanzar de `signed` a `submitting` no pueden ganar ambos.
- Prohibición de marcar `signed` sin un XML firmado previamente almacenado.

## Revisión necesaria antes de ejecutar
1. La extensión `pgcrypto` debe estar instalada y `digest` disponible en esquema `extensions`. Si no, adaptar la referencia y verificar permisos.
2. El backend debe guardar el XML y avanzar de `reserved` a `signed` en una transacción, y verificar el resultado booleano. No usar un cliente público Supabase para llamar esta función.
3. Validar firma, certificado, CAF, RUT, folio, totales y XSD *antes* de almacenar. El SQL no sustituye esas validaciones.
4. La función CAS protege cambios efectuados **a través de ella**, no impide actualizaciones directas por un rol privilegiado. Limitar permisos SQL del rol de aplicación, impedir escrituras directas y revisar políticas.
5. Probar en PostgreSQL real dos sesiones concurrentes, caída tras almacenar, caída tras `submitting`, timeout SII, recuperación y conciliación.
6. Auditar el tratamiento del `track_id` en respuestas SII y estados terminales; no confundir aceptación de envío con aceptación tributaria de documento.
7. Antes de cualquier migración, adaptar FK, tipos y roles al modelo real Walinka.

No hay envío a SII, certificación ni cambio en Mercado Pago.
