import { getValidToken } from '../lib/auth/getValidToken';
import { compressImageForUpload } from '../utils/imageUploadUtils';

const DEFAULT_UPLOAD_TIMEOUT_MS = 30000;
const DEFAULT_PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function getSupabaseFunctionUrl(functionName) {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  if (!supabaseUrl) {
    throw new Error('Falta configurar VITE_SUPABASE_URL para subir imagenes.');
  }
  return `${supabaseUrl}/functions/v1/${functionName}`;
}

function getSupabaseAnonKey() {
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!anonKey) {
    throw new Error('Falta configurar VITE_SUPABASE_ANON_KEY para subir imagenes.');
  }
  return anonKey;
}

function normalizeImageUploadType(type) {
  if (type === 'business-logo') return 'logo';
  if (type === 'business-cover') return 'cover';
  if (type === 'product-main' || type === 'product-gallery') return 'product';
  throw new Error('Tipo de subida de imagen no soportado.');
}

function parseR2XmlError(xmlText) {
  try {
    const code = xmlText.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? '';
    const msg  = xmlText.match(/<Message>([^<]+)<\/Message>/)?.[1] ?? '';
    if (code === 'EntityTooLarge') return 'La imagen es demasiado pesada para el servidor. Usa una imagen más pequeña.';
    if (code === 'RequestTimeout')  return 'La subida tardó demasiado. Verifica tu conexión e intenta de nuevo.';
    if (code === 'AccessDenied')    return 'No tienes permiso para subir esta imagen. Recarga la página e intenta de nuevo.';
    if (code || msg) return `Error en el servidor de imágenes: ${msg || code}`;
  } catch { /* no es XML, devolver null */ }
  return null;
}

function normalizeMediaUploadError(error, fallbackMessage) {
  if (error?.name === 'AbortError') {
    return new Error('La subida tardó demasiado. Si tienes conexión lenta, intenta con una imagen más pequeña.');
  }
  // TypeError: Failed to fetch = CORS, red cortada, DNS, etc.
  if (error?.name === 'TypeError' || error?.message?.toLowerCase().includes('failed to fetch') || error?.message?.toLowerCase().includes('network')) {
    return new Error('No se pudo conectar con el servidor de imágenes. Verifica tu conexión a internet e intenta de nuevo.');
  }
  if (error instanceof Error && error.message) {
    return error;
  }
  return new Error(fallbackMessage);
}

export function getProductImageMaxBytes() {
  const rawValue = Number(import.meta.env.VITE_PRODUCT_IMAGE_MAX_BYTES);
  if (Number.isFinite(rawValue) && rawValue > 0) {
    return Math.round(rawValue);
  }
  return DEFAULT_PRODUCT_IMAGE_MAX_BYTES;
}

export function validateProductImageFile(file, { maxBytes = getProductImageMaxBytes() } = {}) {
  if (!(file instanceof File) && !(file instanceof Blob)) {
    return 'Selecciona una imagen valida antes de subir.';
  }

  const mimeType = String(file?.type || '').trim().toLowerCase();
  if (!mimeType.startsWith('image/')) {
    return 'El archivo seleccionado no es una imagen valida.';
  }

  const fileSize = Number(file?.size || 0);
  if (fileSize > maxBytes) {
    const maxMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    return `La imagen supera el maximo de ${maxMb} MB.`;
  }

  return null;
}

export function appendCacheBust(url, version) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl || !version) return cleanUrl;
  const separator = cleanUrl.includes('?') ? '&' : '?';
  return `${cleanUrl}${separator}v=${encodeURIComponent(String(version))}`;
}

