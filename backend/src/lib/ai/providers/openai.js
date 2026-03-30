/**
 * Proveedor OpenAI (HTTP). No añade dependencia openai; usa OPENAI_API_KEY.
 * Misma forma estructurada que Gemini para mantener respuesta estable.
 */
import { getOpenAiModel } from '../config.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const PRODUCT_DESCRIPTION_JSON_SCHEMA = {
  name: 'product_description',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      benefits: { type: 'array', items: { type: 'string' } },
      call_to_action: { type: 'string' },
      hashtags: { type: 'array', items: { type: 'string' } },
    },
    required: ['title', 'description', 'benefits', 'call_to_action', 'hashtags'],
  },
  strict: true,
};

/**
 * @param {object} input
 * @param {string} input.systemPrompt
 * @param {string} input.userMessage
 * @param {string} [input.model]
 * @param {number} [input.timeoutMs]
 * @returns {Promise<{ parsed: import('../provider.js').ProductDescriptionStructured, rawText: string, usage: object|null, model: string, durationMs: number }>}
 */
export async function generateProductDescriptionOpenAi(input) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('[ai/openai] Missing OPENAI_API_KEY');
  }

  const model = input.model || getOpenAiModel();
  const timeoutMs = Number(input.timeoutMs) > 0 ? Number(input.timeoutMs) : 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const started = Date.now();
  let res;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.6,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userMessage },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: PRODUCT_DESCRIPTION_JSON_SCHEMA,
        },
      }),
    });
  } catch (e) {
    if (e?.name === 'AbortError' || controller.signal.aborted) {
      throw new Error(`[ai/openai] Provider timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - started;
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`[ai/openai] HTTP ${res.status}: ${bodyText.slice(0, 400)}`);
  }

  /** @type {{ choices?: Array<{ message?: { content?: string } }>, usage?: object }} */
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (e) {
    throw new Error(`[ai/openai] Invalid JSON: ${e?.message || e}`);
  }

  const rawText = body?.choices?.[0]?.message?.content || '';
  const usage = body.usage
    ? {
        prompt_tokens: body.usage.prompt_tokens ?? null,
        completion_tokens: body.usage.completion_tokens ?? null,
        total_tokens: body.usage.total_tokens ?? null,
      }
    : null;

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`[ai/openai] Model content not JSON: ${e?.message || e}`);
  }

  return {
    parsed: /** @type {import('../provider.js').ProductDescriptionStructured} */ (parsed),
    rawText,
    usage,
    model,
    durationMs,
  };
}
