/**
 * Benchmark: latencia de resolución de imagen en /api/og-catalog, ANTES (fetch
 * en serie, timeout 10s) vs. DESPUÉS (carrera controlada, timeout 3s/recurso,
 * presupuesto total 5s). Usa recursos remotos simulados (delays reales, no
 * fake timers) para reportar tiempos de pared representativos.
 *
 * Uso: node scripts/benchmark-og-catalog.mjs
 */
import { fetchImageDataUri, resolveOgSourceImage } from '../src/lib/ogImagePipeline.js';

const OLD_PER_IMAGE_TIMEOUT_MS = 10_000;
const NEW_PER_IMAGE_TIMEOUT_MS = 3_000;
const NEW_TOTAL_BUDGET_MS = 5_000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeOkResponse() {
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
  return {
    ok: true,
    headers: { get: (h) => (h === 'content-length' ? String(bytes.byteLength) : 'image/png') },
    arrayBuffer: async () => bytes.buffer,
  };
}

/** Simula un recurso remoto con latencia real controlada, respetando AbortSignal. */
function makeSimulatedFetch({ coverDelayMs, coverHangs, logoDelayMs, logoHangs }) {
  return (url, { signal } = {}) => {
    const isCover = url.includes('cover');
    const hangs = isCover ? coverHangs : logoHangs;
    const delayMs = isCover ? coverDelayMs : logoDelayMs;
    return new Promise((resolve, reject) => {
      if (hangs) {
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
        return;
      }
      const t = setTimeout(() => resolve(fakeOkResponse()), delayMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  };
}

/** Reproduce fielmente el pipeline ANTERIOR: cover await, LUEGO logo await (serie, nunca en paralelo). */
async function resolveOldSerial({ coverUrl, logoUrl, fetchImpl }) {
  const t0 = Date.now();
  const coverResult = await fetchImageDataUri(coverUrl, { timeoutMs: OLD_PER_IMAGE_TIMEOUT_MS, fetchImpl });
  const logoResult = await fetchImageDataUri(logoUrl, { timeoutMs: OLD_PER_IMAGE_TIMEOUT_MS, fetchImpl });
  return { coverResult, logoResult, totalMs: Date.now() - t0 };
}

async function resolveNewParallel({ coverUrl, logoUrl, fetchImpl }) {
  return resolveOgSourceImage({
    coverUrl,
    logoUrl,
    perImageTimeoutMs: NEW_PER_IMAGE_TIMEOUT_MS,
    totalBudgetMs: NEW_TOTAL_BUDGET_MS,
    fetchImpl,
  });
}

const scenarios = [
  {
    name: 'Portada y logo rápidos (200ms cada uno)',
    opts: { coverDelayMs: 200, logoDelayMs: 200 },
  },
  {
    name: 'Portada lenta/cuelga, logo rápido (200ms)',
    opts: { coverHangs: true, logoDelayMs: 200 },
  },
  {
    name: 'Portada y logo ambos cuelgan (peor caso)',
    opts: { coverHangs: true, logoHangs: true },
  },
];

async function run() {
  console.log('Benchmark /api/og-catalog — resolución de imagen (portada + logo)\n');
  console.log(`ANTES:  timeout por recurso = ${OLD_PER_IMAGE_TIMEOUT_MS}ms, fetch en SERIE, sin presupuesto total`);
  console.log(`DESPUÉS: timeout por recurso = ${NEW_PER_IMAGE_TIMEOUT_MS}ms, fetch en PARALELO (carrera controlada), presupuesto total = ${NEW_TOTAL_BUDGET_MS}ms\n`);

  for (const scenario of scenarios) {
    console.log(`── ${scenario.name} ──`);
    const fetchImpl = makeSimulatedFetch(scenario.opts);

    const before = await resolveOldSerial({
      coverUrl: 'https://cdn/cover.png',
      logoUrl: 'https://cdn/logo.png',
      fetchImpl,
    });
    console.log(`  ANTES   (serie):    ${before.totalMs}ms  [cover: ${before.coverResult.reason}, logo: ${before.logoResult.reason}]`);

    const after = await resolveNewParallel({
      coverUrl: 'https://cdn/cover.png',
      logoUrl: 'https://cdn/logo.png',
      fetchImpl,
    });
    console.log(`  DESPUÉS (paralelo): ${after.totalMs}ms  [source: ${after.source}, cover: ${after.coverResult.reason}, logo: ${after.logoResult?.reason ?? 'n/a'}]`);

    const improvementPct = Math.round((1 - after.totalMs / before.totalMs) * 100);
    console.log(`  Mejora: ${improvementPct}% más rápido\n`);
  }

  console.log('Nota: los delays "rápidos" están comprimidos a 200ms para mantener el benchmark');
  console.log('corto; los escenarios con "cuelga" sí usan los timeouts reales de producción');
  console.log('(10000ms antes / 3000ms+5000ms después) para reportar números de pared reales.');
}

run();