export async function uploadToMediaService(file, {
  type,
  businessId,
  productId,
  index,
  skipClientCompression = false,
  variant,
  timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
} = {}) {
  if (!(file instanceof Blob)) {
    throw new Error('Selecciona una imagen valida antes de subir.');
  }
  if (!type) {
    throw new Error('Falta el tipo de subida.');
  }
  if (!businessId) {
    throw new Error('Falta el negocio para subir la imagen.');
  }
  if ((type === 'product-main' || type === 'product-gallery') && !productId) {
    throw new Error('Falta el producto para subir la imagen.');
  }

  const uploadType = normalizeImageUploadType(type);
  let fileToUpload = file;
  if (uploadType === 'product' && skipClientCompression !== true) {
    try {
      fileToUpload = await compressImageForUpload(file, 'product');
    } catch {
      fileToUpload = file;
    }
  }
  const token = await getValidToken();
  if (!token) {
    throw new Error('Tu sesion vencio. Vuelve a iniciar sesion para subir imagenes.');
  }

  const controller = new AbortController();
  const timeoutHost = typeof window !== 'undefined' ? window : globalThis;
  const timeoutId = timeoutHost.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestBody = {
      type: uploadType,
      businessId,
      productId: productId !== undefined && productId !== null && productId !== '' ? productId : undefined,
      index: index !== undefined && index !== null && index !== '' ? Number(index) : undefined,
      variant: typeof variant === 'string' && variant.trim() ? variant.trim() : undefined,
      fileName: typeof fileToUpload?.name === 'string' && fileToUpload.name.trim() ? fileToUpload.name.trim() : `upload-${Date.now()}.jpg`,
      contentType: String(fileToUpload?.type || 'image/jpeg').trim() || 'image/jpeg',
    };

    const signedUrlResponse = await fetch(getSupabaseFunctionUrl('upload-image-r2'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    let signedUrlPayload = null;
    try {
      signedUrlPayload = await signedUrlResponse.json();
    } catch {
      throw new Error('El servidor devolvio una respuesta invalida al preparar la subida de la imagen.');
    }

    if (!signedUrlResponse.ok) {
      const message =
        signedUrlPayload?.error ||
        signedUrlPayload?.message ||
        `Error del servidor al preparar la subida de la imagen (${signedUrlResponse.status}).`;
      throw new Error(message);
    }

    if (typeof signedUrlPayload?.uploadUrl !== 'string' || !signedUrlPayload.uploadUrl.trim()) {
      throw new Error('La respuesta no incluyo una URL firmada valida para subir la imagen.');
    }

    if (typeof signedUrlPayload?.publicUrl !== 'string' || !signedUrlPayload.publicUrl.trim()) {
      throw new Error('La respuesta no incluyo una URL publica valida para la imagen.');
    }

    console.log('[mediaUpload] PUT R2', {
      type,
      businessId,
      productId: productId ?? null,
      fileSize: fileToUpload?.size ?? null,
      contentType: requestBody.contentType,
    });

    const uploadResponse = await fetch(signedUrlPayload.uploadUrl.trim(), {
      method: 'PUT',
      headers: {
        'Content-Type': requestBody.contentType,
      },
      body: fileToUpload,
      signal: controller.signal,
    });

    if (!uploadResponse.ok) {
      const uploadErrorText = await uploadResponse.text().catch(() => '');
      console.error('[mediaUpload] R2 PUT error', uploadResponse.status, uploadErrorText.slice(0, 300));
      const r2UserMessage = parseR2XmlError(uploadErrorText);
      throw new Error(r2UserMessage || uploadErrorText || `Error al subir la imagen al storage (${uploadResponse.status}).`);
    }

    return {
      ok: true,
      url: signedUrlPayload.publicUrl.trim(),
      key: typeof signedUrlPayload?.key === 'string' ? signedUrlPayload.key.trim() : '',
      contentType: requestBody.contentType,
      size: Number.isFinite(Number(fileToUpload?.size)) ? Number(fileToUpload.size) : null,
    };
  } catch (error) {
    console.error('[mediaUpload] upload error', { name: error?.name, message: error?.message, type, businessId });
    throw normalizeMediaUploadError(error, 'No se pudo subir la imagen. Verifica tu conexión e intenta de nuevo.');
  } finally {
    timeoutHost.clearTimeout(timeoutId);
  }
}

/**
 * Sube una imagen de plantilla de catálogo (panel /admin/catalog-templates).
 * Solo admins: la Edge Function upload-image-r2 valida el rol. No requiere
 * negocio; las imágenes quedan en catalog-templates/{templateId}/ en R2.
 *
 * @param {File|Blob} file
 * @param {{ templateId?: string, variant?: 'logo'|'banner'|'preview'|'product', timeoutMs?: number }} options
 * @returns {Promise<{ ok: true, url: string, key: string }>}
 */
export async function uploadTemplateImage(file, { templateId, variant = 'product', timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS } = {}) {
  if (!(file instanceof Blob)) {
    throw new Error('Selecciona una imagen valida antes de subir.');
  }

  let fileToUpload = file;
  if (variant === 'product' || variant === 'banner' || variant === 'preview') {
    try {
      fileToUpload = await compressImageForUpload(file, 'product');
    } catch {
      fileToUpload = file;
    }
  }

  const token = await getValidToken();
  if (!token) {
    throw new Error('Tu sesion vencio. Vuelve a iniciar sesion para subir imagenes.');
  }

  const controller = new AbortController();
  const timeoutHost = typeof window !== 'undefined' ? window : globalThis;
  const timeoutId = timeoutHost.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestBody = {
      type: 'template',
      templateId: typeof templateId === 'string' && templateId.trim() ? templateId.trim() : undefined,
      variant,
      fileName: typeof fileToUpload?.name === 'string' && fileToUpload.name.trim() ? fileToUpload.name.trim() : `template-${Date.now()}.jpg`,
      contentType: String(fileToUpload?.type || 'image/jpeg').trim() || 'image/jpeg',
    };

    const signedUrlResponse = await fetch(getSupabaseFunctionUrl('upload-image-r2'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    let signedUrlPayload = null;
    try {
      signedUrlPayload = await signedUrlResponse.json();
    } catch {
      throw new Error('El servidor devolvio una respuesta invalida al preparar la subida de la imagen.');
    }

    if (!signedUrlResponse.ok) {
      throw new Error(
        signedUrlPayload?.error || signedUrlPayload?.message ||
        `Error del servidor al preparar la subida de la imagen (${signedUrlResponse.status}).`,
      );
    }
    if (typeof signedUrlPayload?.uploadUrl !== 'string' || !signedUrlPayload.uploadUrl.trim()) {
      throw new Error('La respuesta no incluyo una URL firmada valida para subir la imagen.');
    }
    if (typeof signedUrlPayload?.publicUrl !== 'string' || !signedUrlPayload.publicUrl.trim()) {
      throw new Error('La respuesta no incluyo una URL publica valida para la imagen.');
    }

    const uploadResponse = await fetch(signedUrlPayload.uploadUrl.trim(), {
      method: 'PUT',
      headers: { 'Content-Type': requestBody.contentType },
      body: fileToUpload,
      signal: controller.signal,
    });
    if (!uploadResponse.ok) {
      const uploadErrorText = await uploadResponse.text().catch(() => '');
      throw new Error(uploadErrorText || `Error al subir la imagen al storage (${uploadResponse.status}).`);
    }

    return {
      ok: true,
      url: signedUrlPayload.publicUrl.trim(),
      key: typeof signedUrlPayload?.key === 'string' ? signedUrlPayload.key.trim() : '',
    };
  } catch (error) {
    throw normalizeMediaUploadError(error, 'No se pudo subir la imagen de la plantilla.');
  } finally {
    timeoutHost.clearTimeout(timeoutId);
  }
}
