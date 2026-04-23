import { getValidToken } from '../lib/auth/getValidToken';
import { updateProduct } from './waBusinessService';

const DEFAULT_VIDEO_UPLOAD_TIMEOUT_MS = 30000;
const DEFAULT_PRODUCT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_VIDEO_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

function getSupabaseFunctionUrl(functionName) {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  if (!supabaseUrl) {
    throw new Error('Falta configurar VITE_SUPABASE_URL para subir videos.');
  }
  return `${supabaseUrl}/functions/v1/${functionName}`;
}

function getSupabaseAnonKey() {
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!anonKey) {
    throw new Error('Falta configurar VITE_SUPABASE_ANON_KEY para subir videos.');
  }
  return anonKey;
}

function normalizeVideoUploadError(error, fallbackMessage) {
  if (error?.name === 'AbortError') {
    return new Error('La subida del video tardo demasiado. Intenta de nuevo.');
  }
  if (error instanceof Error && error.message) {
    return error;
  }
  return new Error(fallbackMessage);
}

export function getProductVideoMaxBytes() {
  return DEFAULT_PRODUCT_VIDEO_MAX_BYTES;
}

export function validateProductVideoFile(file, { maxBytes = getProductVideoMaxBytes() } = {}) {
  if (!(file instanceof File) && !(file instanceof Blob)) {
    return 'Selecciona un video valido antes de subir.';
  }

  const mimeType = String(file?.type || '').trim().toLowerCase();
  if (!mimeType.startsWith('video/')) {
    return 'El archivo seleccionado no es un video valido.';
  }

  if (!ALLOWED_VIDEO_CONTENT_TYPES.has(mimeType)) {
    return 'Formato no soportado. Usa MP4, WEBM o MOV.';
  }

  const fileSize = Number(file?.size || 0);
  if (fileSize > maxBytes) {
    const maxMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    return `El video supera el maximo de ${maxMb} MB.`;
  }

  return null;
}

export async function createVideoUploadUrl({ businessId, productId, file, timeoutMs = DEFAULT_VIDEO_UPLOAD_TIMEOUT_MS }) {
  if (!(file instanceof Blob)) {
    throw new Error('Selecciona un video valido antes de subir.');
  }
  if (!businessId) {
    throw new Error('Falta el negocio para subir el video.');
  }
  if (!productId) {
    throw new Error('Falta el producto para subir el video.');
  }

  const validationError = validateProductVideoFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const token = await getValidToken();
  if (!token) {
    throw new Error('Tu sesion vencio. Vuelve a iniciar sesion para subir videos.');
  }

  const controller = new AbortController();
  const timeoutHost = typeof window !== 'undefined' ? window : globalThis;
  const timeoutId = timeoutHost.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(getSupabaseFunctionUrl('upload-video-r2'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify({
        businessId,
        productId,
        fileName: typeof file?.name === 'string' && file.name.trim() ? file.name.trim() : `video-${Date.now()}.mp4`,
        contentType: String(file?.type || '').trim().toLowerCase(),
        fileSize: Number(file?.size || 0),
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      throw new Error(payload?.error || payload?.message || 'No se pudo preparar la subida del video.');
    }

    if (typeof payload?.uploadUrl !== 'string' || !payload.uploadUrl.trim()) {
      throw new Error('La respuesta no incluyo una URL firmada valida para el video.');
    }
    if (typeof payload?.publicUrl !== 'string' || !payload.publicUrl.trim()) {
      throw new Error('La respuesta no incluyo una URL publica valida para el video.');
    }
    if (typeof payload?.objectKey !== 'string' || !payload.objectKey.trim()) {
      throw new Error('La respuesta no incluyo una ruta valida para el video.');
    }

    return {
      ok: true,
      uploadUrl: payload.uploadUrl.trim(),
      publicUrl: payload.publicUrl.trim(),
      objectKey: payload.objectKey.trim(),
      expiresIn: Number(payload?.expiresIn || 0) || null,
    };
  } catch (error) {
    throw normalizeVideoUploadError(error, 'No se pudo preparar la subida del video.');
  } finally {
    timeoutHost.clearTimeout(timeoutId);
  }
}

export async function uploadVideoDirectToR2(uploadUrl, file, { timeoutMs = DEFAULT_VIDEO_UPLOAD_TIMEOUT_MS } = {}) {
  if (!uploadUrl) {
    throw new Error('Falta la URL firmada para subir el video.');
  }

  const validationError = validateProductVideoFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const controller = new AbortController();
  const timeoutHost = typeof window !== 'undefined' ? window : globalThis;
  const timeoutId = timeoutHost.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': String(file?.type || 'video/mp4').trim().toLowerCase(),
      },
      body: file,
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new Error(responseText || `Error al subir el video al storage (${response.status}).`);
    }

    return { ok: true };
  } catch (error) {
    throw normalizeVideoUploadError(error, 'No se pudo subir el video a R2.');
  } finally {
    timeoutHost.clearTimeout(timeoutId);
  }
}

export async function replaceProductVideo({ file, product, businessId }) {
  const signedUpload = await createVideoUploadUrl({
    businessId,
    productId: product?.id,
    file,
  });

  await uploadVideoDirectToR2(signedUpload.uploadUrl, file);

  const { error } = await updateProduct(product.id, {
    videoUrl: signedUpload.publicUrl,
    videoPath: signedUpload.objectKey,
    videoThumbnailUrl: null,
    videoThumbnailPath: null,
  });

  if (error) {
    throw new Error(error.message || 'Error al guardar el video en la base de datos');
  }

  return {
    ok: true,
    publicUrl: signedUpload.publicUrl,
    objectKey: signedUpload.objectKey,
    video_url: signedUpload.publicUrl,
    video_path: signedUpload.objectKey,
    thumbnail_url: null,
    thumbnail_path: null,
  };
}

export async function removeProductVideo(productId, product) {
  const { error } = await updateProduct(productId, {
    videoUrl: null,
    videoThumbnailUrl: null,
    videoPath: null,
    videoThumbnailPath: null,
  });
  if (error) throw new Error(error.message || 'Error al limpiar el video en la base de datos');
  return { ok: true, removedVideoPath: product?.videoPath || null };
}
