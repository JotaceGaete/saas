#!/usr/bin/env node
/**
 * Backfill de `wa_businesses.og_image_url` usando el renderer pÃºblico actual
 * (`/api/og-catalog`) y persistiendo el PNG final en R2.
 *
 * Uso:
 *   node scripts/backfill-og-images.mjs
 *   node scripts/backfill-og-images.mjs --dry-run
 *   node scripts/backfill-og-images.mjs --limit=50
 *   node scripts/backfill-og-images.mjs --business-id=<uuid>
 *   node scripts/backfill-og-images.mjs --force
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, existsSync } from 'fs';
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

loadEnv();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const LIMIT = Number(args.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 0) || null;
const BUSINESS_ID = args.find((arg) => arg.startsWith('--business-id='))?.split('=')[1] || null;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = String(process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
const CATALOG_ORIGIN = String(process.env.CATALOG_ORIGIN || 'https://miralatienda.de').replace(/\/$/, '');

function requireEnv(name, value) {
  if (!value) {
    console.error(`Falta variable de entorno: ${name}`);
    process.exit(1);
  }
}

requireEnv('SUPABASE_URL', SUPABASE_URL);
requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);
requireEnv('R2_ACCOUNT_ID', R2_ACCOUNT_ID);
requireEnv('R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID);
requireEnv('R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY);
requireEnv('R2_BUCKET_NAME', R2_BUCKET_NAME);
requireEnv('R2_PUBLIC_URL', R2_PUBLIC_URL);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function parseDesignSettings(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function sanitizeKeySegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^0-9A-Za-z_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildOgSourceUrl(slug, updatedAt) {
  const qs = new URLSearchParams({ slug });
  if (updatedAt) qs.set('v', String(updatedAt));
  return `${CATALOG_ORIGIN}/api/og-catalog?${qs.toString()}`;
}

async function fetchPngBytes(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      Accept: 'image/png,image/*;q=0.9,*/*;q=0.8',
      'User-Agent': 'Ventalink-Og-Backfill/1.0',
    },
  });
  if (!res.ok) throw new Error(`PNG source failed with ${res.status}`);
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('image/png')) {
    throw new Error(`Unexpected content-type: ${contentType || '(empty)'}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function uploadToR2({ businessId, slug, updatedAt, pngBytes }) {
  const slugPart = sanitizeKeySegment(slug) || businessId;
  const versionPart = sanitizeKeySegment(updatedAt || new Date().toISOString()) || String(Date.now());
  const key = `businesses/${businessId}/og/${slugPart}-${versionPart}.png`;

  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: pngBytes,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return `${R2_PUBLIC_URL}/${key}`;
}

async function listBusinesses() {
  let query = supabase
    .from('wa_businesses')
    .select('id, slug, updated_at, og_image_url, is_active, design_settings, name')
    .eq('is_active', true)
    .not('slug', 'is', null)
    .order('updated_at', { ascending: false });

  if (BUSINESS_ID) query = query.eq('id', BUSINESS_ID);
  if (LIMIT) query = query.limit(LIMIT);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function main() {
  console.log('[backfill-og-images] start', {
    dryRun: DRY_RUN,
    force: FORCE,
    limit: LIMIT,
    businessId: BUSINESS_ID,
    catalogOrigin: CATALOG_ORIGIN,
  });

  const businesses = await listBusinesses();
  let scanned = 0;
  let eligible = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const business of businesses) {
    scanned += 1;
    const designSettings = parseDesignSettings(business.design_settings);
    const shareImageUrl = String(designSettings?.shareImageUrl || '').trim();
    const currentOgImageUrl = String(business.og_image_url || '').trim();
    const slug = String(business.slug || '').trim();
    const updatedAt = business.updated_at ? String(business.updated_at) : null;

    if (!slug) {
      skipped += 1;
      console.log('[backfill-og-images] skip:no-slug', { businessId: business.id, name: business.name });
      continue;
    }

    if (shareImageUrl && !FORCE) {
      skipped += 1;
      console.log('[backfill-og-images] skip:share-image-url', { businessId: business.id, slug });
      continue;
    }

    if (currentOgImageUrl && !FORCE) {
      skipped += 1;
      console.log('[backfill-og-images] skip:og-image-exists', { businessId: business.id, slug, ogImageUrl: currentOgImageUrl });
      continue;
    }

    eligible += 1;
    const sourceUrl = buildOgSourceUrl(slug, updatedAt);

    if (DRY_RUN) {
      console.log('[backfill-og-images] dry-run', { businessId: business.id, slug, sourceUrl });
      continue;
    }

    try {
      const pngBytes = await fetchPngBytes(sourceUrl);
      const ogImageUrl = await uploadToR2({
        businessId: business.id,
        slug,
        updatedAt,
        pngBytes,
      });

      const { error: updateError } = await supabase
        .from('wa_businesses')
        .update({ og_image_url: ogImageUrl })
        .eq('id', business.id);

      if (updateError) throw updateError;

      migrated += 1;
      console.log('[backfill-og-images] migrated', {
        businessId: business.id,
        slug,
        ogImageUrl,
      });
    } catch (error) {
      failed += 1;
      console.error('[backfill-og-images] failed', {
        businessId: business.id,
        slug,
        message: error?.message || String(error),
      });
    }
  }

  console.log('[backfill-og-images] done', {
    scanned,
    eligible,
    migrated,
    skipped,
    failed,
    dryRun: DRY_RUN,
  });
}

main().catch((error) => {
  console.error('[backfill-og-images] fatal', error);
  process.exit(1);
});
