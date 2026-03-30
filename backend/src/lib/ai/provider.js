/**
 * Capa de abstracción de IA — proveedor intercambiable por tarea.
 * (Paridad con la estructura solicitada: provider.ts + providers/*)
 */
import { getProviderIdForTask, getGeminiModel, getAiProviderTimeoutMs } from './config.js';
import { generateProductDescriptionGemini } from './providers/gemini.js';
import { generateProductDescriptionOpenAi } from './providers/openai.js';

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
 * Punto de entrada común: genera descripción de producto estructurada.
 * El proveedor se elige por env (por task), sin hardcodear Gemini a nivel de app.
 *
 * @param {GenerateProductDescriptionInput} input
 * @returns {Promise<{ provider: string, model: string, durationMs: number, usage: object|null, data: ProductDescriptionStructured }>}
 */
export async function generateProductDescription(input) {
  const taskId = input.taskId || AI_TASKS.GENERATE_PRODUCT_DESCRIPTION;
  const providerId = getProviderIdForTask(taskId);
  const maxDescChars = Math.min(Math.max(Number(input.maxDescriptionLength) || 300, 50), 2000);
  const systemPrompt = buildSystemPrompt(maxDescChars);
  const userMessage = buildUserMessage(input);
  const timeoutMs = getAiProviderTimeoutMs();

  if (providerId === 'openai') {
    const r = await generateProductDescriptionOpenAi({
      systemPrompt,
      userMessage,
      timeoutMs,
    });
    console.info('[ai] generateProductDescription', {
      taskId,
      provider: 'openai',
      model: r.model,
      durationMs: r.durationMs,
      usage: r.usage,
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
  console.info('[ai] generateProductDescription', {
    taskId,
    provider: 'gemini',
    model: r.model,
    durationMs: r.durationMs,
    usage: r.usage,
  });
  return {
    provider: 'gemini',
    model: r.model,
    durationMs: r.durationMs,
    usage: r.usage,
    data: normalizeProductDescription(r.parsed),
  };
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
