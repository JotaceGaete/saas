#!/usr/bin/env node
/**
 * Migración de imágenes de Supabase Storage a Cloudflare R2.
 * Actualiza wa_businesses (logo_url, cover_image_url, design_settings) y wa_products (image_url, images).
 *
 * Opciones:
 *   --dry-run   Solo escanear y reportar; no sube archivos ni actualiza la BD.
 *
 * Requiere en .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_*.
 * Uso: npm run migrate:images-r2   o   node scripts/migrate-images-to-r2.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run');

// Rutas R2: businesses/{business_id}/logo|cover|products/{product_id}/...
function r2KeyLogo(businessId, ext) {
  return `businesses/${businessId}/logo/${Date.now()}.${ext}`;
}
function r2KeyCover(businessId, ext, suffix = '') {
  return `businesses/${businessId}/cover/${Date.now()}${suffix ? `-${suffix}` : ''}.${ext}`;
}
function r2KeyProduct(businessId, productId, ext) {
  const rand = Math.random().toString(36).slice(2, 9);
  return `businesses/${businessId}/products/${productId}/${Date.now()}-${rand}.${ext}`;
}

// Cargar .env
function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (m) {
        const key = m[1].trim();
        const val = m[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

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

const r2Endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const s3 = new S3Client({
  region: 'auto',
  endpoint: r2Endpoint,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// Reporte: { tabla, id, campo, url_origen, r2_key, url_destino, estado, error }
// r2_key queda en el reporte para auditoría; opcionalmente se puede añadir después una columna
// (ej. storage_key o r2_key) en wa_businesses/wa_products y guardarla aquí en el UPDATE.
const REPORT_DIR = join(ROOT, 'reports');
const report = [];

function isSupabaseStorageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('supabase.co/storage/v1/object/public/');
}

function alreadyOnR2(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith(R2_PUBLIC_URL + '/') || url.startsWith(R2_PUBLIC_URL + ' ');
}

function getExtFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    return ext && /^[a-z0-9]+$/.test(ext) ? ext : null;
  } catch {
    return null;
  }
}

const CONTENT_TYPE_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function extFromContentType(ct) {
  if (!ct || typeof ct !== 'string') return 'jpg';
  const normalized = ct.split(';')[0].trim().toLowerCase();
  return CONTENT_TYPE_TO_EXT[normalized] || 'jpg';
}

function resolveExt(url, contentType) {
  const fromUrl = getExtFromUrl(url);
  if (fromUrl) return fromUrl;
  return extFromContentType(contentType);
}

async function downloadAndUploadToR2(imageUrl, key, dryRun) {
  if (dryRun) return { url: `${R2_PUBLIC_URL}/${key}`, contentType: 'image/jpeg', finalKey: key };
  const res = await fetch(imageUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${imageUrl}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  const ext = resolveExt(imageUrl, contentType);
  const finalKey = key.endsWith(`.${ext}`) ? key : key.replace(/\.[a-z0-9]+$/i, '') + `.${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: finalKey,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return { url: `${R2_PUBLIC_URL}/${finalKey}`, contentType, finalKey };
}

function safeDesignSettings(ds) {
  if (ds == null) return null;
  if (typeof ds !== 'object' || Array.isArray(ds)) return null;
  return ds;
}

const stats = { detected: 0, migrated: 0, skipped: 0, error: 0 };

async function migrateBusinesses() {
  const { data: businesses, error } = await supabase
    .from('wa_businesses')
    .select('id, logo_url, cover_image_url, design_settings');

  if (error) {
    console.error('Error leyendo wa_businesses:', error.message);
    return;
  }
  if (!businesses?.length) {
    console.log('No hay negocios.');
    return;
  }

  console.log(`\n--- Negocios: ${businesses.length} ---`);

  for (const b of businesses) {
    const updates = {};
    const id = b.id;

    const processUrl = async (url, campo, keyFn, updateField) => {
      if (!url || typeof url !== 'string') return null;
      stats.detected++;
      const ext = resolveExt(url, null) || 'jpg';
      const r2Key = keyFn(ext);
      if (alreadyOnR2(url)) {
        stats.skipped++;
        report.push({ tabla: 'wa_businesses', id, campo, url_origen: url, r2_key: null, url_destino: url, estado: 'skipped', error: 'ya en R2' });
        console.log(`  [${id}] ${campo} omitido (ya en R2)`);
        return null;
      }
      if (!isSupabaseStorageUrl(url)) {
        stats.skipped++;
        report.push({ tabla: 'wa_businesses', id, campo, url_origen: url, r2_key: null, url_destino: null, estado: 'skipped', error: 'no es Supabase Storage' });
        return null;
      }
      try {
        const key = keyFn(ext);
        const result = await downloadAndUploadToR2(url, key, DRY_RUN);
        const newUrl = result.url;
        const finalKey = result.finalKey || key;
        if (updateField) updates[updateField] = newUrl;
        stats.migrated++;
        report.push({ tabla: 'wa_businesses', id, campo, url_origen: url, r2_key: finalKey, url_destino: newUrl, estado: 'migrated', error: null });
        console.log(`  [${id}] ${campo} ${DRY_RUN ? '(dry-run)' : 'migrado'}`);
        return newUrl;
      } catch (err) {
        stats.error++;
        const msg = err?.message || String(err);
        report.push({ tabla: 'wa_businesses', id, campo, url_origen: url, r2_key: r2Key, url_destino: null, estado: 'error', error: msg });
        console.error(`  [${id}] ${campo} error:`, msg);
        return null;
      }
    };

    if (b.logo_url) {
      await processUrl(b.logo_url, 'logo_url', (ext) => r2KeyLogo(id, ext), 'logo_url');
    }
    if (b.cover_image_url) {
      await processUrl(b.cover_image_url, 'cover_image_url', (ext) => r2KeyCover(id, ext), 'cover_image_url');
    }

    const ds = safeDesignSettings(b.design_settings);
    if (ds) {
      let dsChanged = false;
      if (!updates.design_settings) updates.design_settings = { ...ds };
      for (const field of ['logoUrl', 'headerImageUrl', 'coverImageUrl']) {
        const url = ds[field];
        if (!url) continue;
        const suffix = field;
        const newUrl = await processUrl(url, `design_settings.${field}`, (ext) => r2KeyCover(id, ext, suffix), null);
        if (newUrl) {
          updates.design_settings[field] = newUrl;
          dsChanged = true;
        }
      }
      if (!dsChanged) delete updates.design_settings;
    }

    if (Object.keys(updates).length > 0 && !DRY_RUN) {
      const { error: updateErr } = await supabase.from('wa_businesses').update(updates).eq('id', id);
      if (updateErr) {
        console.error(`  [${id}] update error:`, updateErr.message);
      }
    }
  }
}

async function migrateProducts() {
  const { data: products, error } = await supabase
    .from('wa_products')
    .select('id, business_id, image_url, images');

  if (error) {
    console.error('Error leyendo wa_products:', error.message);
    return;
  }
  if (!products?.length) {
    console.log('No hay productos.');
    return;
  }

  console.log(`\n--- Productos: ${products.length} ---`);

  const imagesArray = (arr) => (Array.isArray(arr) ? arr : []);

  for (const p of products) {
    const bid = p.business_id;
    const pid = p.id;
    const updates = {};

    const processProductUrl = async (url, campo) => {
      if (!url || typeof url !== 'string') return url;
      stats.detected++;
      if (alreadyOnR2(url)) {
        stats.skipped++;
        report.push({ tabla: 'wa_products', id: pid, campo, url_origen: url, r2_key: null, url_destino: url, estado: 'skipped', error: 'ya en R2' });
        console.log(`  [product ${pid}] ${campo} omitido (ya en R2)`);
        return url;
      }
      if (!isSupabaseStorageUrl(url)) {
        stats.skipped++;
        report.push({ tabla: 'wa_products', id: pid, campo, url_origen: url, r2_key: null, url_destino: null, estado: 'skipped', error: 'no es Supabase Storage' });
        return url;
      }
      const ext = resolveExt(url, null) || 'jpg';
      const key = r2KeyProduct(bid, pid, ext);
      try {
        const { url: newUrl, finalKey } = await downloadAndUploadToR2(url, key, DRY_RUN).then((r) => ({ url: r.url, finalKey: r.finalKey || key }));
        stats.migrated++;
        report.push({ tabla: 'wa_products', id: pid, campo, url_origen: url, r2_key: finalKey || key, url_destino: newUrl, estado: 'migrated', error: null });
        console.log(`  [product ${pid}] ${campo} ${DRY_RUN ? '(dry-run)' : 'migrado'}`);
        return newUrl;
      } catch (err) {
        stats.error++;
        const msg = err?.message || String(err);
        report.push({ tabla: 'wa_products', id: pid, campo, url_origen: url, r2_key: key, url_destino: null, estado: 'error', error: msg });
        console.error(`  [product ${pid}] ${campo} error:`, msg);
        return url;
      }
    };

    if (p.image_url) {
      const newUrl = await processProductUrl(p.image_url, 'image_url');
      if (newUrl && newUrl !== p.image_url) updates.image_url = newUrl;
    }

    const images = imagesArray(p.images);
    if (images.length > 0) {
      const newImages = [];
      for (let i = 0; i < images.length; i++) {
        const url = images[i];
        if (!url) {
          newImages.push(url);
          continue;
        }
        const newUrl = await processProductUrl(url, `images[${i}]`);
        newImages.push(newUrl ?? url);
      }
      if (JSON.stringify(newImages) !== JSON.stringify(images)) updates.images = newImages;
    }

    if (Object.keys(updates).length > 0 && !DRY_RUN) {
      const { error: updateErr } = await supabase.from('wa_products').update(updates).eq('id', pid);
      if (updateErr) console.error(`  [product ${pid}] update error:`, updateErr.message);
    }
  }
}

function writeReport() {
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = `migrate-r2-${ts}${DRY_RUN ? '-dryrun' : ''}`;
  const jsonPath = join(REPORT_DIR, `${base}.json`);
  const csvPath = join(REPORT_DIR, `${base}.csv`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  const header = 'tabla,id,campo,url_origen,r2_key,url_destino,estado,error';
  const escapeCsv = (s) => {
    if (s == null) return '';
    const t = String(s);
    return t.includes(',') || t.includes('"') || t.includes('\n') ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csvRows = [header, ...report.map((r) => [r.tabla, r.id, r.campo, escapeCsv(r.url_origen), escapeCsv(r.r2_key), escapeCsv(r.url_destino), r.estado, escapeCsv(r.error)].join(','))];
  writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
  console.log(`\nReporte: ${jsonPath}`);
  console.log(`Reporte CSV: ${csvPath}`);
}

async function main() {
  console.log('Migración Supabase Storage → R2');
  if (DRY_RUN) console.log('*** MODO DRY-RUN: no se suben archivos ni se actualiza la BD ***');
  console.log('R2_PUBLIC_URL:', R2_PUBLIC_URL);
  console.log('Bucket:', R2_BUCKET_NAME);

  await migrateBusinesses();
  await migrateProducts();

  writeReport();

  console.log('\n--- Resumen ---');
  console.log('Total detectadas (candidatas a migrar):', stats.detected);
  console.log('Total migradas:', stats.migrated);
  console.log('Total omitidas (ya en R2 o no Supabase):', stats.skipped);
  console.log('Total con error:', stats.error);
  if (DRY_RUN && stats.detected > 0) {
    console.log('\nEjecuta sin --dry-run para aplicar la migración.');
  }
  console.log('\nMigración finalizada.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
