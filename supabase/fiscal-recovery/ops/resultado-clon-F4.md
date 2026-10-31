# Resultado: P0 + A–D sobre copia local (NO producción)

## Clon de producción
- Intento: branch de Supabase `f4-clon-puesta-en-marcha` (creado y **eliminado**).
  Estado final: `MIGRATIONS_FAILED`, 145 migraciones aplicadas, **sin tablas `fiscal.*`**. Las migraciones del
  repositorio no reproducen el esquema de producción. No hay clon fiel disponible.
- Sustituto: copia local `walinka_f4_test` de `walinka_test`, con cambios explícitos:
  - eliminados los triggers de fase 1 `wa_businesses_seed_fiscal_owner` y `wa_businesses_owner_change` (no existen en producción);
  - eliminadas `fiscal.admin_audit` y `fiscal.business_fiscal_roles` para probar P0 desde cero;
  - concedidos a `anon` los mismos privilegios que tiene producción sobre `crm_invoices`.
  - Limitación: la copia ya contenía A–D; no es una prueba desde el estado de producción.

## P0
- Creado sin errores. Permisos: `admin_audit` solo `service_role` (insert/select/update/delete); RLS activo sin políticas.
- Trigger solo-anexar activo.

## A, B, C, D
- Aplicadas en orden sin error (`ON_ERROR_STOP=1`).

## Suite DB (test/db, 115 pruebas)
- Primera ejecución: 99/115. Fallos por `sucursal del comercio no configurada`: el fixture no creaba la sucursal.
- Corregido el fixture (`test/db/fixtures.mjs`, solo prueba). Resultado: **115/115**.

## Privilegios de `anon` sobre `public.crm_invoices` (riesgo, no bloqueante para el catálogo)
- Antes de A: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER.
- Después de A (`revoke select`): **INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER**.
- Prueba en transacción revertida: `SELECT` como anon -> `permission denied`. `TRUNCATE` como anon llega a la
  comprobación de claves foráneas (la bloquea solo `crm_quotes`), es decir, el privilegio existe. Filas intactas tras revertir.
- Catálogo público: ninguna función o política accesible por anon lee `crm_invoices` (política solo para `authenticated`).
  Quitar SELECT no cambia ninguna lectura de anon, porque RLS ya la bloqueaba.
- Recomendación: sustituir en A `revoke select` por `revoke all on public.crm_invoices from anon`. No modificado aquí.

## Producción
- No modificada. No se desplegó nada. No se emitió nada. No se consumieron folios.
