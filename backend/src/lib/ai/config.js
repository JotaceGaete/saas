/**
 * Configuración central de IA (sin acoplar un proveedor en el resto del código).
 * @see backend/src/lib/ai/provider.js
 */

/** @type {Readonly<'gemini'|'openai'>} */
export const DEFAULT_AI_PROVIDER = 'gemini';

/**
 * Proveedor por tarea. Env: AI_TASK_<TASK>_PROVIDER = gemini | openai
 * Ej.: AI_TASK_GENERATE_PRODUCT_DESCRIPTION_PROVIDER=gemini
 */
export function getProviderIdForTask(taskId) {
  const key = String(taskId || '')
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toUpperCase();
  /** p.ej. generateProductDescription → GENERATE_PRODUCT_DESCRIPTION */
  const envKey = `AI_TASK_${key}_PROVIDER`;
  const raw = process.env[envKey] || process.env.AI_DEFAULT_PROVIDER || DEFAULT_AI_PROVIDER;
  const v = String(raw).trim().toLowerCase();
  if (v === 'openai' || v === 'gemini') return v;
  return DEFAULT_AI_PROVIDER;
}

export function getGeminiModel() {
  return String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
}

export function getOpenAiModel() {
  return String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
}

/**
 * Resuelve proveedor y modelo que se usarán para una tarea (misma lógica que generateProductDescription).
 * Necesario para cache keys y logs antes de llamar al modelo.
 *
 * @param {string} taskId - p.ej. generateProductDescription
 * @returns {{ providerId: 'gemini'|'openai', model: string }}
 */
export function resolveProviderAndModelForTask(taskId) {
  const providerId = getProviderIdForTask(taskId);
  const model = providerId === 'openai' ? getOpenAiModel() : getGeminiModel();
  return { providerId, model };
}

/** Timeout de llamada al proveedor (ms). Env: AI_PROVIDER_TIMEOUT_MS (default 8000). */
export function getAiProviderTimeoutMs() {
  const n = Number(process.env.AI_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 1000 && n <= 120_000 ? Math.floor(n) : 8000;
}
