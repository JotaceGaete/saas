import { supabase } from '../lib/supabase';
import { uploadToMediaService } from './mediaUploadService';

// Servicio del editor de Walinka Websites (fase 1).
// Lectura: la tabla tiene RLS (dueño o admin). Escritura: solo mediante RPC.

const ERROR_MESSAGES = {
  not_authenticated: 'Tu sesión venció. Vuelve a iniciar sesión.',
  not_authorized: 'No tienes permiso para editar este sitio.',
  not_in_pilot: 'El editor de sitio web todavía no está habilitado para este comercio.',
  invalid_draft: 'El borrador es demasiado grande o tiene un formato no válido.',
  invalid_template_key: 'La plantilla no es válida.',
  no_draft: 'Primero guarda un borrador antes de publicar.',
  invalid_content: 'El contenido no cumple las reglas de la plantilla. Revisa los campos marcados.',
};

export function describeSiteContentError(error) {
  const message = String(error?.message ?? '');
  const known = Object.keys(ERROR_MESSAGES).find((code) => message.includes(code));
  return known ? ERROR_MESSAGES[known] : 'No se pudo completar la operación. Intenta de nuevo.';
}

export async function getSiteContentState({ businessId, templateKey }) {
  const { data, error } = await supabase
    .from('wa_site_content')
    .select('draft, published, draft_updated_at, published_at')
    .eq('business_id', businessId)
    .eq('template_key', templateKey)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function saveSiteDraft({ businessId, templateKey, draft }) {
  const { data, error } = await supabase.rpc('wa_save_site_draft', {
    p_business_id: businessId,
    p_template_key: templateKey,
    p_draft: draft,
  });
  if (error) throw error;
  return data;
}

export async function publishSiteContent({ businessId, templateKey }) {
  const { data, error } = await supabase.rpc('wa_publish_site_content', {
    p_business_id: businessId,
    p_template_key: templateKey,
  });
  if (error) throw error;
  return data;
}

// Usa la infraestructura de R2 existente (tipo "cover" del comercio).
// Devuelve la URL pública que el contrato acepta (dominio multimedia autorizado).
export async function uploadSiteImage({ businessId, file }) {
  const result = await uploadToMediaService(file, { type: 'business-cover', businessId });
  return result.url;
}
