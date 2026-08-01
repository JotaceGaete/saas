import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildDraftKey,
  buildDraftSnapshot,
  splitDraftableImages,
  isPersistableImage,
  readDraft,
  writeDraft,
  removeDraft,
  persistDraftIfDirty,
} from './formDraftStorage';
import { createDebouncer } from './debounce';

function createMemoryLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  globalThis.window = globalThis.window || {};
  globalThis.window.localStorage = createMemoryLocalStorage();
});

describe('buildDraftKey', () => {
  it('namespaces by businessId and productId', () => {
    expect(buildDraftKey('biz-1', 'prod-1')).toBe('product-editor:biz-1:prod-1');
  });

  it('falls back to "new" when there is no productId (new product)', () => {
    expect(buildDraftKey('biz-1', null)).toBe('product-editor:biz-1:new');
    expect(buildDraftKey('biz-1', undefined)).toBe('product-editor:biz-1:new');
  });
});

describe('guarda draft con isDirty', () => {
  it('persists the draft when isDirty is true', () => {
    const key = buildDraftKey('biz-1', 'new');
    const formData = { nombre: 'Empanada' };
    const wrote = persistDraftIfDirty({ isDirty: true, key, formData });
    expect(wrote).not.toBeNull();
    expect(readDraft(key)?.formData).toEqual(formData);
  });

  it('does not persist anything when isDirty is false (Regla 1: sin cambios, nada que guardar)', () => {
    const key = buildDraftKey('biz-1', 'new');
    persistDraftIfDirty({ isDirty: false, key, formData: { nombre: 'Empanada' } });
    expect(readDraft(key)).toBeNull();
  });

  it('does not persist when there is no key (e.g. business not loaded yet)', () => {
    const write = vi.fn();
    persistDraftIfDirty({ isDirty: true, key: null, formData: { nombre: 'x' }, write });
    expect(write).not.toHaveBeenCalled();
  });
});

describe('guarda en visibilitychange (flush inmediato, sin esperar el debounce)', () => {
  it('flush() persists right away even if the 500ms debounce has not elapsed', () => {
    vi.useFakeTimers();
    const key = buildDraftKey('biz-1', 'new');
    const debouncer = createDebouncer(500);

    // El usuario escribe: se agenda el guardado debounced...
    debouncer.schedule(() => persistDraftIfDirty({ isDirty: true, key, formData: { nombre: 'a' } }));
    expect(readDraft(key)).toBeNull(); // todavía no pasaron los 500ms

    // ...pero cambia de pestaña (document.hidden) antes de que se cumpla el debounce.
    debouncer.flush(() => persistDraftIfDirty({ isDirty: true, key, formData: { nombre: 'a' } }));
    expect(readDraft(key)?.formData).toEqual({ nombre: 'a' });

    vi.useRealTimers();
  });
});

describe('restaura solo con misma key', () => {
  it('a draft written under one business/product key is not visible under another', () => {
    const keyA = buildDraftKey('biz-1', 'new');
    const keyB = buildDraftKey('biz-2', 'new');
    const keyC = buildDraftKey('biz-1', 'prod-99');

    writeDraft(keyA, buildDraftSnapshot({ nombre: 'Solo de biz-1 nuevo' }));

    expect(readDraft(keyA)?.formData?.nombre).toBe('Solo de biz-1 nuevo');
    expect(readDraft(keyB)).toBeNull();
    expect(readDraft(keyC)).toBeNull();
  });

  it('returns null for a key that was never written', () => {
    expect(readDraft('product-editor:biz-404:new')).toBeNull();
  });
});

describe('limpia draft al guardar', () => {
  it('removes the draft once the save succeeds (Regla E)', () => {
    const key = buildDraftKey('biz-1', 'new');
    writeDraft(key, buildDraftSnapshot({ nombre: 'Por guardar' }));
    expect(readDraft(key)).not.toBeNull();

    // Lo que hace doSave en el éxito: isDirty=false + removeDraft.
    removeDraft(key);

    expect(readDraft(key)).toBeNull();
  });
});

describe('limpia draft al salir sin guardar', () => {
  it('removes the draft when the user chooses "Salir sin guardar" (Regla F)', () => {
    const key = buildDraftKey('biz-1', 'prod-7');
    writeDraft(key, buildDraftSnapshot({ nombre: 'Cambios descartados' }));
    expect(readDraft(key)).not.toBeNull();

    // Lo que hace handleDeleteLocalDraft: removeDraft.
    removeDraft(key);

    expect(readDraft(key)).toBeNull();
  });

  it('leaving one product draft does not touch a different product draft (Regla G)', () => {
    const keyLeaving = buildDraftKey('biz-1', 'prod-7');
    const keyOther = buildDraftKey('biz-1', 'prod-8');
    writeDraft(keyLeaving, buildDraftSnapshot({ nombre: 'Se descarta' }));
    writeDraft(keyOther, buildDraftSnapshot({ nombre: 'No se toca' }));

    removeDraft(keyLeaving);

    expect(readDraft(keyLeaving)).toBeNull();
    expect(readDraft(keyOther)?.formData?.nombre).toBe('No se toca');
  });
});

