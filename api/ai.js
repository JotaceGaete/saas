/**
 * POST /api/v1/ai/generate-product-description
 * Capa IA intercambiable (Gemini / OpenAI) vía backend/src/lib/ai.
 */
import { aiGenerateProductDescriptionController } from '../backend/src/controllers/aiGenerateProductDescriptionController.js';

export async function POST(request) {
  const path = new URL(request.url).pathname;
  const normalized = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  if (
    normalized.endsWith('/api/v1/ai/generate-product-description')
    || path.endsWith('/api/v1/ai/generate-product-description')
  ) {
    return aiGenerateProductDescriptionController(request);
  }
  return new Response(JSON.stringify({ ok: false, error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
