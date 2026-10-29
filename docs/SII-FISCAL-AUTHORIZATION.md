# Autorización fiscal — puerta de reserva (piloto sin emisión)

**Estado:** módulo y pruebas unitarias implementados; adaptadores de producción NO conectados. No se ha ejecutado la batería de PostgreSQL 16 ni certificado la emisión SII.

## Contrato de `reserveAuthorizedBoleta39`

- `actorId`: identidad verificada del usuario por el backend; nunca confiar en un ID enviado por el navegador.
- `businessId`: negocio solicitado, validado mediante membresía/permisos actuales en `canIssue`.
- `getBusiness`: recuperar desde DB el RUT fiscal validado y flags `fiscalEnabled === true` y `issuerVerified === true`. Estos flags deben ser concedidos mediante verificación administrativa y SII, no por el propio comercio.
- `getSale`: comprobar que la venta existe, pertenece exactamente al negocio, tiene el mismo RUT emisor y está habilitada para emisión.
- `reserve`: adaptador transaccional a `fiscal.reserve_boleta39`, con autorización revalidada en el límite DB o en transacción serializada para evitar TOCTOU; el módulo JS **no sustituye** esa comprobación.

**Denegar por defecto** cuando falta información, falla cualquier consulta o el resultado no es exactamente verdadero. No registrar secretos, certificados ni datos personales en logs.

## Bloqueos antes de producción

1. Resolver identidad real y permisos desde esquema Walinka actual (`wa_businesses.user_id` y permisos de colaboradores), con pruebas negativas de usuario ajeno, membresía revocada y negocio deshabilitado.
2. Vincular RUT tributario autorizado a cada negocio y a la venta mediante fuente confiable; impedir cambios mientras existan operaciones fiscales.
3. Usar rol de DB dedicado sin acceso directo de mutación a operaciones; revisar `SECURITY INVOKER`, grants, RLS y transacciones contra PostgreSQL real.
4. Pruebas de concurrencia y revocación entre autorización y reserva; sin doble folio ni autorización obsoleta.
5. Ninguna función de emisión real ni flag de producción se habilita hasta aprobación SII y autorización expresa.
