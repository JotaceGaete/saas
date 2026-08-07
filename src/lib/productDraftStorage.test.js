import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildProductDraftKey,
  buildProductDraftSnapshot,
  clearProductDraft,
  getDraftImageBlob,
  isDraftNewerThanServer,
  putDraftImageBlob,
  readProductDraft,
  restoreDraftImages,
  writeProductDraft,
} from './productDraftStorage';

beforeEach(() => localStorage.clear());

describe('productDraftStorage', () => {
  it('aísla borradores por negocio y producto', () => {
    expect(buildProductDraftKey('biz-a', null)).toBe('product-editor:biz-a:new');
    expect(buildProductDraftKey('biz-b', null)).not.toBe(buildProductDraftKey('biz-a', null));
    expect(buildProductDraftKey('biz-a', 'p-2')).not.toBe(buildProductDraftKey('biz-a', 'p-1'));
  });

  it('guarda snapshot ligero, orden, ID temporal y nunca blob URLs', () => {
    const key = buildProductDraftKey('biz', null);
    const snapshot = buildProductDraftSnapshot({
      formData: { nombre: 'Café', precio: 1000 },
      currentProductId: 'draft-1',
      temporaryProductDraft: true,
      images: [
        { id: 'local', url: 'blob:preview', blobKey: `${key}:image:local`, file: new File(['x'], 'local.png', { type: 'image/png' }), status: 'pending' },
        { id: 'remote', url: 'https://cdn/img.jpg', persistedUrl: 'https://cdn/img.jpg', status: 'uploaded' },
      ],
    });
    expect(snapshot.currentProductId).toBe('draft-1');
    expect(snapshot.temporaryProductDraft).toBe(true);
    expect(snapshot.images.map((image) => image.id)).toEqual(['local', 'remote']);
    expect(snapshot.images[0].url).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain('blob:preview');
    expect(writeProductDraft(key, snapshot)).toBe(true);
    expect(readProductDraft(key).formData.nombre).toBe('Café');
  });

  it('persiste File/Blob, restaura object URL y conserva orden junto a URLs remotas', async () => {
    const key = buildProductDraftKey('biz-images', null);
    const first = new File(['first'], 'first.png', { type: 'image/png' });
    const third = new File(['third'], 'third.jpg', { type: 'image/jpeg' });
    const firstKey = await putDraftImageBlob({ draftKey: key, imageId: 'first', blob: first });
    const thirdKey = await putDraftImageBlob({ draftKey: key, imageId: 'third', blob: third });
    expect((await getDraftImageBlob(firstKey)).name).toBe('first.png');
    const restored = await restoreDraftImages([
      { id: 'third', order: 2, blobKey: thirdKey, name: 'third.jpg' },
      { id: 'second', order: 1, persistedUrl: 'https://cdn/second.jpg' },
      { id: 'first', order: 0, blobKey: firstKey, name: 'first.png' },
    ]);
    expect(restored.images.map((image) => image.id)).toEqual(['first', 'second', 'third']);
    expect(restored.images[0].file).toBeInstanceOf(Blob);
    expect(restored.images[0].url).toMatch(/^blob:/);
    expect(restored.images[1].status).toBe('uploaded');
    await clearProductDraft(key);
    expect(await getDraftImageBlob(firstKey)).toBeNull();
  });

  it('limpia localStorage e IndexedDB tras guardar o descartar', async () => {
    const key = buildProductDraftKey('biz-clean', 'p-1');
    const blobKey = await putDraftImageBlob({ draftKey: key, imageId: 'image', blob: new Blob(['x'], { type: 'image/png' }) });
    writeProductDraft(key, buildProductDraftSnapshot({ formData: { nombre: 'x' }, images: [], currentProductId: 'p-1' }));
    await clearProductDraft(key);
    expect(localStorage.getItem(key)).toBeNull();
    expect(await getDraftImageBlob(blobKey)).toBeNull();
  });

  it('un draft antiguo no gana a un producto más nuevo', () => {
    const server = new Date('2026-08-07T12:00:00Z').toISOString();
    expect(isDraftNewerThanServer(Date.parse('2026-08-07T11:00:00Z'), server)).toBe(false);
    expect(isDraftNewerThanServer(Date.parse('2026-08-07T13:00:00Z'), server)).toBe(true);
  });

  it('degrada sin lanzar si falta IndexedDB o un blob fue eliminado', async () => {
    const original = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    const restored = await restoreDraftImages([{ id: 'missing', order: 0, blobKey: 'missing-key' }]);
    expect(restored.images).toEqual([]);
    expect(restored.missingBlobKeys).toEqual(['missing-key']);
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: original });
  });
});
