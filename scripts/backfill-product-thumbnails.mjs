#!/usr/bin/env node
/**
 * Backfill: genera thumbnails de card (max 420px, JPEG q72) para productos existentes sin card_image_url.
 *
 * Solo procesa imágenes en media.gong.cl (formato JPEG o PNG).
 * Idempotente: omite productos que ya tienen card_image_url.
 * No bloquea el deploy: el catálogo sigue funcionando con fallback CF si no se ejecuta.
 *
 * Requiere en .env: SUPABASE_URL (o VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, R2_*.
 * Uso:
 *   node scripts/backfill-product-thumbnails.mjs [--dry-run] [--batch=10] [--limit=N]
 *   npm run backfill:thumbnails
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { decodeJPEGFromStream, decodePNGFromStream, encodeJPEGToStream, make } from 'pureimage';
import { Readable, PassThrough } from 'node:stream';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Configuración ──────────────────────────────────────────────────────────────

const DRY_RUN    = process.argv.includes('--dry-run');
const BATCH_ARG  = process.argv.find(a => a.startsWith('--batch='));
const LIMIT_ARG  = process.argv.find(a => a.startsWith('--limit='));
const BATCH_SIZE = BATCH_ARG ? Math.max(1, parseInt(BATCH_ARG.split('=')[1], 10)) : 10;
const MAX_LIMIT  = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split('=')[1], 10)) : null;

const THUMB_MAX_PX = 420;
const THUMB_QUALITY = 72; // 0-100 para pureimage
const SUPPORTED_HOST = 'media.gong.cl';

// ── Variables de entorno ───────────────────────────────────────────────────────

function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([^#=\s][^=]*)=(.*)/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID      = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID   = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME     = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL      = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

function requireEnv(name, value) {
  if (!value) { console.error(`❌ Falta variable de entorno: ${name}`); process.exit(1); }
}
requireEnv('SUPABASE_URL', SUPABASE_URL);
requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_KEY);
requireEnv('R2_ACCOUNT_ID', R2_ACCOUNT_ID);
requireEnv('R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID);
requireEnv('R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY);
requireEnv('R2_BUCKET_NAME', R2_BUCKET_NAME);
requireEnv('R2_PUBLIC_URL', R2_PUBLIC_URL);

// ── Clientes ───────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

// ── Procesamiento de imagen ────────────────────────────────────────────────────

function isJpegUrl(url, ct) {
  return (ct && (ct.includes('jpeg') || ct.includes('jpg'))) ||
    (!ct && /\.jpe?g$/i.test(url));
}
function isPngUrl(url, ct) {
  return (ct && ct.includes('png')) || (!ct && /\.png$/i.test(url));
}

async function buildThumbnailBuffer(imageUrl) {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const ct = response.headers.get('content-type') || '';
  const isJpeg = isJpegUrl(imageUrl, ct);
  const isPng  = isPngUrl(imageUrl, ct);

  if (!isJpeg && !isPng) {
    throw new Error(`Formato no soportado (content-type: ${ct || 'desconocido'})`);
  }

  const nodeStream = Readable.fromWeb(response.body);
  const srcImg = isJpeg
    ? await decodeJPEGFromStream(nodeStream)
    : await decodePNGFromStream(nodeStream);

  const { width: w0, height: h0 } = srcImg;
  if (!w0 || !h0) throw new Error('Imagen con dimensiones 0');

  const ratio = Math.min(THUMB_MAX_PX / w0, THUMB_MAX_PX / h0, 1);
  const w = Math.max(1, Math.round(w0 * ratio));
  const h = Math.max(1, Math.round(h0 * ratio));

  const canvas = make(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(srcImg, 0, 0, w0, h0, 0, 0, w, h);

  const pt = new PassThrough();
  const bufferPromise = new Promise((resolve, reject) => {
    const chunks = [];
    pt.on('data', c => chunks.push(c));
    pt.on('end', () => resolve(Buffer.concat(chunks)));
    pt.on('error', reject);
  });
  await encodeJPEGToStream(canvas, pt, THUMB_QUALITY);
  return await bufferPromise;
}

// ── Procesar un producto ───────────────────────────────────────────────────────

async function processProduct(product) {
  const { id, business_id, image_url } = product;

  if (!image_url) {
    console.log(`  ⬜ ${id} — sin image_url`);
    return 'skipped';
  }
  if (!image_url.includes(SUPPORTED_HOST)) {
    console.log(`  ⬜ ${id} — host no soportado (${new URL(image_url).hostname})`);
    return 'skipped';
  }

  if (DRY_RUN) {
    console.log(`  🔵 [dry-run] ${id} — generaría thumbnail de ${image_url}`);
    return 'dry-run';
  }

  const thumbBuffer = await buildThumbnailBuffer(image_url);

  const rand = Math.random().toString(36).slice(2, 9);
  const key  = `businesses/${business_id}/products/${id}/thumb_${Date.now()}_${rand}.jpg`;

  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: thumbBuffer,
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  const cardImageUrl = `${R2_PUBLIC_URL}/${key}`;

  const { error } = await supabase
    .from('wa_products')
    .update({ card_image_url: cardImageUrl, card_image_path: key })
    .eq('id', id);

  if (error) throw new Error(`Error DB: ${error.message}`);

  console.log(`  ✅ ${id} → ${cardImageUrl} (${Math.round(thumbBuffer.length / 1024)} KB)`);
  return 'ok';
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🖼  Backfill thumbnails de cards — batch=${BATCH_SIZE}${MAX_LIMIT ? ` limit=${MAX_LIMIT}` : ''}${DRY_RUN ? ' [DRY-RUN]' : ''}\n`);

  let offset = 0;
  let nOk = 0, nSkipped = 0, nError = 0;

  while (true) {
    if (MAX_LIMIT && nOk + nSkipped >= MAX_LIMIT) break;

    const pageSize = MAX_LIMIT ? Math.min(BATCH_SIZE, MAX_LIMIT - nOk - nSkipped) : BATCH_SIZE;

    const { data: products, error } = await supabase
      .from('wa_products')
      .select('id, business_id, image_url')
      .is('card_image_url', null)
      .not('image_url', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) { console.error('Error fetching products:', error.message); break; }
    if (!products?.length) { console.log('Sin más productos por procesar.'); break; }

    console.log(`Lote offset=${offset} (${products.length} productos):`);

    for (const product of products) {
      try {
        const result = await processProduct(product);
        if (result === 'ok') nOk++;
        else nSkipped++;
      } catch (e) {
        console.error(`  ❌ ${product.id}: ${e.message}`);
        nError++;
      }
    }

    offset += pageSize;
    if (products.length < pageSize) break;

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nResumen: ${nOk} generados, ${nSkipped} omitidos, ${nError} errores\n`);
  if (nError > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
