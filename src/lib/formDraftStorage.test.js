import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildDraftKey,
  buildDraftSnapshot,
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
    expect(wrote).toBe(true);
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

    // Lo que hace handleLeaveWithoutSaving: isDirty=false + removeDraft + navigate.
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