describe('draft guarda image URLs existentes', () => {
  it('keeps images that already have a persistedUrl (definitiva)', () => {
    const images = [
      { id: 'img-1', url: 'https://cdn.example.com/a.jpg', persistedUrl: 'https://cdn.example.com/a.jpg', status: 'uploaded' },
    ];
    const snapshot = buildDraftSnapshot({ nombre: 'Con imagen' }, images);
    expect(snapshot.images).toEqual([
      expect.objectContaining({ id: 'img-1', url: 'https://cdn.example.com/a.jpg', persistedUrl: 'https://cdn.example.com/a.jpg' }),
    ]);
    expect(snapshot.hasUnpersistedImages).toBe(false);
  });

  it('keeps images with a temporary (non-blob) upload URL even without persistedUrl', () => {
    const images = [{ id: 'img-2', url: 'https://uploads.example.com/tmp/b.jpg', status: 'uploading' }];
    const { persistable, hasUnpersistedImages } = splitDraftableImages(images);
    expect(persistable).toHaveLength(1);
    expect(persistable[0].url).toBe('https://uploads.example.com/tmp/b.jpg');
    expect(hasUnpersistedImages).toBe(false);
  });

  it('persists across the write/read roundtrip via localStorage', () => {
    const key = buildDraftKey('biz-1', 'new');
    const images = [{ id: 'img-1', url: 'https://cdn.example.com/a.jpg', persistedUrl: 'https://cdn.example.com/a.jpg' }];
    persistDraftIfDirty({ isDirty: true, key, formData: { nombre: 'Con imagen' }, images });
    expect(readDraft(key)?.images?.[0]?.persistedUrl).toBe('https://cdn.example.com/a.jpg');
  });
});

describe('no guarda objetos File', () => {
  it('excludes an image that is still a local blob: preview with a raw File', () => {
    const rawFile = new Blob(['fake-bytes'], { type: 'image/png' });
    const images = [{ id: 'img-3', url: 'blob:http://localhost/abc-123', file: rawFile, status: 'pending' }];
    const snapshot = buildDraftSnapshot({ nombre: 'x' }, images);
    expect(snapshot.images).toEqual([]);
  });

  it('never includes a "file" field even if somehow present alongside a real URL', () => {
    const rawFile = new Blob(['fake-bytes'], { type: 'image/png' });
    const images = [{ id: 'img-4', url: 'https://cdn.example.com/c.jpg', persistedUrl: 'https://cdn.example.com/c.jpg', file: rawFile }];
    const { persistable } = splitDraftableImages(images);
    expect(persistable[0]).not.toHaveProperty('file');
  });

  it('the JSON written to localStorage never contains a File/Blob object', () => {
    const key = buildDraftKey('biz-1', 'new');
    const rawFile = new Blob(['fake-bytes'], { type: 'image/png' });
    const images = [{ id: 'img-5', url: 'blob:http://localhost/xyz', file: rawFile, status: 'pending' }];
    persistDraftIfDirty({ isDirty: true, key, formData: {}, images });
    const rawStored = window.localStorage.getItem(key);
    expect(rawStored).not.toContain('blob:http://localhost/xyz');
  });

  it('isPersistableImage rejects blob previews and accepts real URLs', () => {
    expect(isPersistableImage({ url: 'blob:http://localhost/abc' })).toBe(false);
    expect(isPersistableImage({ url: 'https://cdn.example.com/a.jpg' })).toBe(true);
    expect(isPersistableImage({ persistedUrl: 'https://cdn.example.com/a.jpg' })).toBe(true);
    expect(isPersistableImage(null)).toBe(false);
  });
});

describe('restaura image URLs', () => {
  it('a restored draft exposes the persisted image URLs untouched', () => {
    const key = buildDraftKey('biz-1', 'new');
    const images = [
      { id: 'img-1', url: 'https://cdn.example.com/a.jpg', persistedUrl: 'https://cdn.example.com/a.jpg' },
      { id: 'img-2', url: 'https://cdn.example.com/b.jpg', persistedUrl: 'https://cdn.example.com/b.jpg' },
    ];
    persistDraftIfDirty({ isDirty: true, key, formData: { nombre: 'Con dos imagenes' }, images });

    const restored = readDraft(key);
    expect(restored.images.map((img) => img.url)).toEqual([
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
    ]);
  });

  it('does not invent images: an empty draft.images restores to no images, not placeholders', () => {
    const key = buildDraftKey('biz-1', 'new');
    persistDraftIfDirty({ isDirty: true, key, formData: { nombre: 'Solo texto' }, images: [] });
    const restored = readDraft(key);
    expect(restored.images).toEqual([]);
  });
});

describe('muestra advertencia si había imágenes locales no persistibles', () => {
  it('hasUnpersistedImages is true when a local File/blob image was dropped from the draft', () => {
    const images = [
      { id: 'img-1', url: 'https://cdn.example.com/a.jpg', persistedUrl: 'https://cdn.example.com/a.jpg' },
      { id: 'img-2', url: 'blob:http://localhost/local-only', file: new Blob(['x']), status: 'pending' },
    ];
    const snapshot = buildDraftSnapshot({ nombre: 'Mixto' }, images);
    expect(snapshot.hasUnpersistedImages).toBe(true);
    expect(snapshot.images).toHaveLength(1);
  });

  it('hasUnpersistedImages is false when every image already has a real URL', () => {
    const images = [{ id: 'img-1', url: 'https://cdn.example.com/a.jpg', persistedUrl: 'https://cdn.example.com/a.jpg' }];
    expect(buildDraftSnapshot({}, images).hasUnpersistedImages).toBe(false);
  });

  it('the written snapshot carries the flag so the editor can show the discreet notice', () => {
    const key = buildDraftKey('biz-1', 'new');
    const images = [{ id: 'img-2', url: 'blob:http://localhost/local-only', file: new Blob(['x']), status: 'pending' }];
    const snapshot = persistDraftIfDirty({ isDirty: true, key, formData: {}, images });
    expect(snapshot.hasUnpersistedImages).toBe(true);
    expect(readDraft(key).hasUnpersistedImages).toBe(true);
  });
});
