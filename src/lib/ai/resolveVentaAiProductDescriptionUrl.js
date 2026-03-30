/**
 * Backend canónico: POST /api/v1/ai/generate-product-description
 * (product editor, business configuration, etc.)
 *
 * @see VITE_AI_PRODUCT_DESCRIPTION_URL
 * @deprecated Fallback edge: Supabase `improve-product-description` solo si useVentaAi es false (p. ej. dev local sin API).
 */

export const CANONICAL_AI_PRODUCT_DESCRIPTION_URL =
  'https://go.ventalink.app/api/v1/ai/generate-product-description';

/**
 * @returns {{ ventaAiUrl: string, useVentaAi: boolean }}
 */
export function resolveVentaAiProductDescriptionEndpoint() {
  const fromEnv = (import.meta.env?.VITE_AI_PRODUCT_DESCRIPTION_URL ?? '').trim();
  const ventaAiUrl =
    fromEnv || (import.meta.env.PROD ? CANONICAL_AI_PRODUCT_DESCRIPTION_URL : '');
  const useVentaAi = Boolean(ventaAiUrl);
  return { ventaAiUrl, useVentaAi };
}
