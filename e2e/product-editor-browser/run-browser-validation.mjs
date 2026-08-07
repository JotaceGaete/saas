import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseURL = 'http://127.0.0.1:4179';
const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.join(here, 'artifacts');
await fs.mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const only = process.argv[2]?.toLowerCase() || '';
const record = (scenario, passed, evidence = {}) => results.push({ scenario, passed, ...evidence });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const validPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const image = (name) => ({ name, mimeType: 'image/png', buffer: validPng });

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/product-editor`);
  await page.evaluate(() => window.__WALINKA_E2E__.reset());
  await page.reload();
  const notice = page.getByRole('button', { name: 'Entendido' });
  if (await notice.isVisible().catch(() => false)) await notice.click();
  return { context, page };
}

async function fillText(page, name, price = '1000') {
  await page.getByPlaceholder('Ej: Camiseta de algodón premium').fill(name);
  await page.getByPlaceholder('Ej: precio en entero').fill(price);
}

async function leaveAndReturn(page, suffix = '') {
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('link', { name: 'Volver al editor' }).click();
  if (suffix) await page.goto(`${baseURL}/product-editor${suffix}`);
}

const draftKey = (business, product = 'new') => `product-editor:${business}:${product}`;
const getDraft = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);
const getRows = (page) => page.evaluate(() => window.__WALINKA_E2E__.rows());
async function getBlobs(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('walinka-product-editor-drafts', 1);
    open.onerror = () => resolve([]);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('image-blobs')) { db.close(); resolve([]); return; }
      const request = db.transaction('image-blobs').objectStore('image-blobs').getAll();
      request.onsuccess = () => { const rows = request.result.map((row) => ({ key: row.key, name: row.name, size: row.blob?.size })); db.close(); resolve(rows); };
      request.onerror = () => { db.close(); resolve([]); };
    };
  }));
}

async function scenario(name, fn) {
  if (only && !name.toLowerCase().includes(only)) return;
  try { await fn(); } catch (error) { record(name, false, { error: error.message }); }
}

await scenario('Producto nuevo con texto: navegar y volver', async () => {
  const { context, page } = await newPage();
  await fillText(page, 'Texto navegable');
  await page.waitForTimeout(450);
  await leaveAndReturn(page);
  await page.getByPlaceholder('Ej: Camiseta de algodón premium').waitFor();
  assert(await page.getByPlaceholder('Ej: Camiseta de algodón premium').inputValue() === 'Texto navegable', 'texto no restaurado');
  const draft = await getDraft(page, draftKey('business-a'));
  assert(draft?.formData?.nombre === 'Texto navegable', 'localStorage incorrecto');
  const shot = `${evidenceDir}/01-text-navigation.png`; await page.screenshot({ path: shot, fullPage: true });
  record('Producto nuevo con texto: navegar y volver', true, { localStorageKey: draftKey('business-a'), screenshot: shot });
  await context.close();
});

await scenario('Navegación inmediata antes de 400ms', async () => {
  const { context, page } = await newPage();
  await page.getByPlaceholder('Ej: Camiseta de algodón premium').fill('Flush inmediato');
  await leaveAndReturn(page);
  assert(await page.getByPlaceholder('Ej: Camiseta de algodón premium').inputValue() === 'Flush inmediato', 'unmount no hizo flush');
  record('Navegación inmediata antes de 400ms', true, { restored: 'Flush inmediato' });
  await context.close();
});

await scenario('Imagen local: navegar inmediatamente y restaurar desde IndexedDB', async () => {
  const { context, page } = await newPage();
  await page.evaluate(() => window.__WALINKA_E2E__.uploadDelay(1800));
  await page.locator('input[type=file][multiple]').setInputFiles(image('instant.png'));
  await leaveAndReturn(page);
  await page.locator('img[alt="Imagen de producto: instant.png"]').first().waitFor();
  const blobs = await getBlobs(page);
  assert(blobs.some((blob) => blob.name === 'instant.png'), 'blob no persistido');
  const shot = `${evidenceDir}/02-local-image-restored.png`; await page.screenshot({ path: shot, fullPage: true });
  record('Imagen local: navegar inmediatamente y restaurar desde IndexedDB', true, { indexedDB: blobs, screenshot: shot });
  await context.close();
});

await scenario('Tres imágenes reordenadas conservan orden', async () => {
  const { context, page } = await newPage();
  await page.evaluate(() => window.__WALINKA_E2E__.uploadDelay(2000));
  await page.locator('input[type=file][multiple]').setInputFiles([image('one.png'), image('two.png'), image('three.png')]);
  const firstCard = page.locator('img[alt="Imagen de producto: one.png"]').first().locator('..');
  const thirdCard = page.locator('img[alt="Imagen de producto: three.png"]').first().locator('..');
  await firstCard.dragTo(thirdCard);
  await page.waitForTimeout(100);
  const before = (await getDraft(page, draftKey('business-a'))).images.map((item) => item.name);
  await leaveAndReturn(page);
  const after = (await getDraft(page, draftKey('business-a'))).images.map((item) => item.name);
  assert(JSON.stringify(before) === JSON.stringify(after), `orden cambió: ${before} -> ${after}`);
  assert(after.join(',') === 'two.png,three.png,one.png', `drag order inesperado: ${after}`);
  const shot = `${evidenceDir}/03-three-images-order.png`; await page.screenshot({ path: shot, fullPage: true });
  record('Tres imágenes reordenadas conservan orden', true, { order: after, screenshot: shot });
  await context.close();
});

await scenario('Texto e imagen sobreviven refresh y reapertura de pestaña', async () => {
  const { context, page } = await newPage();
  await page.evaluate(() => window.__WALINKA_E2E__.uploadDelay(1600));
  await fillText(page, 'Refresh completo');
  await page.locator('input[type=file][multiple]').setInputFiles(image('refresh.png'));
  const beforeRefresh = await getDraft(page, draftKey('business-a'));
  assert(beforeRefresh?.formData?.nombre === 'Refresh completo', `snapshot previo incorrecto: ${beforeRefresh?.formData?.nombre}`);
  await page.reload();
  await page.waitForTimeout(1200);
  const valueAfterRefresh = await page.getByPlaceholder('Ej: Camiseta de algodón premium').inputValue();
  const draftAfterRefresh = await getDraft(page, draftKey('business-a'));
  assert(valueAfterRefresh === 'Refresh completo', `texto perdido en refresh; input=${valueAfterRefresh}; draft=${draftAfterRefresh?.formData?.nombre}`);
  await page.locator('img[alt="Imagen de producto: refresh.png"]').first().waitFor();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`${baseURL}/product-editor`);
  await reopened.waitForFunction(() => document.querySelector('input[placeholder="Ej: Camiseta de algodón premium"]')?.value === 'Refresh completo');
  assert(await reopened.getByPlaceholder('Ej: Camiseta de algodón premium').inputValue() === 'Refresh completo', 'texto perdido al reabrir pestaña');
  await reopened.locator('img[alt="Imagen de producto: refresh.png"]').first().waitFor();
  const shot = `${evidenceDir}/04-refresh-reopen.png`; await reopened.screenshot({ path: shot, fullPage: true });
  record('Texto e imagen sobreviven refresh y reapertura de pestaña', true, { screenshot: shot });
  await context.close();
});

await scenario('Guardar restaurado crea exactamente un definitivo y limpia stores', async () => {
  const { context, page } = await newPage();
  await fillText(page, 'Producto único');
  await page.locator('input[type=file][multiple]').setInputFiles(image('save.png'));
  await page.waitForTimeout(100);
  await leaveAndReturn(page);
  await page.getByRole('button', { name: 'Guardar cambios' }).waitFor();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.waitForFunction(() => window.__WALINKA_E2E__.rows().some((row) => row.name === 'Producto único' && row.isDraft === false));
  const rows = await getRows(page);
  assert(rows.length === 1, `productos totales: ${rows.length}`);
  assert(rows.filter((row) => row.isDraft).length === 0, 'quedó is_draft huérfano');
  assert(await getDraft(page, draftKey('business-a')) === null, 'localStorage no limpiado');
  assert((await getBlobs(page)).length === 0, 'IndexedDB no limpiado');
  record('Guardar restaurado crea exactamente un definitivo y limpia stores', true, { rows, draft: null, blobs: [] });
  await context.close();
});

await scenario('Guardado fallido conserva draft y blobs', async () => {
  const { context, page } = await newPage();
  await fillText(page, 'Fallo guardado');
  await page.locator('input[type=file][multiple]').setInputFiles(image('failure.png'));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__WALINKA_E2E__.failSave(true));
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.waitForTimeout(200);
  const draft = await getDraft(page, draftKey('business-a'));
  const blobs = await getBlobs(page);
  assert(draft?.formData?.nombre === 'Fallo guardado', 'draft borrado tras fallo');
  assert(blobs.length === 1, 'blob borrado tras fallo');
  record('Guardado fallido conserva draft y blobs', true, { draftPresent: true, blobCount: blobs.length });
  await context.close();
});

await scenario('Descarte explícito limpia stores y temporal', async () => {
  const { context, page } = await newPage();
  await fillText(page, 'Descartar');
  await page.locator('input[type=file][multiple]').setInputFiles(image('discard.png'));
  await page.waitForTimeout(100);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Descartar borrador' }).last().click();
  await page.getByRole('heading', { name: 'Fuera del editor' }).waitFor();
  assert(await getDraft(page, draftKey('business-a')) === null, 'draft local no eliminado');
  assert((await getBlobs(page)).length === 0, 'blobs no eliminados');
  assert((await getRows(page)).filter((row) => row.isDraft).length === 0, 'temporal huérfano tras descarte');
  record('Descarte explícito limpia stores y temporal', true, { orphanDraftProducts: 0 });
  await context.close();
});

await scenario('Producto existente restaura draft; draft viejo no pisa servidor', async () => {
  const { context, page } = await newPage();
  const seeded = await page.evaluate(() => window.__WALINKA_E2E__.seed({ id: 'existing-1', name: 'Servidor original', price: 1000, updatedAt: '2026-08-07T10:00:00Z' }));
  await page.goto(`${baseURL}/product-editor?id=${seeded.id}`);
  await page.getByPlaceholder('Ej: Camiseta de algodón premium').fill('Draft existente');
  await leaveAndReturn(page, `?id=${seeded.id}`);
  assert(await page.getByPlaceholder('Ej: Camiseta de algodón premium').inputValue() === 'Servidor original', 'existente se auto-restauró');
  await page.getByRole('button', { name: 'Restaurar' }).click();
  assert(await page.getByPlaceholder('Ej: Camiseta de algodón premium').inputValue() === 'Draft existente', 'restore explícito falló');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.evaluate((id) => window.__WALINKA_E2E__.updateServer(id, { name: 'Servidor más nuevo', updatedAt: new Date(Date.now() + 60_000).toISOString() }), seeded.id);
  await page.goto(`${baseURL}/product-editor?id=${seeded.id}`);
  assert(await page.getByPlaceholder('Ej: Camiseta de algodón premium').inputValue() === 'Servidor más nuevo', 'draft viejo pisó servidor');
  assert(await page.getByRole('button', { name: 'Restaurar' }).count() === 0, 'se ofreció draft viejo');
  record('Producto existente restaura draft; draft viejo no pisa servidor', true, { restoredExisting: true, staleRejected: true });
  await context.close();
});

await scenario('Aislamiento entre productos y negocios', async () => {
  const { context, page } = await newPage();
  await page.evaluate(() => { window.__WALINKA_E2E__.seed({ id: 'p-a', name: 'Producto A' }); window.__WALINKA_E2E__.seed({ id: 'p-b', name: 'Producto B' }); });
  await page.goto(`${baseURL}/product-editor?id=p-a`); await page.getByPlaceholder('Ej: Camiseta de algodón premium').fill('Draft A'); await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.goto(`${baseURL}/product-editor?id=p-b`); assert(await page.getByPlaceholder('Ej: Camiseta de algodón premium').inputValue() === 'Producto B', 'draft A mezclado con B');
  await page.goto(`${baseURL}/product-editor`); await page.getByPlaceholder('Ej: Camiseta de algodón premium').fill('Negocio A'); await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.evaluate(() => window.__WALINKA_E2E__.setBusiness('business-b'));
  await page.goto(`${baseURL}/product-editor`);
  assert(await page.getByPlaceholder('Ej: Camiseta de algodón premium').inputValue() === '', 'draft de negocio A apareció en B');
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('product-editor:')).sort());
  assert(keys.includes('product-editor:business-a:p-a') && keys.includes('product-editor:business-a:new'), `keys inesperadas: ${keys}`);
  record('Aislamiento entre productos y negocios', true, { draftKeys: keys });
  await context.close();
});

await browser.close();
await fs.writeFile(`${evidenceDir}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
