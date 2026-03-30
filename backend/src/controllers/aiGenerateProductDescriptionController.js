import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { HttpError, isHttpError } from '../lib/http/HttpError.js';
import { requireAuthenticatedUser } from '../services/auth/requestAuthService.js';
import { assertBusinessOwnership } from '../services/billing/ownershipService.js';
import { getEffectivePlanSlug } from '../lib/billing/effectivePlan.js';
import { generateProductDescription, AI_TASKS } from '../lib/ai/provider.js';
import { assertGenerateProductDescriptionPlanPolicy } from '../lib/ai/planPolicy.js';
import { resolveProviderAndModelForTask } from '../lib/ai/config.js';
import { insertAiUsageLog } from '../services/ai/aiUsageLogService.js';
import { consumeGenerateProductDescriptionSlot } from '../lib/ai/rateLimit.js';

const FEATURE_LOG_KEY = 'generate_product_description';

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function getAdminClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new HttpError(503, '[ai] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function handleError(err, fallbackMessage) {
  const message = String(err?.message || '');
  if (message.includes('[auth] Missing Bearer token') || message.includes('[auth] Invalid or expired user token')) {
    return json({ ok: false, code: 'AUTH_REQUIRED', error: message || '[auth] Unauthorized' }, 401);
  }
  if (isHttpError(err)) {
    return json(
      {
        ok: false,
        code: err?.code || null,
        error: err.message,
        details: err?.details || null,
      },
      err.statusCode,
    );
  }
  const msg = String(err?.message || '');
  if (msg.includes('Provider timeout')) {
    return json({ ok: false, code: 'AI_PROVIDER_TIMEOUT', error: msg }, 504);
  }
  return json({ ok: false, error: err?.message || fallbackMessage }, 503);
}

/** Hash de entrada de negocio + contenido + límites + proveedor/modelo (alineado con generate). */
function computeContentInputHash({ text, productName, maxDescriptionLength }) {
  const stable = JSON.stringify({
    t: String(text || '').trim(),
    n: String(productName || '').trim(),
    m: Number(maxDescriptionLength) || 300,
  });
  return createHash('sha256').update(stable, 'utf8').digest('hex');
}

/**
 * Clave de cache: businessId + input canónico + provider + model (64 hex).
 */
function computeCacheKey({ businessId, text, productName, maxDescriptionLength, providerId, model }) {
  const stable = JSON.stringify({
    businessId: String(businessId || '').trim(),
    inputHash: computeContentInputHash({ text, productName, maxDescriptionLength }),
    provider: String(providerId || '').trim().toLowerCase(),
    model: String(model || '').trim(),
  });
  return createHash('sha256').update(stable, 'utf8').digest('hex');
}

/**
 * POST /api/v1/ai/generate-product-description
 */
