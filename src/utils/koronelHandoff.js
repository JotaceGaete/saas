/**
 * Fase 2: recibir el handoff de Koronel (source=koronel&koronel_business_id=...)
 * y preservarlo a través del login hasta que Walinka pueda completar el vínculo
 * real vía la RPC `request_business_walinka_link` (creada en la migración de Koronel).
 *
 * Nunca se pasa el JWT por la URL: solo datos no sensibles del negocio en Koronel.
 */

const STORAGE_KEY = 'walinka_koronel_handoff_v1';
const OPTIONAL_FIELDS = ['name', 'whatsapp', 'address', 'city', 'category'];

function getDefaultStorage() {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Parsea un query string (o `location.search`) y devuelve el payload de handoff
 * si `source=koronel` y `koronel_business_id` están presentes, o `null` si no aplica.
 */
export function parseKoronelParams(search) {
  const params = new URLSearchParams(search || '');
  if (params.get('source') !== 'koronel') return null;

  const koronelBusinessId = params.get('koronel_business_id');
  if (!koronelBusinessId) return null;

  const payload = { source: 'koronel', koronelBusinessId };
  OPTIONAL_FIELDS.forEach((field) => {
    const value = params.get(field);
    if (value) payload[field] = value;
  });
  return payload;
}

/**
 * Lee `search` (por defecto `window.location.search`) y, si trae un handoff de
 * Koronel válido, lo persiste en `storage` (por defecto `sessionStorage`) para
 * que sobreviva a un redirect completo de página (login, OAuth de Google, etc.).
 */
export function captureKoronelHandoff(search, storage = getDefaultStorage()) {
  const rawSearch = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const parsed = parseKoronelParams(rawSearch);
  if (!parsed) return null;

  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch (err) {
      console.warn('[koronel-handoff] failed to persist params', err);
    }
  }
  return parsed;
}

/** Devuelve el handoff de Koronel guardado, o `null` si no hay ninguno. */
export function getKoronelHandoff(storage = getDefaultStorage()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[koronel-handoff] failed to read stored params', err);
    return null;
  }
}

/** Limpia el handoff guardado (tras conectar, omitir, o descartarlo). */
export function clearKoronelHandoff(storage = getDefaultStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[koronel-handoff] failed to clear stored params', err);
  }
}
