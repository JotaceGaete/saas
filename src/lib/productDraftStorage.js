import { productEditorDiagnostic, summarizeProductDraft } from './productEditorDiagnostics';

const DB_NAME = 'walinka-product-editor-drafts';
const DB_VERSION = 1;
const BLOB_STORE = 'image-blobs';

export const PRODUCT_DRAFT_SCHEMA_VERSION = 1;

export function buildProductDraftKey(businessId, productId) {
  const business = String(businessId || '').trim();
  if (!business) return null;
  return `product-editor:${business}:${productId || 'new'}`;
}

export function buildDraftBlobKey(draftKey, imageId) {
  return `${draftKey}:image:${imageId}`;
}

function getLocalStorage() {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

export function readProductDraft(key) {
  if (!key) {
    productEditorDiagnostic('storage.read.skipped', { key: null });
    return null;
  }
  try {
    const raw = getLocalStorage()?.getItem(key);
    if (!raw) {
      productEditorDiagnostic('storage.read.miss', { key });
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== PRODUCT_DRAFT_SCHEMA_VERSION || !parsed.formData) {
      productEditorDiagnostic('storage.read.invalid', { key, parsed: summarizeProductDraft(parsed) });
      removeProductDraft(key);
      return null;
    }
    productEditorDiagnostic('storage.read.hit', { key, draft: summarizeProductDraft(parsed) });
    return parsed;
  } catch (error) {
    productEditorDiagnostic('storage.read.error', { key, message: error?.message || String(error) });
    removeProductDraft(key);
    return null;
  }
}

export function writeProductDraft(key, snapshot) {
  if (!key || !snapshot) return false;
  try {
    getLocalStorage()?.setItem(key, JSON.stringify(snapshot));
    productEditorDiagnostic('storage.write', { key, draft: summarizeProductDraft(snapshot) });
    return true;
  } catch (error) {
    productEditorDiagnostic('storage.write.error', { key, message: error?.message || String(error) });
    return false;
  }
}

export function removeProductDraft(key) {
  if (!key) return false;
  try {
    productEditorDiagnostic('storage.remove', { key, existing: summarizeProductDraft(readProductDraftWithoutDiagnostics(key)) });
    getLocalStorage()?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function readProductDraftWithoutDiagnostics(key) {
  try {
    const raw = getLocalStorage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function serializeDraftImages(images) {
  return (Array.isArray(images) ? images : []).map((image, order) => ({
    id: image?.id,
    order,
    blobKey: image?.blobKey || null,
    url: typeof image?.persistedUrl === 'string'
      ? image.persistedUrl
      : (typeof image?.url === 'string' && !image.url.startsWith('blob:') ? image.url : null),
    persistedUrl: image?.persistedUrl || null,
    thumbnailUrl: image?.thumbnailUrl || null,
    thumbnailPath: image?.thumbnailPath || null,
    alt: image?.alt || '',
    name: image?.name || image?.file?.name || '',
    type: image?.file?.type || image?.type || '',
    lastModified: Number(image?.file?.lastModified || image?.lastModified || 0) || null,
    status: image?.status === 'uploaded' ? 'uploaded' : 'pending',
  }));
}

export function buildProductDraftSnapshot({ formData, images, currentProductId, temporaryProductDraft }) {
  return {
    schemaVersion: PRODUCT_DRAFT_SCHEMA_VERSION,
    formData,
    images: serializeDraftImages(images),
    currentProductId: currentProductId || null,
    temporaryProductDraft: temporaryProductDraft === true,
    savedAt: Date.now(),
  };
}

export function isDraftNewerThanServer(draftSavedAt, serverUpdatedAt) {
  if (serverUpdatedAt == null) return true;
  const serverMs = serverUpdatedAt instanceof Date
    ? serverUpdatedAt.getTime()
    : typeof serverUpdatedAt === 'number'
      ? serverUpdatedAt
      : Date.parse(serverUpdatedAt);
  if (!Number.isFinite(serverMs)) return true;
  return typeof draftSavedAt === 'number' && Number.isFinite(draftSavedAt) && draftSavedAt > serverMs;
}

function openDraftDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no está disponible.'));
      return;
    }
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        const store = db.createObjectStore(BLOB_STORE, { keyPath: 'key' });
        store.createIndex('draftKey', 'draftKey', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB está bloqueado.'));
  });
}

async function runTransaction(mode, operation) {
  const db = await openDraftDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(BLOB_STORE, mode);
      const store = transaction.objectStore(BLOB_STORE);
      let result;
      try {
        result = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => resolve(result?.result);
      transaction.onerror = () => reject(transaction.error || result?.error || new Error('Falló IndexedDB.'));
      transaction.onabort = () => reject(transaction.error || new Error('La operación IndexedDB fue cancelada.'));
    });
  } finally {
    db.close();
  }
}