export async function aiGenerateProductDescriptionController(request) {
  const routeStart = Date.now();
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await readJsonBody(request);
    const businessId = String(body?.businessId || '').trim();
    const productId = body?.productId != null ? String(body.productId).trim() : '';
    const text = body?.text != null ? String(body.text) : '';
    const productName = body?.productName != null ? String(body.productName) : '';
    const maxDescriptionLength = body?.maxDescriptionLength != null ? Number(body.maxDescriptionLength) : 300;

    if (!businessId) throw new HttpError(400, 'businessId is required');
    if (!text.trim() && !productName.trim()) {
      throw new HttpError(400, 'text or productName is required');
    }

    await assertBusinessOwnership({ businessId, userId: user.id });

    const rl = consumeGenerateProductDescriptionSlot(businessId);
    if (!rl.allowed) {
      console.warn('[ai] rate limit', { businessId, limit: rl.limit, retryAfterSec: rl.retryAfterSec });
      return json(
        {
          ok: false,
          code: 'RATE_LIMIT_EXCEEDED',
          error: `[ai] Demasiadas solicitudes para este negocio. Límite: ${rl.limit} por ${Math.round((rl.windowMs ?? 60000) / 1000)}s.`,
          details: {
            retryAfterSec: rl.retryAfterSec,
            limit: rl.limit,
            windowMs: rl.windowMs,
          },
        },
        429,
        { 'Retry-After': String(rl.retryAfterSec ?? 60) },
      );
    }

    const admin = getAdminClient();

    if (productId) {
      const { data: product, error: productErr } = await admin
        .from('wa_products')
        .select('id, business_id')
        .eq('id', productId)
        .maybeSingle();

      if (productErr) throw new HttpError(500, `[ai] Product read failed: ${productErr.message}`);
      if (!product) throw new HttpError(404, 'Product not found');
      if (String(product.business_id) !== businessId) {
        throw new HttpError(403, 'Product does not belong to this business');
      }
    }

    const { data: biz, error: bizErr } = await admin
      .from('wa_businesses')
      .select('id, plan_slug, plan_expires_at, trial_expires_at')
      .eq('id', businessId)
      .maybeSingle();

    if (bizErr) throw new HttpError(500, `[ai] Business read failed: ${bizErr.message}`);
    if (!biz) throw new HttpError(404, 'Business not found');

    const effectivePlan = getEffectivePlanSlug(
      biz.plan_slug || 'starter',
      biz.plan_expires_at ?? null,
      biz.trial_expires_at ?? null,
    );

    const policy = assertGenerateProductDescriptionPlanPolicy(effectivePlan);
    if (!policy.allowed) {
      throw new HttpError(403, '[ai] This plan is not allowed for AI product descriptions. Configure AI_FEATURE_GENERATE_PRODUCT_DESCRIPTION_ALLOWED_PLANS if starter access is required.', {
        code: 'AI_PLAN_NOT_ALLOWED',
        details: {
          effectivePlan,
          allowedPlans: policy.allowedPlans,
        },
      });
    }

    const taskId = AI_TASKS.GENERATE_PRODUCT_DESCRIPTION;
    const { providerId, model } = resolveProviderAndModelForTask(taskId);
    const cacheKey = computeCacheKey({
      businessId,
      text,
      productName,
      maxDescriptionLength,
      providerId,
      model,
    });
    const inputHash = computeContentInputHash({ text, productName, maxDescriptionLength });

    const { data: cached, error: cacheErr } = await admin
      .from('wa_ai_product_description_cache')
      .select(
        'id, provider, model, title, description, benefits, call_to_action, hashtags, created_at, usage_metadata, cache_key',
      )
      .eq('business_id', businessId)
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cacheErr && cacheErr.code !== 'PGRST116') {
      console.warn('[ai] cache read warning', cacheErr.message);
    }

    if (cached?.description) {
      console.info('[ai] generate-product-description cache hit', {
        businessId,
        productId: productId || null,
        provider: cached.provider,
        model: cached.model,
        cacheKey: `${cacheKey.slice(0, 12)}…`,
        durationMs: Date.now() - routeStart,
      });
      await insertAiUsageLog({
        businessId,
        userId: user.id,
        feature: FEATURE_LOG_KEY,
        provider: cached.provider,
        model: cached.model,
        cached: true,
        usage: null,
        productId: productId || null,
      });
      return json({
        ok: true,
        cached: true,
        provider: cached.provider,
        model: cached.model,
        title: cached.title,
        description: cached.description,
        benefits: cached.benefits || [],
        call_to_action: cached.call_to_action,
        hashtags: cached.hashtags || [],
      });
    }

    const gen = await generateProductDescription({
      text,
      productName,
      maxDescriptionLength,
      taskId,
    });

    const { error: insErr } = await admin.from('wa_ai_product_description_cache').insert({
      business_id: businessId,
      product_id: productId || null,
      input_hash: inputHash,
      cache_key: cacheKey,
      provider: gen.provider,
      model: gen.model,
      title: gen.data?.title ?? null,
      description: gen.data?.description ?? '',
      benefits: gen.data?.benefits ?? [],
      call_to_action: gen.data?.call_to_action ?? null,
      hashtags: gen.data?.hashtags ?? [],
      usage_metadata: gen.usage,
    });

    if (insErr) {
      console.error('[ai] cache insert failed', insErr.message);
    }

    await insertAiUsageLog({
      businessId,
      userId: user.id,
      feature: FEATURE_LOG_KEY,
      provider: gen.provider,
      model: gen.model,
      cached: false,
      usage: gen.usage,
      productId: productId || null,
    });

    console.info('[ai] generate-product-description done', {
      provider: gen.provider,
      model: gen.model,
      durationMs: Date.now() - routeStart,
      usage: gen.usage,
    });

    return json({
      ok: true,
      cached: false,
      provider: gen.provider,
      model: gen.model,
      title: gen.data?.title,
      description: gen.data?.description,
      benefits: gen.data?.benefits || [],
      call_to_action: gen.data?.call_to_action,
      hashtags: gen.data?.hashtags || [],
    });
  } catch (err) {
    console.error('[ai] generate-product-description error', err);
    return handleError(err, 'AI generation failed');
  }
}
