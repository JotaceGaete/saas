// upload-image-r2 â€” genera presigned PUT URL para subir imÃ¡genes a Cloudflare R2.
// Requiere JWT. Valida que el negocio pertenezca al usuario.
// El cliente debe: 1) POST aquÃ­ con type, businessId, fileName, contentType â†’ obtener uploadUrl y publicUrl; 2) PUT el file a uploadUrl; 3) usar publicUrl en la app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.700.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.700.0';

const EXACT_ALLOWED_ORIGINS = new Set([
  'https://walinka.com',
  'https://go.ventalink.app',
  'https://ventalink.app',
  'http://localhost:4028',
  'http://localhost:3000',
  'http://127.0.0.1:4028',
  'http://127.0.0.1:3000',
]);

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (EXACT_ALLOWED_ORIGINS.has(origin)) return true;

  try {
    const url = new URL(origin);
    if (url.origin !== origin) return false;
    return /^saas-git-[a-z0-9-]+\.vercel\.app$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = (req.headers.get('origin') ?? '').trim();
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };

  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function jsonResponse(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type UploadType = 'logo' | 'cover' | 'product' | 'template';
type ProductVariant = 'main' | 'thumb' | 'gallery';
type TemplateVariant = 'logo' | 'banner' | 'preview' | 'product';

// Rutas R2: businesses/{business_id}/logo|cover|products/{product_id}/...
function buildKey(type: UploadType, businessId: string, fileName: string, productId?: string, variant?: ProductVariant): string {
  const ext = fileName?.split('.')?.pop()?.toLowerCase() || 'jpg';
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
  const ts = Date.now();
  if (type === 'logo') return `businesses/${businessId}/logo/${ts}.${safeExt}`;
  if (type === 'cover') return `businesses/${businessId}/cover/${ts}.${safeExt}`;
  const unique = productId ? `${productId}-${ts}-${Math.random().toString(36).slice(2, 9)}` : `${ts}-${Math.random().toString(36).slice(2, 9)}`;
  const safeVariant: ProductVariant = variant === 'main' || variant === 'thumb' || variant === 'gallery' ? variant : 'gallery';
  return `businesses/${businessId}/products/${productId || 'draft'}/${safeVariant}-${unique}.${safeExt}`;
}

// Rutas R2 de plantillas admin: catalog-templates/{template_id}/{variant}-...
function buildTemplateKey(templateId: string, fileName: string, variant?: string): string {
  const ext = fileName?.split('.')?.pop()?.toLowerCase() || 'jpg';
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
  const safeTemplateId = /^[a-zA-Z0-9-]+$/.test(templateId) ? templateId : 'unassigned';
  const safeVariant: TemplateVariant =
    variant === 'logo' || variant === 'banner' || variant === 'preview' ? (variant as TemplateVariant) : 'product';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `catalog-templates/${safeTemplateId}/${safeVariant}-${unique}.${safeExt}`;
}

function isAdminUser(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }): boolean {
  return (user.app_metadata?.role as string) === 'admin' || (user.user_metadata?.role as string) === 'admin';
}

