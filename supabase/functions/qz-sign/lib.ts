/**
 * qz-sign — lógica pura (sin `Deno` a nivel de módulo, ver
 * _shared/supabaseAdminKey.ts para el mismo criterio) para firmar
 * solicitudes de QZ Tray. Responsabilidad ÚNICA: recibir el string exacto
 * que QZ Tray pide firmar y devolver la firma RSA-SHA512 en base64,
 * usando una clave privada que esta función NUNCA genera, guarda ni
 * expone -- solo la recibe como parámetro (en index.ts viene de
 * `Deno.env.get('QZ_SIGN_PRIVATE_KEY')`, un secreto de la Edge Function).
 *
 * Nada de esto conoce ventas, ESC/POS, ni el PrinterProvider -- ver
 * auditoría PRINT-3A: la firma QZ es una preocupación completamente
 * separada de imprimir un ticket.
 */

/** Algoritmo pedido por PRINT-3A: qz.security.setSignatureAlgorithm("SHA512"). */
export const QZ_SIGNATURE_ALGORITHM = 'SHA512';
/** Nombre real en Web Crypto (Deno y Node lo comparten) para ese mismo algoritmo. */
const WEBCRYPTO_HASH = 'SHA-512';

const ALLOWED_ORIGINS = [
  'https://walinka.com',
  'https://www.walinka.com',
  'https://go.ventalink.app',
  'https://ventalink.app',
  'https://www.ventalink.app',
  'http://localhost:4028',
  // Legacy / regionales (fronts antiguos o previews) -- mismo allowlist
  // que supabase/functions/improve-product-description/index.ts.
  'https://ar.ventalink.app',
  'https://cl.ventalink.app',
];

/** Mismo criterio que improve-product-description: allowlist fija + *.vercel.app para previews. */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    return new URL(origin).hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

export function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = isAllowedOrigin(origin) ? (origin as string) : 'https://go.ventalink.app';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

/**
 * Extrae el string exacto a firmar del body ya parseado. Nunca lo
 * transforma/normaliza -- QZ Tray verifica la firma contra sus propios
 * bytes (en la práctica, un hash SHA-256 en hex del JSON
 * {call,params,timestamp}, no el JSON en sí -- ver qz-tray.js
 * `_qz.websocket.connection.sendData`), así que firmar una versión
 * "limpiada" del string produciría una firma que QZ rechaza igual que si
 * no se hubiera firmado nada.
 */
export function extractSignPayload(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as Record<string, unknown>).request;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * PRINT-3A-BUG1: normaliza secuencias `\n` LITERALES (backslash + n, dos
 * caracteres) a saltos de línea reales antes de quitar el encabezado/pie
 * PEM. Es un no-op si el secreto ya tiene saltos de línea reales -- pero
 * si se configuró (p. ej. pegado en un panel que escapa saltos de línea)
 * con `\n` literales, sin esto la base64 queda corrupta y
 * crypto.subtle.importKey falla con un error que no dice por qué.
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export class QzSignError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Firma `message` con la clave privada PEM (PKCS#8) provista, usando
 * RSASSA-PKCS1-v1_5 + SHA-512 (equivalente Web Crypto de
 * qz.security.setSignatureAlgorithm("SHA512")). Usa Web Crypto
 * (`crypto.subtle`), disponible tanto en Deno como en Node -- por eso este
 * archivo es testeable con datos reales en Vitest, sin mockear la firma.
 */
export async function signWithPrivateKey(privateKeyPem: string, message: string): Promise<string> {
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      pemToArrayBuffer(privateKeyPem),
      { name: 'RSASSA-PKCS1-v1_5', hash: WEBCRYPTO_HASH },
      false,
      ['sign'],
    );
  } catch (err) {
    throw new QzSignError(
      'INVALID_PRIVATE_KEY',
      `La clave privada configurada no es una clave PKCS#8 válida: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let signatureBuffer: ArrayBuffer;
  try {
    signatureBuffer = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(message),
    );
  } catch (err) {
    throw new QzSignError(
      'SIGN_FAILED',
      `La clave importó correctamente pero crypto.subtle.sign falló: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const signature = arrayBufferToBase64(signatureBuffer);
  if (!signature) {
    throw new QzSignError('EMPTY_SIGNATURE', 'La firma calculada quedó vacía.');
  }
  return signature;
}
