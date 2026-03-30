/**
 * Capa de abstracción de IA — proveedor intercambiable por tarea.
 * (Paridad con la estructura solicitada: provider.ts + providers/*)
 */
import {
  getProviderIdForTask,
  getGeminiModel,
  getOpenAiModel,
  getAiProviderTimeoutMs,
  getSecondaryProviderId,
} from './config.js';
import { generateProductDescriptionGemini } from './providers/gemini.js';
import { generateProductDescriptionOpenAi } from './providers/openai.js';
import {
  shouldAttemptFallbackFromPrimaryError,
  summarizeAiError,
  hasProviderApiKeyConfigured,
} from './retryableError.js';

/**
 * @typedef {object} ProductDescriptionStructured
 * @property {string} title
 * @property {string} description
 * @property {string[]} benefits
 * @property {string} call_to_action
 * @property {string[]} hashtags
 */

/**
 * @typedef {object} GenerateProductDescriptionInput
 * @property {string} text - Texto base del usuario
 * @property {string} [productName]
 * @property {number} [maxDescriptionLength]
 * @property {string} [taskId] - default 'generateProductDescription'
 */

export const AI_TASKS = {
  GENERATE_PRODUCT_DESCRIPTION: 'generateProductDescription',
};

/**
 * Log visible: primary / fallback / final / fallback_used (sin cache; lo añade el controller).
 * @param {string} taskId
 * @param {string} phase
 * @param {object} p
 * @param {'gemini'|'openai'} p.primaryProvider
 * @param {'gemini'|'openai'} p.fallbackProvider
 * @param {'gemini'|'openai'|null} [p.finalProvider]
 * @param {boolean} p.fallback_used
 */
function logAiRouting(taskId, phase, p) {
  console.info(`[ai][routing] ${taskId} :: ${phase}`, {
    primaryProvider: p.primaryProvider,
    fallbackProvider: p.fallbackProvider,
    finalProvider: p.finalProvider ?? null,
    fallback_used: p.fallback_used,
  });
}

function buildSystemPrompt(maxDescChars) {
  return `Eres un optimizador de publicaciones para ventas online. Recibes un texto básico del usuario y devuelves datos estructurados para publicar el producto.

Reglas obligatorias:
- Corrige faltas de ortografía.
- Mejora la redacción y haz el texto más vendedor.
- NO inventes características que no estén en el texto original.
- NO agregues precios si no aparecen en el texto.
- Usa español claro y natural.
- Descripción ("description"): OBLIGATORIO máximo ${maxDescChars} caracteres (incluye espacios). Cuenta antes de responder.
- Título: corto y atractivo (máximo ~80 caracteres).
- Mantén siempre la información original; solo mejora la forma.

Campos del JSON de salida:
- "title", "description", "benefits" (array 2-4 strings), "call_to_action", "hashtags" (array 5-8 strings sin #).`;
}

function buildUserMessage(input) {
  const maxDescLen = Math.min(Math.max(Number(input.maxDescriptionLength) || 300, 50), 2000);
  const text = String(input.text || '').trim();
  const productName = String(input.productName || '').trim();
  if (!text && !productName) {
    throw new Error('[ai] text or productName is required');
  }
  if (text)
    return `Optimiza esta publicación para vender${productName ? ` (nombre de producto: ${productName})` : ''}. El campo "description" debe tener como máximo ${maxDescLen} caracteres (incluye espacios); no lo superes.\n\nTexto del usuario:\n${text}`;
  return `Genera un título y una descripción de producto para vender: "${productName}". El campo "description" debe tener como máximo ${maxDescLen} caracteres (incluye espacios); no lo superes.`;
}

/**
 * @param {'gemini'|'openai'} providerId
 * @param {object} ctx
 * @param {string} ctx.systemPrompt
 * @param {string} ctx.userMessage
 * @param {number} ctx.timeoutMs
 */
async function callProductDescriptionProvider(providerId, ctx) {
  const { systemPrompt, userMessage, timeoutMs } = ctx;
  if (providerId === 'openai') {
    const r = await generateProductDescriptionOpenAi({
      systemPrompt,
      userMessage,
      timeoutMs,
      model: getOpenAiModel(),
    });
    const data = normalizeProductDescription(r.parsed);
    return {
      provider: 'openai',
      model: r.model,
      durationMs: r.durationMs,
      usage: r.usage,
      data,
    };
  }
  const r = await generateProductDescriptionGemini({
    systemPrompt,
    userMessage,
    model: getGeminiModel(),
    timeoutMs,
  });
  const data = normalizeProductDescription(r.parsed);
  return {
    provider: 'gemini',
    model: r.model,
    durationMs: r.durationMs,
    usage: r.usage,
    data,
  };
}

