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

const ALLOWED_VIDEO_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const UPLOAD_URL_EXPIRES_IN = 3600;

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

function sanitizeFileName(fileName: string): string {
  const normalized = String(fileName || '')
    .trim()
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'video';
}

function buildVideoKey(businessId: string, productId: string, fileName: string): string {
  const safeFileName = sanitizeFileName(fileName);
  return `products/${businessId}/${productId}/video/${Date.now()}-${safeFileName}`;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const authHeader = (req.headers.get('authorization') ?? '').trim();
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return jsonResponse({ ok: false, error: 'User not authenticated' }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'Server configuration error' }, 500, corsHeaders);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user ?? null;
    if (!user?.id) {
      return jsonResponse({ ok: false, error: 'User not authenticated' }, 401, corsHeaders);
    }

    const body = await req.json().catch(() => null) as {
      businessId?: string;
      productId?: string;
      fileName?: string;
      contentType?: string;
      fileSize?: number;
    } | null;

    const businessId = typeof body?.businessId === 'string' ? body.businessId.trim() : '';
    const productId = typeof body?.productId === 'string' ? body.productId.trim() : '';
    const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : '';
    const contentType = typeof body?.contentType === 'string' ? body.contentType.trim().toLowerCase() : '';
    const fileSize = Number(body?.fileSize || 0);

    if (!businessId) {
      return jsonResponse({ ok: false, error: 'businessId is required' }, 400, corsHeaders);
    }
    if (!productId) {
      return jsonResponse({ ok: false, error: 'productId is required' }, 400, corsHeaders);
    }
    if (!fileName) {
      return jsonResponse({ ok: false, error: 'fileName is required' }, 400, corsHeaders);
    }
    if (!ALLOWED_VIDEO_CONTENT_TYPES.has(contentType)) {
      return jsonResponse({ ok: false, error: 'Unsupported video format' }, 400, corsHeaders);
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return jsonResponse({ ok: false, error: 'fileSize is required' }, 400, corsHeaders);
    }
    if (fileSize > MAX_VIDEO_BYTES) {
      return jsonResponse({ ok: false, error: 'Video exceeds the 50 MB limit' }, 400, corsHeaders);
    }

    const { data: business, error: businessError } = await adminClient
      .from('wa_businesses')
      .select('id, user_id')
      .eq('id', businessId)
      .maybeSingle();

    if (businessError || !business?.id || (business as { user_id?: string }).user_id !== user.id) {
      return jsonResponse({ ok: false, error: 'Business not found or access denied' }, 403, corsHeaders);
    }

    const { data: product, error: productError } = await adminClient
      .from('wa_products')
      .select('id, business_id')
      .eq('id', productId)
      .maybeSingle();

    if (productError || !product?.id || (product as { business_id?: string }).business_id !== businessId) {
      return jsonResponse({ ok: false, error: 'Product not found or access denied' }, 403, corsHeaders);
    }

    const accountId = Deno.env.get('R2_ACCOUNT_ID') ?? '';
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
    const bucket = Deno.env.get('R2_BUCKET_NAME') ?? '';
    const publicBaseUrl = (Deno.env.get('R2_PUBLIC_URL') ?? '').replace(/\/$/, '');

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
      return jsonResponse({ ok: false, error: 'Storage not configured' }, 500, corsHeaders);
    }

    const objectKey = buildVideoKey(businessId, productId, fileName);
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ContentType: contentType,
      }),
      { expiresIn: UPLOAD_URL_EXPIRES_IN },
    );

    return jsonResponse({
      ok: true,
      uploadUrl,
      publicUrl: `${publicBaseUrl}/${objectKey}`,
      objectKey,
      expiresIn: UPLOAD_URL_EXPIRES_IN,
    }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, 500, corsHeaders);
  }
});
