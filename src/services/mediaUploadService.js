const DEFAULT_UPLOAD_TIMEOUT_MS = 30000;
const DEFAULT_PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function getMediaServiceBaseUrl() {
  const baseUrl = String(import.meta.env.VITE_MEDIA_SERVICE_URL || '').trim().replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error('Falta configurar VITE_MEDIA_SERVICE_URL para subir imagenes.');
  }
  return baseUrl;
}

function normalizeMediaUploadError(error, fallbackMessage) {
  if (error?.name === 'AbortError') {
    return new Error('La subida tardo demasiado. Intenta de nuevo.');
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

export async function uploadImageToMediaService({
  file,
  type,
  businessId,
  productId,
  timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
}) {
  if (!(file instanceof Blob)) {
    throw new Error('Selecciona una imagen valida antes de subir.');
  }
  if (!type) {
    throw new Error('Falta el tipo de subida.');
  }
  if (!businessId) {
    throw new Error('Falta el negocio para subir la imagen.');
  }
  if (!productId) {
    throw new Error('Falta el producto para subir la imagen.');
  }

  const controller = new AbortController();
  const timeoutHost = typeof window !== 'undefined' ? window : globalThis;
  const timeoutId = timeoutHost.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    formData.append('businessId', businessId);
    formData.append('productId', productId);

    const response = await fetch(`${getMediaServiceBaseUrl()}/upload-image`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error('El servidor devolvio una respuesta invalida al subir la imagen.');
    }

    if (!response.ok) {
      const message =
        payload?.error ||
        payload?.message ||
        `Error del servidor al subir la imagen (${response.status}).`;
      throw new Error(message);
    }

    if (payload?.ok !== true) {
      throw new Error(payload?.error || payload?.message || 'La subida de la imagen no fue aceptada.');
    }

    if (typeof payload?.url !== 'string' || !payload.url.trim()) {
      throw new Error('La respuesta del servidor no incluyo una URL de imagen valida.');
    }

    return {
      ok: true,
      url: payload.url.trim(),
      key: typeof payload?.key === 'string' ? payload.key.trim() : '',
      contentType: typeof payload?.contentType === 'string' ? payload.contentType.trim() : '',
      size: Number.isFinite(Number(payload?.size)) ? Number(payload.size) : null,
    };
  } catch (error) {
    throw normalizeMediaUploadError(error, 'No se pudo subir la imagen al servidor de media.');
  } finally {
    timeoutHost.clearTimeout(timeoutId);
  }
}