export async function putDraftImageBlob({ draftKey, imageId, blob }) {
  if (!draftKey || !imageId || !(blob instanceof Blob)) return null;
  const key = buildDraftBlobKey(draftKey, imageId);
  await runTransaction('readwrite', (store) => store.put({
    key,
    draftKey,
    imageId,
    blob,
    name: typeof blob?.name === 'string' ? blob.name : '',
    type: blob.type || '',
    lastModified: Number(blob?.lastModified || 0) || null,
    savedAt: Date.now(),
  }));
  productEditorDiagnostic('indexeddb.blob.write', {
    draftKey,
    imageId,
    key,
    name: typeof blob?.name === 'string' ? blob.name : '',
    type: blob.type || '',
    size: blob.size || 0,
  });
  return key;
}

export async function getDraftImageBlob(blobKey) {
  if (!blobKey) return null;
  const record = await runTransaction('readonly', (store) => store.get(blobKey));
  if (!record?.blob) return null;
  if (typeof File !== 'undefined' && !(record.blob instanceof File) && record.name) {
    return new File([record.blob], record.name, {
      type: record.type || record.blob.type,
      lastModified: record.lastModified || Date.now(),
    });
  }
  return record.blob;
}

export async function deleteDraftImageBlob(blobKey) {
  if (!blobKey) return;
  await runTransaction('readwrite', (store) => store.delete(blobKey));
}

export async function deleteDraftImageBlobs(draftKey) {
  if (!draftKey) return;
  const db = await openDraftDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(BLOB_STORE, 'readwrite');
      const store = transaction.objectStore(BLOB_STORE);
      const index = store.index('draftKey');
      const request = index.openKeyCursor(IDBKeyRange.only(draftKey));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('No se pudieron limpiar las imágenes del borrador.'));
      transaction.onabort = () => reject(transaction.error || new Error('La limpieza IndexedDB fue cancelada.'));
    });
  } finally {
    db.close();
  }
}

export async function restoreDraftImages(imageMetadata) {
  productEditorDiagnostic('indexeddb.restore.start', { images: imageMetadata || [] });
  const restored = [];
  const missingBlobKeys = [];
  const sorted = [...(Array.isArray(imageMetadata) ? imageMetadata : [])]
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));

  for (const metadata of sorted) {
    const remoteUrl = metadata?.persistedUrl || metadata?.url || null;
    if (remoteUrl) {
      restored.push({ ...metadata, url: remoteUrl, persistedUrl: remoteUrl, status: 'uploaded', file: undefined });
      continue;
    }
    if (!metadata?.blobKey) continue;
    try {
      const file = await getDraftImageBlob(metadata.blobKey);
      if (!file) {
        missingBlobKeys.push(metadata.blobKey);
        continue;
      }
      restored.push({
        ...metadata,
        file,
        url: URL.createObjectURL(file),
        status: 'pending',
        error: undefined,
      });
    } catch {
      missingBlobKeys.push(metadata.blobKey);
    }
  }
  productEditorDiagnostic('indexeddb.restore.complete', {
    restored: restored.map((image) => ({ id: image.id, blobKey: image.blobKey, status: image.status, hasFile: !!image.file, url: image.url || null })),
    missingBlobKeys,
  });
  return { images: restored, missingBlobKeys };
}

export async function clearProductDraft(key) {
  productEditorDiagnostic('storage.clear.start', { key, existing: summarizeProductDraft(readProductDraftWithoutDiagnostics(key)) });
  removeProductDraft(key);
  try {
    await deleteDraftImageBlobs(key);
    productEditorDiagnostic('storage.clear.complete', { key, blobsCleared: true });
    return true;
  } catch {
    productEditorDiagnostic('storage.clear.complete', { key, blobsCleared: false });
    return false;
  }
}