/**
 * Punto de entrada común: genera descripción de producto estructurada.
 * El proveedor primario se elige por env (por task); si falla con error recuperable, se intenta el otro.
 *
 * @param {GenerateProductDescriptionInput} input
 * @returns {Promise<{
 *   provider: string,
 *   model: string,
 *   configuredProvider: string,
 *   fallbackUsed: boolean,
 *   primaryErrorSummary: string|null,
 *   durationMs: number,
 *   totalDurationMs: number,
 *   usage: object|null,
 *   data: ProductDescriptionStructured
 * }>}
 */
export async function generateProductDescription(input) {
  const taskId = input.taskId || AI_TASKS.GENERATE_PRODUCT_DESCRIPTION;
  const primaryId = getProviderIdForTask(taskId);
  const secondaryId = getSecondaryProviderId(primaryId);
  const maxDescChars = Math.min(Math.max(Number(input.maxDescriptionLength) || 300, 50), 2000);
  const systemPrompt = buildSystemPrompt(maxDescChars);
  const userMessage = buildUserMessage(input);
  const timeoutMs = getAiProviderTimeoutMs();
  const ctx = { systemPrompt, userMessage, timeoutMs };

  const started = Date.now();

  try {
    const result = await callProductDescriptionProvider(primaryId, ctx);
    const totalDurationMs = Date.now() - started;
    logAiRouting(taskId, 'primary_ok', {
      primaryProvider: primaryId,
      fallbackProvider: secondaryId,
      finalProvider: result.provider,
      fallback_used: false,
    });
    console.info('[ai] generateProductDescription timing', {
      taskId,
      model: result.model,
      durationMs: result.durationMs,
      totalDurationMs,
    });
    return {
      provider: result.provider,
      model: result.model,
      configuredProvider: primaryId,
      fallbackUsed: false,
      primaryErrorSummary: null,
      durationMs: result.durationMs,
      totalDurationMs,
      usage: result.usage,
      data: result.data,
    };
  } catch (primaryErr) {
    if (!shouldAttemptFallbackFromPrimaryError(primaryErr)) {
      throw primaryErr;
    }

    logAiRouting(taskId, 'primary_fail_recoverable', {
      primaryProvider: primaryId,
      fallbackProvider: secondaryId,
      finalProvider: null,
      fallback_used: false,
    });
    console.warn('[ai] primary provider failed', {
      task: taskId,
      primaryProvider: primaryId,
      fallbackProvider: secondaryId,
      error: summarizeAiError(primaryErr),
    });

    if (!hasProviderApiKeyConfigured(secondaryId)) {
      const keyName = secondaryId === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
      throw new Error(
        `[ai] Fallback unavailable: ${keyName} is not set. Primary error: ${summarizeAiError(primaryErr)}`,
      );
    }

    logAiRouting(taskId, 'fallback_start', {
      primaryProvider: primaryId,
      fallbackProvider: secondaryId,
      finalProvider: null,
      fallback_used: false,
    });

    try {
      const result = await callProductDescriptionProvider(secondaryId, ctx);
      const totalDurationMs = Date.now() - started;
      logAiRouting(taskId, 'fallback_ok', {
        primaryProvider: primaryId,
        fallbackProvider: secondaryId,
        finalProvider: result.provider,
        fallback_used: true,
      });
      console.info('[ai] fallback provider success timing', {
        taskId,
        model: result.model,
        durationMs: result.durationMs,
        totalDurationMs,
        primaryErrorSummary: summarizeAiError(primaryErr),
      });
      return {
        provider: result.provider,
        model: result.model,
        configuredProvider: primaryId,
        fallbackUsed: true,
        primaryErrorSummary: summarizeAiError(primaryErr),
        durationMs: result.durationMs,
        totalDurationMs,
        usage: result.usage,
        data: result.data,
      };
    } catch (fallbackErr) {
      logAiRouting(taskId, 'fallback_fail', {
        primaryProvider: primaryId,
        fallbackProvider: secondaryId,
        finalProvider: null,
        fallback_used: false,
      });
      console.error('[ai] fallback provider failed', {
        task: taskId,
        primaryProvider: primaryId,
        fallbackProvider: secondaryId,
        error: summarizeAiError(fallbackErr),
      });
      throw fallbackErr;
    }
  }
}

/**
 * @param {unknown} raw
 * @returns {ProductDescriptionStructured}
 */
function normalizeProductDescription(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  let description = typeof o.description === 'string' ? o.description.trim() : '';
  const benefits = Array.isArray(o.benefits)
    ? o.benefits.filter((b) => typeof b === 'string').map((b) => b.trim()).filter(Boolean)
    : [];
  const call_to_action = typeof o.call_to_action === 'string' ? o.call_to_action.trim() : '';
  const hashtags = Array.isArray(o.hashtags)
    ? o.hashtags.filter((h) => typeof h === 'string').map((h) => h.trim().replace(/^#/, '')).filter(Boolean).slice(0, 8)
    : [];
  if (!description) {
    throw new Error('[ai] Model returned empty description');
  }
  return { title, description, benefits, call_to_action, hashtags };
}
