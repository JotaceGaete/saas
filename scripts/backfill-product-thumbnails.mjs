#!/usr/bin/env node
/**
 * Backfill de thumbnails persistidos para productos existentes.
 *
 * Estrategia:
 * - Lee wa_products por lotes.
 * - Procesa productos activos con image_url/images pero sin thumbnail_url/card_image_url.
 * - Si image_url apunta al host de media, descarga una version Cloudflare ya reducida
 *   (420px / q70 / webp) y la sube a R2 como thumbnail persistido.
 * - Actualiza thumbnail_url + thumbnail_path + card_image_url.
 * - Con --copy-only no usa R2: copia image_url como fallback persistente en
 *   thumbnail_url/card_image_url para catálogos legacy.
 *
 * Uso:
 *   node scripts/backfill-product-thumbnails.mjs
 *   node scripts/backfill-product-thumbnails.mjs --dry-run --batch-size=50 --limit=200
 *   node scripts/backfill-product-thumbnails.mjs --dry-run --batch=50 --limit=200
 *   node scripts/backfill-product-thumbnails.mjs --copy-only --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function getArgNumber(names, fallback) {
  const found = process.argv.find((arg) => names.some((name) => arg.startsWith(`${name}=`)));
  if (!found) return fallback;
  return Number(found.split('=')[1] || fallback);
}

loadEnv();

const DRY_RUN = process.argv.includes('--dry-run');
const COPY_ONLY = process.argv.includes('--copy-only');
const BATCH_SIZE = Math.max(1, getArgNumber(['--batch-size', '--batch'], 25));
const LIMIT = Math.max(0, getArgNumber(['--limit'], 0));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
const CF_IMAGE_ORIGIN = (process.env.VITE_CF_IMAGE_ORIGIN || process.env.CF_IMAGE_ORIGIN || 'https://walinka.com').replace(/\/$/, '');
const MEDIA_HOST = 'media.gong.cl';

const requiredEnv = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ...(COPY_ONLY ? {} : {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
    R2_PUBLIC_URL,
  }),
};

for (const [name, value] of Object.entries(requiredEnv)) {
  if (!value) {
    console.error(`Falta variable de entorno: ${name}`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const s3 = COPY_ONLY ? null : new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function isTransformableMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    return new URL(url).hostname === MEDIA_HOST;
  } catch {
    return false;
  }
}

function buildCloudflareThumbnailUrl(originalUrl) {
  return `${CF_IMAGE_ORIGIN}/cdn-cgi/image/width=420,quality=70,format=webp/${originalUrl}`;
}

function buildThumbnailKey(businessId, productId) {
  return `businesses/${businessId}/products/${productId}/thumb-backfill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
}

async function uploadThumbnailFromUrl(sourceUrl, key) {
  const response = await fetch(sourceUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed ${response.status}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

async function processProduct(product) {
  const thumbnailUrl = String(product?.thumbnail_url || '').trim();
  const cardImageUrl = String(product?.card_image_url || '').trim();
  if (thumbnailUrl && cardImageUrl) return { status: 'skipped', reason: 'already_has_thumbnail_and_card_image' };
  if (product?.is_active !== true) return { status: 'skipped', reason: 'inactive' };

  const imageUrl = String(product?.image_url || product?.images?.[0] || '').trim();
  if (!imageUrl) return { status: 'skipped', reason: 'no_image_url' };

  if (COPY_ONLY) {
    if (DRY_RUN) {
      return { status: 'dry-run', source: imageUrl, mode: 'copy-only' };
    }

    const updates = {};
    if (!thumbnailUrl) updates.thumbnail_url = imageUrl;
    if (!cardImageUrl) updates.card_image_url = imageUrl;
    const { error } = await supabase
      .from('wa_products')
      .update(updates)
      .eq('id', product.id);

    if (error) {
      throw new Error(error.message || 'No se pudo actualizar wa_products');
    }

    return { status: 'updated', publicUrl: imageUrl, mode: 'copy-only' };
  }

  if (!isTransformableMediaUrl(imageUrl)) return { status: 'skipped', reason: 'non_transformable_source' };

  const cfThumbUrl = buildCloudflareThumbnailUrl(imageUrl);
  const key = buildThumbnailKey(product.business_id, product.id);

  if (DRY_RUN) {
    return { status: 'dry-run', key, source: cfThumbUrl };
  }

  const publicUrl = await uploadThumbnailFromUrl(cfThumbUrl, key);
  const updates = {
    card_image_url: publicUrl,
  };
  if (!thumbnailUrl) {
    updates.thumbnail_url = publicUrl;
    updates.thumbnail_path = key;
  }
  const { error } = await supabase
    .from('wa_products')
    .update(updates)
    .eq('id', product.id);

  if (error) {
    throw new Error(error.message || 'No se pudo actualizar wa_products');
  }

  return { status: 'updated', key, publicUrl };
}

async function main() {
  let from = 0;
  let processed = 0;
  const stats = {
    updated: 0,
    skipped: 0,
    errors: 0,
    dryRun: 0,
  };

  while (true) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await supabase
      .from('wa_products')
      .select('id, business_id, image_url, images, thumbnail_url, thumbnail_path, card_image_url, is_active, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Error leyendo wa_products:', error.message);
      process.exit(1);
    }
    if (!data?.length) break;

    for (const product of data) {
      if (LIMIT > 0 && processed >= LIMIT) break;
      processed += 1;
      try {
        const result = await processProduct(product);
        if (result.status === 'updated') stats.updated += 1;
        else if (result.status === 'dry-run') stats.dryRun += 1;
        else stats.skipped += 1;
        console.log(`[thumbnail-backfill] ${product.id}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
      } catch (error) {
        stats.errors += 1;
        console.error(`[thumbnail-backfill] ${product.id}: error`, error?.message || error);
      }
    }

    if (LIMIT > 0 && processed >= LIMIT) break;
    from += data.length;
  }

  console.log('\nResumen backfill thumbnails');
  console.log(JSON.stringify({ processed, ...stats }, null, 2));
  if (stats.errors > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Fallo el backfill de thumbnails:', error?.message || error);
  process.exit(1);
});
