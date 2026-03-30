/**
 * Proveedor Gemini (@google/genai). Solo servidor; usa GEMINI_API_KEY.
 */
import { GoogleGenAI, Type } from '@google/genai';

/**
 * @param {object} input
 * @param {string} input.systemPrompt
 * @param {string} input.userMessage
 * @param {string} [input.model]
 * @param {number} [input.timeoutMs]
 * @returns {Promise<{ parsed: import('../provider.js').ProductDescriptionStructured, rawText: string, usage: object|null, model: string, durationMs: number }>}
 */
export async function generateProductDescriptionGemini(input) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('[ai/gemini] Missing GEMINI_API_KEY');
  }

  const model = input.model || String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const ai = new GoogleGenAI({ apiKey });

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Título corto del producto' },
      description: { type: Type.STRING, description: 'Descripción comercial' },
      benefits: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: '2 a 4 beneficios',
      },
      call_to_action: { type: Type.STRING },
      hashtags: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Hashtags sin #',
      },
    },
    required: ['title', 'description', 'benefits', 'call_to_action', 'hashtags'],
  };

  const timeoutMs = Number(input.timeoutMs) > 0 ? Number(input.timeoutMs) : 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const started = Date.now();
  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: input.userMessage,
      config: {
        systemInstruction: input.systemPrompt,
        temperature: 0.6,
        responseMimeType: 'application/json',
        responseSchema,
        abortSignal: controller.signal,
      },
    });
  } catch (e) {
    if (e?.name === 'AbortError' || controller.signal.aborted) {
      throw new Error(`[ai/gemini] Provider timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - started;
  const rawText = response.text || '';
  const usage = response.usageMetadata
    ? {
        promptTokenCount: response.usageMetadata.promptTokenCount ?? null,
        candidatesTokenCount: response.usageMetadata.candidatesTokenCount ?? null,
        totalTokenCount: response.usageMetadata.totalTokenCount ?? null,
      }
    : null;

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`[ai/gemini] Invalid JSON from model: ${e?.message || e}`);
  }

  return {
    parsed: /** @type {import('../provider.js').ProductDescriptionStructured} */ (parsed),
    rawText,
    usage,
    model,
    durationMs,
  };
}