Deno.serve(async (req) => {
  const method = req.method;
  const corsHeaders = getCorsHeaders(req);

  if (method === 'OPTIONS') {
    const preflightOrigin = (req.headers.get('origin') ?? '').trim();
    const originAllowed = isAllowedOrigin(preflightOrigin);
    console.log('[upload-image-r2] OPTIONS preflight origin:', preflightOrigin || '(none)', '| allowed:', originAllowed);
    return new Response('ok', { headers: corsHeaders });
  }

  if (method !== 'POST') {
    console.log('[upload-image-r2] method not allowed:', method);
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  const postOrigin = (req.headers.get('origin') ?? '').trim();
  console.log('[upload-image-r2] POST request origin:', postOrigin || '(none)', '| cors-allowed:', isAllowedOrigin(postOrigin));

  try {
    const authHeader = (req.headers.get('authorization') ?? '').trim();
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return jsonResponse({ error: 'User not authenticated' }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user ?? null;
    if (!user?.id) {
      return jsonResponse({ error: 'User not authenticated' }, 401, corsHeaders);
    }

    let body: { type?: string; businessId?: string; productId?: string; templateId?: string; fileName?: string; contentType?: string; variant?: string };
    try {
      body = (await req.json().catch(() => ({}))) as typeof body;
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
    }

    const type = (body?.type ?? '') as UploadType;
    if (!['logo', 'cover', 'product', 'template'].includes(type)) {
      return jsonResponse({ error: 'type must be logo, cover, product, or template' }, 400, corsHeaders);
    }

    // Imágenes de plantillas de catálogo (panel /admin/catalog-templates):
    // sin negocio asociado; solo admins.
    if (type === 'template' && !isAdminUser(user)) {
      return jsonResponse({ error: 'Forbidden: solo admins pueden subir imágenes de plantillas' }, 403, corsHeaders);
    }

    const businessId = typeof body?.businessId === 'string' ? body.businessId.trim() : '';
    if (type !== 'template' && !businessId) return jsonResponse({ error: 'businessId is required' }, 400, corsHeaders);
    const templateId = typeof body?.templateId === 'string' ? body.templateId.trim() : '';
    const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : `upload.${type === 'product' ? 'jpg' : 'png'}`;
    const contentType = typeof body?.contentType === 'string' ? body.contentType.trim() : 'image/jpeg';
    const productId = typeof body?.productId === 'string' ? body.productId.trim() || undefined : undefined;
    const variant = typeof body?.variant === 'string' ? body.variant.trim().toLowerCase() : undefined;

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!serviceRoleKey) {
      console.error('[upload-image-r2] Missing SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: 'Server configuration error' }, 500, corsHeaders);
    }
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    if (type !== 'template') {
      const { data: biz, error: bizError } = await adminClient
        .from('wa_businesses')
        .select('id, user_id')
        .eq('id', businessId)
        .maybeSingle();
      if (bizError || !biz?.id || (biz as { user_id?: string }).user_id !== user.id) {
        console.error('[upload-image-r2] 403 business check', {
          businessId,
          userId: user.id,
          bizFound: !!biz?.id,
          ownerMatch: biz ? (biz as { user_id?: string }).user_id === user.id : null,
          dbError: bizError?.message ?? null,
        });
        return jsonResponse({ error: 'Business not found or access denied' }, 403, corsHeaders);
      }
    }

    const accountId = Deno.env.get('R2_ACCOUNT_ID') ?? '';
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
    const bucket = Deno.env.get('R2_BUCKET_NAME') ?? '';
    const publicBaseUrl = (Deno.env.get('R2_PUBLIC_URL') ?? '').replace(/\/$/, '');

    const missingR2: string[] = [];
    if (!accountId) missingR2.push('R2_ACCOUNT_ID');
    if (!accessKeyId) missingR2.push('R2_ACCESS_KEY_ID');
    if (!secretAccessKey) missingR2.push('R2_SECRET_ACCESS_KEY');
    if (!bucket) missingR2.push('R2_BUCKET_NAME');
    if (!publicBaseUrl) missingR2.push('R2_PUBLIC_URL');
    if (missingR2.length > 0) {
      console.error('[upload-image-r2] Missing R2 secrets:', missingR2.join(', '));
      return jsonResponse({ error: 'Storage not configured', missing: missingR2 }, 500, corsHeaders);
    }

    const key = type === 'template'
      ? buildTemplateKey(templateId, fileName, variant)
      : buildKey(type, businessId, fileName, productId, variant as ProductVariant);

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const s3 = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    const expiresIn = 3600;
    let uploadUrl: string;
    try {
      uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn },
      );
    } catch (err) {
      console.error('[upload-image-r2] getSignedUrl error', err);
      return jsonResponse({ error: 'Failed to generate upload URL' }, 500, corsHeaders);
    }

    const publicUrl = `${publicBaseUrl}/${key}`;
    return jsonResponse({ uploadUrl, publicUrl, key }, 200, corsHeaders);
  } catch (err) {
    console.error('[upload-image-r2] Unhandled error', err);
    return jsonResponse(
      { error: 'Internal server error', message: err instanceof Error ? err.message : String(err) },
      500,
      corsHeaders
    );
  }
});
