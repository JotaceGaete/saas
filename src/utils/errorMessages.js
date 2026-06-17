/**
 * errorMessages.js — capa central de mensajes de error para el usuario.
 *
 * Reglas:
 * - NUNCA mostrar JSON crudo, XML, stack trace ni mensajes técnicos de Supabase al usuario.
 * - SIEMPRE loguear el error técnico completo con console.error para debugging.
 * - Incluir errorId en el log y en el mensaje al usuario para soporte.
 */

// ── Mapas de clasificación ──────────────────────────────────────────────────

const HTTP_STATUS_MESSAGES = {
  400: 'Los datos enviados no son válidos. Revisa el formulario e intenta nuevamente.',
  401: 'Tu sesión expiró. Cierra sesión y vuelve a ingresar.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No encontramos lo que buscabas. Puede haber sido eliminado.',
  408: 'La operación tardó demasiado. Verifica tu conexión e intenta nuevamente.',
  409: 'Hubo un conflicto con los datos. Recarga la página e intenta nuevamente.',
  413: 'El archivo es demasiado pesado. Intenta con uno más pequeño.',
  422: 'Los datos no son válidos. Revisa la información e intenta nuevamente.',
  429: 'Demasiados intentos seguidos. Espera un momento e intenta nuevamente.',
  500: 'Hubo un error en el servidor. Intenta nuevamente en unos minutos.',
  502: 'El servidor no está disponible en este momento. Intenta en unos minutos.',
  503: 'El servicio está temporalmente no disponible. Intenta en unos minutos.',
  504: 'El servidor tardó demasiado en responder. Intenta nuevamente.',
};

const R2_XML_CODE_MESSAGES = {
  EntityTooLarge:     'La imagen es demasiado pesada para subir. Usa una foto más liviana (menos de 10 MB).',
  RequestTimeout:     'La subida tardó demasiado. Verifica tu conexión e intenta nuevamente.',
  AccessDenied:       'No tienes permiso para subir esta imagen. Recarga la página e intenta de nuevo.',
  NoSuchBucket:       'Error de configuración del servidor. Contacta a soporte.',
  SlowDown:           'Demasiadas solicitudes. Espera un momento e intenta nuevamente.',
  ServiceUnavailable: 'El servidor de imágenes no está disponible. Intenta en unos minutos.',
};

const SUPABASE_ERROR_CODE_MESSAGES = {
  PGRST116: 'No encontramos los datos solicitados.',
  '23505':   'Ya existe un registro con esos datos. Verifica e intenta nuevamente.',
  '23503':   'No se puede realizar esta acción porque hay datos relacionados.',
  '42501':   'No tienes permiso para realizar esta acción.',
  PGRST301: 'Tu sesión expiró. Cierra sesión y vuelve a ingresar.',
};

// ── Extracción de información del error ────────────────────────────────────

