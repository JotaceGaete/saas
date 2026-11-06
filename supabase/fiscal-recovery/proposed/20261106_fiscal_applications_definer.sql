-- Migración I — Altas de facturación: las funciones de revisión leen auth.users con los permisos
-- del dueño (postgres), no del llamador.
--
-- Causa (producción, 2026-11-06): service_role no tiene SELECT sobre auth.users. Las dos funciones
-- eran SECURITY INVOKER y leen auth.users (correo del dueño en la cola; rol admin del revisor),
-- así que fallaban con 42501 «permission denied for table users» → PostgREST 403 → la API respondía
-- 503 SERVER_ERROR y Administración → Altas de facturación mostraba «No se pudo completar la acción».
-- Las otras 14 funciones del proyecto que leen auth.users ya son SECURITY DEFINER.
--
-- Cambio mínimo: solo SECURITY DEFINER + search_path fijo con pg_temp al final. No cambian los
-- cuerpos, firmas, resultados ni permisos: EXECUTE sigue siendo solo de service_role (y postgres).
-- No toca datos, no aprueba ninguna solicitud y no cambia el control de emisión.
--
-- Recuperación: 20261106_fiscal_applications_definer_down.sql (vuelve a SECURITY INVOKER).

begin;

alter function public.crm_fiscal_list_applications(text)
  security definer
  set search_path = public, fiscal, pg_temp;

alter function public.crm_fiscal_review_application(uuid, uuid, text, text)
  security definer
  set search_path = public, fiscal, pg_temp;

-- Mismas garantías de acceso que antes (idempotente): nadie fuera de service_role puede ejecutarlas.
revoke all on function public.crm_fiscal_list_applications(text) from public, anon, authenticated;
revoke all on function public.crm_fiscal_review_application(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.crm_fiscal_list_applications(text) to service_role;
grant execute on function public.crm_fiscal_review_application(uuid, uuid, text, text) to service_role;

commit;
