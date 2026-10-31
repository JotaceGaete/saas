# Fiscal (DTE 39) — bloqueos para habilitar producción

Estado de la rama `feat/boleta-auto-emision-20261030`: **solo simulación**. Ningún
paso de este documento se ejecutó en producción.

## Garantías implementadas y probadas
- **Un solo punto de emisión:** el claim atómico en `crm_fiscal_issuances`. Webhook,
  reconciliador, barrido y cola del panel pasan todos por él.
- **Sin re-envío:** cualquier fila existente (pending no promovible, sending, unknown,
  issued, failed, cancelled) impide una segunda llamada al proveedor.
- **Barrido sin emisión:** solo registra filas `pending`; no tiene dependencia de emisión.
- **Permisos:** `anon`, `authenticated` y `public` no pueden leer el ledger ni ejecutar
  las funciones fiscales. RLS habilitado. Solo `service_role` ejecuta.
- **Aislamiento por negocio:** la cola verifica dueño del negocio pedido en cada llamada;
  la verificación de Point es tenant-scoped.

## Bloqueos (todos deben estar resueltos)
1. **Documentos previos al ledger.** No existe verificación contra el registro del
   proveedor para boletas emitidas antes de la existencia del ledger o fuera de Walinka.
   Hay que conciliar esas ventas antes de habilitar emisión real.
2. **Totales e IVA.** Pendiente de confirmar en el portal sandbox del proveedor.
3. **Migraciones.** `20261029110000`, `20261029160000`, `20261030191500` y `20261031100000`
   no están aplicadas en ningún entorno real. Requieren aprobación explícita y prueba previa
   en base desechable.
4. **Rol de servidor con `BYPASSRLS`.** Las funciones necesitan que `service_role` tenga
   `BYPASSRLS` y privilegios explícitos (la migración `20261029110000` los otorga). Sin eso,
   las escrituras fallan cerradas.
5. **Cajeros empleados.** La autorización de efectivo es solo para el dueño.
6. **Descuentos y pagos mixtos.** Se rechazan; esas ventas no reciben boleta.
7. **Efectivo sin barrido.** El barrido cubre solo Point.
8. **Credenciales.** Confirmar que las credenciales ya usadas fueron de sandbox. Ningún
   `api_key` real debe cargarse en `SIISOLUTIONS_PILOT_ISSUERS_JSON` antes de este punto.
9. **Scheduler del barrido.** No configurado en este PR; definir frecuencia y secreto.
10. **Cola de `unknown`.** La conciliación manual de `unknown` usa un flujo separado que
    requiere verificador independiente; no está habilitado.

## Hallazgos fuera de este PR (urgentes)
- **Vistas administrativas en `main`:** `wa_payments_admin_view` y
  `wa_admin_business_overview` unen `auth.users` y no tienen `REVOKE` explícito en las
  migraciones de `main`. Verificar en el proyecto real:
  `select grantee, privilege_type from information_schema.role_table_grants where table_name in ('wa_payments_admin_view','wa_admin_business_overview');`
  Si `anon` o `authenticated` aparecen, es una exposición de datos. Corregir en un PR de
  hotfix separado (el panel admin debe pasar a un RPC protegido por `wa_is_admin()`).
  La migración de hotfix que venía en la rama fue **retirada** de este PR porque rompe el
  panel admin actual.

## Verificación reproducible
```bash
node --test scripts/siisolutions/*.test.mjs api/_lib/*.test.js api/fiscal/*.test.js src/services/fiscalQueueService.test.mjs
PGDATABASE=<disposable> bash scripts/siisolutions/fiscal-sweep-concurrency.sh
PGDATABASE=<disposable> bash scripts/siisolutions/fiscal-permissions-check.sh
```
Ambos scripts de PostgreSQL se niegan a correr si el nombre de la base no contiene
`disposable` o `ci`.
