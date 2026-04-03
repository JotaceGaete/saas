/**
 * Capa de abstracción de IA — proveedor intercambiable por tarea.
 * Fallback robusto: Gemini (timeout corto) → OpenAI (presupuesto restante).
 * Nunca cuelga la función: withTimeout actúa como red de seguridad externa
 * independientemente de si el SDK interno respeta el AbortSignal.
 */
import {
  getProviderIdForTask,
  getGeminiModel,
  getOpenAiModel,
  getAiProviderTimeoutMs,
  getGeminiTimeoutMs,
  getTotalAiTimeoutMs,
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

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Carrera entre una promesa y un timeout.
 * Actúa como red de seguridad externa si el SDK interno no honra el AbortSignal.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label - aparece en el mensaje de error para trazabilidad
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[ai] Provider timeout after ${ms}ms (${label})`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Log único y visible: primary / fallback / final / fallback_used.
 * @param {string} taskId
 * @param {string} phase
 * @param {object} p
 */
function logAiRouting(taskId, phase, p) {
  console.info(`[ai][routing] ${taskId} :: ${phase}`, {
    primaryProvider: p.primaryProvider,
    fallbackProvider: p.fallbackProvider,
    finalProvider: p.finalProvider ?? null,
    fallback_used: p.fallback_used,
    ...(p.reason != null ? { reason: p.reason } : {}),
    ...(p.elapsedMs != null ? { elapsedMs: p.elapsedMs } : {}),
    ...(p.timeoutMs != null ? { timeoutMs: p.timeoutMs } : {}),
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
 * Llama al proveedor indicado y normaliza la respuesta.
 * @param {'gemini'|'openai'} providerId
 * @param {{ systemPrompt: string, userMessage: string, timeoutMs: number }} ctx
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
    return {
      provider: 'openai',
      model: r.model,
      durationMs: r.durationMs,
      usage: r.usage,
      data: normalizeProductDescription(r.parsed),
    };
  }
  const r = await generateProductDescriptionGemini({
    systemPrompt,
    userMessage,
    model: getGeminiModel(),
    timeoutMs,
  });
  return {
    provider: 'gemini',
    model: r.model,
    durationMs: r.durationMs,
    usage: r.usage,
    data: normalizeProductDescription(r.parsed),
  };
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Genera descripción de producto estructurada con fallback garantizado.
 *
 * Flujo:
 *   1. Valida qué API keys están disponibles.
 *   2. Intenta el proveedor primario (Gemini: timeout corto; OpenAI primario: timeout normal).
 *   3. Si falla con error recuperable → fallback al secundario con el tiempo restante del presupuesto total.
 *   4. Si ambos fallan → error controlado (nunca timeout 504).
 *
 * @param {GenerateProductDescriptionInput} input
 */
export async function generateProductDescription(input) {
  const taskId = input.taskId || AI_TASKS.GENERATE_PRODUCT_DESCRIPTION;
  const primaryId = getProviderIdForTask(taskId);
  const secondaryId = getSecondaryProviderId(primaryId);
  const maxDescChars = Math.min(Math.max(Number(input.maxDescriptionLength) || 300, 50), 2000);

  const systemPrompt = buildSystemPrompt(maxDescChars);
  const userMessage = buildUserMessage(input);

  // Presupuestos de tiempo
  const totalBudgetMs = getTotalAiTimeoutMs();
  const geminiTimeoutMs = getGeminiTimeoutMs();   // corto: 4 s por defecto
  const openaiTimeoutMs = getAiProviderTimeoutMs(); // normal: 8 s por defecto

  const primaryTimeoutMs = primaryId === 'gemini' ? geminiTimeoutMs : openaiTimeoutMs;

  // Validación de keys upfront — falla rápido y con claridad
  const primaryKeyOk = hasProviderApiKeyConfigured(primaryId);
  const secondaryKeyOk = hasProviderApiKeyConfigured(secondaryId);

  console.info('[ai] generate-product-description start', {
    taskId,
    primaryProvider: primaryId,
    fallbackProvider: secondaryId,
    primaryKeyPresent: primaryKeyOk,
    fallbackKeyPresent: secondaryKeyOk,
    totalBudgetMs,
    primaryTimeoutMs,
  });

  if (!primaryKeyOk && !secondaryKeyOk) {
    const k1 = primaryId === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
    const k2 = secondaryId === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(`[ai] No AI provider available: ${k1} and ${k2} are both missing`);
  }

  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const remainingBudget = (reserved = 500) => Math.max(totalBudgetMs - elapsed() - reserved, 1000);

  // Captura el resumen del error primario para incluirlo en la respuesta fallback
  let primaryErrorSummary = null;

  // ── Intento primario ──────────────────────────────────────────────────────
  if (!primaryKeyOk) {
    const keyName = primaryId === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
    console.warn('[ai] primary provider skipped: missing key', {
      primaryProvider: primaryId,
      keyName,
    });
    logAiRouting(taskId, 'primary_skip_no_key', {
      primaryProvider: primaryId,
      fallbackProvider: secondaryId,
      fallback_used: false,
      reason: `${keyName} not set`,
    });
  } else {
    const ctx = { systemPrompt, userMessage, timeoutMs: primaryTimeoutMs };
    try {
      const result = await withTimeout(
        callProductDescriptionProvider(primaryId, ctx),
        primaryTimeoutMs,
        primaryId,
      );
      const totalDurationMs = elapsed();
      logAiRouting(taskId, 'primary_ok', {
        primaryProvider: primaryId,
        fallbackProvider: secondaryId,
        finalProvider: result.provider,
        fallback_used: false,
        elapsedMs: totalDurationMs,
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
      const summary = summarizeAiError(primaryErr);
      primaryErrorSummary = summary;
      const isRecoverable = shouldAttemptFallbackFromPrimaryError(primaryErr);

      logAiRouting(taskId, isRecoverable ? 'primary_fail_recoverable' : 'primary_fail_fatal', {
        primaryProvider: primaryId,
        fallbackProvider: secondaryId,
        fallback_used: false,
        reason: summary,
        elapsedMs: elapsed(),
      });
      console.warn('[ai] primary provider failed', {
        task: taskId,
        primaryProvider: primaryId,
        fallbackProvider: secondaryId,
        recoverable: isRecoverable,
        error: summary,
      });

      if (!isRecoverable) {
        throw primaryErr;
      }
      // sigue hacia el fallback
    }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  if (!secondaryKeyOk) {
    const keyName = secondaryId === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(
      `[ai] Fallback unavailable: ${keyName} is not set and primary provider also failed`,
    );
  }

  const fallbackBudgetMs = Math.min(remainingBudget(), openaiTimeoutMs);
  const fallbackCtx = { systemPrompt, userMessage, timeoutMs: fallbackBudgetMs };

  logAiRouting(taskId, 'fallback_start', {
    primaryProvider: primaryId,
    fallbackProvider: secondaryId,
    fallback_used: true,
    timeoutMs: fallbackBudgetMs,
    elapsedMs: elapsed(),
  });

  try {
    const result = await withTimeout(
      callProductDescriptionProvider(secondaryId, fallbackCtx),
      fallbackBudgetMs,
      secondaryId,
    );
    const totalDurationMs = elapsed();
    logAiRouting(taskId, 'fallback_ok', {
      primaryProvider: primaryId,
      fallbackProvider: secondaryId,
      finalProvider: result.provider,
      fallback_used: true,
      elapsedMs: totalDurationMs,
    });
    console.info('[ai] fallback provider success timing', {
      taskId,
      model: result.model,
      durationMs: result.durationMs,
      totalDurationMs,
    });
    return {
      provider: result.provider,
      model: result.model,
      configuredProvider: primaryId,
      fallbackUsed: true,
      primaryErrorSummary,
      durationMs: result.durationMs,
      totalDurationMs,
      usage: result.usage,
      data: result.data,
    };
  } catch (fallbackErr) {
    const totalDurationMs = elapsed();
    logAiRouting(taskId, 'fallback_fail', {
      primaryProvider: primaryId,
      fallbackProvider: secondaryId,
      fallback_used: true,
      reason: summarizeAiError(fallbackErr),
      elapsedMs: totalDurationMs,
    });
    console.error('[ai] both providers failed', {
      task: taskId,
      primaryProvider: primaryId,
      fallbackProvider: secondaryId,
      fallbackError: summarizeAiError(fallbackErr),
      totalDurationMs,
    });
    throw new Error(
      `[ai] All providers failed. Last error (${secondaryId}): ${summarizeAiError(fallbackErr)}`,
    );
  }
}

// ── normalization ─────────────────────────────────────────────────────────────

/**
 * @param {unknown} raw
 * @returns {ProductDescriptionStructured}
 */
function normalizeProductDescription(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  const description = typeof o.description === 'string' ? o.description.trim() : '';
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
