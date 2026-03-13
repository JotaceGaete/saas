// upload-image-r2 — genera presigned PUT URL para subir imágenes a Cloudflare R2.
// Requiere JWT. Valida que el negocio pertenezca al usuario.
// El cliente debe: 1) POST aquí con type, businessId, fileName, contentType → obtener uploadUrl y publicUrl; 2) PUT el file a uploadUrl; 3) usar publicUrl en la app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.700.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.700.0';

const ALLOWED_ORIGINS = [
  'https://ventalink.app',
  'https://www.ventalink.app',
  'https://cl.ventalink.app',
  'https://ar.ventalink.app',
  'https://app.gong.cl',
  'http://localhost:4028',
  'http://localhost:3000',
  'http://127.0.0.1:4028',
  'http://127.0.0.1:3000',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type UploadType = 'logo' | 'cover' | 'product';

// Rutas R2: businesses/{business_id}/logo|cover|products/{product_id}/...
function buildKey(type: UploadType, businessId: string, fileName: string, productId?: string): string {
  const ext = fileName?.split('.')?.pop()?.toLowerCase() || 'jpg';
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
  const ts = Date.now();
  if (type === 'logo') return `businesses/${businessId}/logo/${ts}.${safeExt}`;
  if (type === 'cover') return `businesses/${businessId}/cover/${ts}.${safeExt}`;
  const unique = productId ? `${productId}-${ts}-${Math.random().toString(36).slice(2, 9)}` : `${ts}-${Math.random().toString(36).slice(2, 9)}`;
  return `businesses/${businessId}/products/${productId || 'draft'}/${unique}.${safeExt}`;
}

Deno.serve(async (req) => {
  const method = req.method;
  const corsHeaders = getCorsHeaders(req);

  if (method === 'OPTIONS') {
    console.log('[upload-image-r2] OPTIONS preflight');
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (method !== 'POST') {
    console.log('[upload-image-r2] method not allowed:', method);
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  console.log('[upload-image-r2] POST request');

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

    let body: { type?: string; businessId?: string; productId?: string; fileName?: string; contentType?: string };
    try {
      body = (await req.json().catch(() => ({}))) as typeof body;
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
    }

    const type = (body?.type ?? '') as UploadType;
    if (!['logo', 'cover', 'product'].includes(type)) {
      return jsonResponse({ error: 'type must be logo, cover, or product' }, 400, corsHeaders);
    }
    const businessId = typeof body?.businessId === 'string' ? body.businessId.trim() : '';
    if (!businessId) return jsonResponse({ error: 'businessId is required' }, 400, corsHeaders);
    const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : `upload.${type === 'product' ? 'jpg' : 'png'}`;
    const contentType = typeof body?.contentType === 'string' ? body.contentType.trim() : 'image/jpeg';
    const productId = typeof body?.productId === 'string' ? body.productId.trim() || undefined : undefined;

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!serviceRoleKey) {
      console.error('[upload-image-r2] Missing SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: 'Server configuration error' }, 500, corsHeaders);
    }
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: biz, error: bizError } = await adminClient
      .from('wa_businesses')
      .select('id, user_id')
      .eq('id', businessId)
      .maybeSingle();
    if (bizError || !biz?.id || (biz as { user_id?: string }).user_id !== user.id) {
      return jsonResponse({ error: 'Business not found or access denied' }, 403, corsHeaders);
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

    const key = buildKey(type, businessId, fileName, productId);

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
