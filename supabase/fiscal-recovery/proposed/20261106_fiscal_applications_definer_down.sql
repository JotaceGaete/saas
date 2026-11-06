-- Recuperación de la migración I: vuelve exactamente al estado previo (SECURITY INVOKER,
-- search_path = public, fiscal). Permisos sin cambios. No toca datos.
begin;
alter function public.crm_fiscal_list_applications(text) security invoker set search_path = public, fiscal;
alter function public.crm_fiscal_review_application(uuid, uuid, text, text) security invoker set search_path = public, fiscal;
commit;