function extractHttpStatus(error) {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status ?? null;
  if (typeof status === 'number' && status >= 100) return status;

  const msg = String(error?.message || '');
  const match = msg.match(/\b(4\d{2}|5\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function parseR2XmlCode(text) {
  if (!text || !text.includes('<?xml') && !text.includes('<Error>')) return null;
  try {
    return text.match(/<Code>([^<]+)<\/Code>/)?.[1]?.trim() ?? null;
  } catch { return null; }
}

function looksLikeJson(str) {
  const s = str.trim();
  return (s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'));
}

function looksLikeXml(str) {
  return str.trim().startsWith('<');
}

function looksLikeTechnical(str) {
  if (!str) return false;
  if (looksLikeJson(str)) return true;
  if (looksLikeXml(str)) return true;
  if (str.includes('at Object.') || str.includes('at async ')) return true; // stack trace
  if (str.length > 300 && /[{}\[\]<>]/.test(str)) return true;
  return false;
}

// ── Clasificación principal ────────────────────────────────────────────────

/**
 * Convierte cualquier error en un mensaje claro para el usuario.
 *
 * @param {unknown} error  — el error original (Error, objeto, string, etc.)
 * @param {string}  fallback — mensaje de fallback si no se puede clasificar
 * @returns {string} mensaje en español, nunca técnico
 */
export function getFriendlyErrorMessage(error, fallback = 'Ocurrió un error inesperado. Intenta nuevamente.') {
  if (!error) return fallback;

  const name    = String(error?.name    || '');
  const message = String(error?.message || error || '');
  const code    = String(error?.code    || error?.error_code || '');
  const hint    = String(error?.hint    || '');
  const details = String(error?.details || '');

  // 1. Network / CORS / offline
  if (name === 'TypeError' || message.toLowerCase().includes('failed to fetch') || message.toLowerCase().includes('networkerror')) {
    return 'No pudimos conectar con el servidor. Revisa tu internet e intenta nuevamente.';
  }

  // 2. Timeout / abort
  if (name === 'AbortError' || message.toLowerCase().includes('timeout') || message.toLowerCase().includes('timed out') || message.toLowerCase().includes('tardó demasiado') || message.toLowerCase().includes('tardo demasiado')) {
    return 'La operación tardó demasiado. Intenta con una imagen más liviana o revisa tu conexión.';
  }

  // 3. R2 / S3 XML
  const r2Code = parseR2XmlCode(message) || parseR2XmlCode(details);
  if (r2Code && R2_XML_CODE_MESSAGES[r2Code]) return R2_XML_CODE_MESSAGES[r2Code];
  if (r2Code) return `Error en el servidor de imágenes (${r2Code}). Intenta nuevamente.`;

  // 4. HTTP status directo
  const status = extractHttpStatus(error);
  if (status) {
    // 401 / JWT
    if (status === 401 || message.includes('JWT') || message.includes('invalid_jwt') || message.includes('not authenticated') || message.includes('session')) {
      return 'Tu sesión expiró. Cierra sesión y vuelve a ingresar.';
    }
    if (HTTP_STATUS_MESSAGES[status]) return HTTP_STATUS_MESSAGES[status];
  }

  // 5. Mensajes que contienen palabras clave de auth
  if (message.includes('JWT') || message.includes('not authenticated') || message.includes('session expired') || message.includes('sesion vencio') || message.includes('sesión venció') || message.includes('payer_email_missing')) {
    return 'Tu sesión expiró. Cierra sesión y vuelve a ingresar.';
  }

  // 6. Permiso / RLS
  if (message.includes('permission denied') || message.includes('RLS') || message.includes('Forbidden') || message.includes('access denied') || code === '42501' || status === 403) {
    return 'No tienes permiso para realizar esta acción.';
  }

  // 7. Mercado Pago
  if (message.includes('init_point') || message.includes('Mercado Pago') || message.includes('mercadopago') || message.includes('mp_missing')) {
    return 'No pudimos conectar con Mercado Pago. Intenta nuevamente en unos minutos.';
  }

  // 8. Archivo pesado (413 / EntityTooLarge en texto)
  if (status === 413 || message.includes('EntityTooLarge') || message.includes('too large') || message.includes('demasiado pesad') || message.includes('supera el maximo') || message.includes('supera el máximo')) {
    return 'El archivo es demasiado pesado. Intenta con una imagen más pequeña (menos de 10 MB).';
  }

  // 9. Storage / imágenes
  if (message.includes('R2') || message.includes('storage') || message.includes('upload') || message.includes('subir la imagen') || message.includes('signed url') || message.includes('uploadUrl')) {
    return 'No pudimos subir la imagen. Puede estar muy pesada o tu conexión está lenta. Prueba con una foto más liviana.';
  }

  // 10. Códigos de Supabase/Postgres
  if (code && SUPABASE_ERROR_CODE_MESSAGES[code]) return SUPABASE_ERROR_CODE_MESSAGES[code];

  // 11. Si el mensaje ES legible en español y no técnico, usarlo directamente
  if (message && !looksLikeTechnical(message) && message.length < 200) {
    return message;
  }

  // 12. Si el mensaje PARECE técnico (JSON, XML, stack), no mostrarlo
  if (looksLikeTechnical(message)) return fallback;

  return fallback;
}

/**
 * Normaliza cualquier error en un objeto estándar con errorId para soporte.
 *
 * @param {unknown} error
 * @param {string}  context — nombre del contexto (ej. 'product-editor', 'checkout')
 * @returns {{ friendlyMessage: string, errorId: string, technicalDetail: string }}
 */
export function normalizeAppError(error, context = '') {
  const errorId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().slice(0, 8).toUpperCase()
    : Date.now().toString(36).toUpperCase();

  const technicalDetail = buildTechnicalDetail(error);
  const friendlyMessage = getFriendlyErrorMessage(error);

  console.error(`[AppError${context ? ':' + context : ''}] id=${errorId}`, {
    errorId,
    message: error?.message || String(error || ''),
    name:    error?.name,
    code:    error?.code || error?.error_code,
    status:  extractHttpStatus(error),
    hint:    error?.hint,
    details: error?.details,
    stack:   error?.stack?.slice?.(0, 500),
  });

  return { friendlyMessage, errorId, technicalDetail };
}

function buildTechnicalDetail(error) {
  if (!error) return '';
  const parts = [];
  if (error?.name)    parts.push(`Tipo: ${error.name}`);
  if (error?.message) parts.push(`Mensaje: ${error.message}`);
  if (error?.code || error?.error_code) parts.push(`Código: ${error.code || error.error_code}`);
  if (error?.status || error?.statusCode) parts.push(`HTTP: ${error.status || error.statusCode}`);
  if (error?.hint)    parts.push(`Sugerencia: ${error.hint}`);
  if (error?.details) parts.push(`Detalles: ${error.details}`);
  return parts.join('\n') || String(error);
}
