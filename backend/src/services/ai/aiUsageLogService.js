import { createClient } from '@supabase/supabase-js';

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function getAdminClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Extrae tokens de usageMetadata (Gemini / OpenAI) para columnas numéricas.
 * @param {object|null|undefined} usage
 */
function extractTokenCounts(usage) {
  if (!usage || typeof usage !== 'object') {
    return { prompt_tokens: null, completion_tokens: null, total_tokens: null };
  }
  if (usage.prompt_tokens != null || usage.total_tokens != null) {
    return {
      prompt_tokens: usage.prompt_tokens ?? null,
      completion_tokens: usage.completion_tokens ?? null,
      total_tokens: usage.total_tokens ?? null,
    };
  }
  if (usage.promptTokenCount != null || usage.totalTokenCount != null) {
    return {
      prompt_tokens: usage.promptTokenCount ?? null,
      completion_tokens: usage.candidatesTokenCount ?? null,
      total_tokens: usage.totalTokenCount ?? null,
    };
  }
  return { prompt_tokens: null, completion_tokens: null, total_tokens: null };
}

/**
 * @param {object} row
 * @param {string} row.businessId
 * @param {string} row.userId
 * @param {string} row.feature
 * @param {string} row.provider
 * @param {string} row.model
 * @param {boolean} row.cached
 * @param {object|null} [row.usage]
 * @param {string|null} [row.productId]
 */
export async function insertAiUsageLog(row) {
  const admin = getAdminClient();
  if (!admin) {
    console.warn('[ai-usage-log] skip: no admin client');
    return;
  }
  const tokens = extractTokenCounts(row.usage);
  const { error } = await admin.from('wa_ai_usage_log').insert({
    business_id: row.businessId,
    user_id: row.userId,
    feature: row.feature,
    provider: row.provider,
    model: row.model,
    cached: row.cached === true,
    prompt_tokens: tokens.prompt_tokens,
    completion_tokens: tokens.completion_tokens,
    total_tokens: tokens.total_tokens,
    usage_metadata: row.usage ?? null,
    product_id: row.productId || null,
  });
  if (error) {
    console.error('[ai-usage-log] insert failed', error.message);
  }
}
