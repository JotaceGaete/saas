import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildEditorDraftKey } from './editorDraftKey';
import { persistDraftIfDirty, readDraft, removeDraft } from './formDraftStorage';

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

/**
 * Exercises the storage contract useLocalDraft (src/hooks/useLocalDraft.js)
 * relies on for the business/design editors, using the same already-tested
 * primitives from formDraftStorage.js (untouched) plus the new
 * buildEditorDraftKey. localStorage persists across "remounts" and page
 * reloads by definition, so reading a freshly-written draft in a new
 * describe/it block is an accurate simulation of both scenarios.
 */
describe('draft de editor de negocio/diseño: escenarios de recuperación', () => {
  const key = buildEditorDraftKey('design', 'biz-1');

  afterEach(() => removeDraft(key));

  it('navegar fuera y volver: el borrador escrito se puede leer de nuevo', () => {
    const formData = { logoUrl: 'https://cdn/logo.png', headerImageUrl: '', theme: 'minimal' };
    const written = persistDraftIfDirty({ isDirty: true, key, formData, images: [] });
    expect(written).not.toBeNull();

    // Simula que el componente se desmontó y se volvió a montar.
    const restored = readDraft(key);
    expect(restored?.formData).toEqual(formData);
  });

  it('recarga de página: localStorage sobrevive y el draft sigue disponible', () => {
    const formData = { name: 'Mi Tienda', description: 'desc en curso' };
    persistDraftIfDirty({ isDirty: true, key, formData, images: [] });

    // Una recarga real no borra localStorage; leer de nuevo es la simulación correcta.
    const restored = readDraft(key);
    expect(restored?.formData).toEqual(formData);
    expect(typeof restored?.savedAt).toBe('number');
  });

  it('guardado exitoso en servidor: limpia el borrador completo', () => {
    persistDraftIfDirty({ isDirty: true, key, formData: { name: 'x' }, images: [] });
    expect(readDraft(key)).not.toBeNull();

    // Lo que clearDraft() hace tras un save exitoso.
    removeDraft(key);
    expect(readDraft(key)).toBeNull();
  });

  it('descarte manual ("Descartar cambios"/reset): limpia el borrador completo', () => {
    persistDraftIfDirty({ isDirty: true, key, formData: { logoUrl: 'https://cdn/logo.png' }, images: [] });
    expect(readDraft(key)).not.toBeNull();

    // Lo que clearDraft() hace cuando el usuario descarta explícitamente.
    removeDraft(key);
    expect(readDraft(key)).toBeNull();
  });

  it('mientras isDirty=false no se escribe nada (evita drafts fantasma)', () => {
    const result = persistDraftIfDirty({ isDirty: false, key, formData: { name: 'x' }, images: [] });
    expect(result).toBeNull();
    expect(readDraft(key)).toBeNull();
  });

  it('namespaces distintos (design vs business-config) no se pisan entre sí', () => {
    const designKey = buildEditorDraftKey('design', 'biz-1');
    const configKey = buildEditorDraftKey('business-config', 'biz-1');
    persistDraftIfDirty({ isDirty: true, key: designKey, formData: { logoUrl: 'https://cdn/logo.png' }, images: [] });
    persistDraftIfDirty({ isDirty: true, key: configKey, formData: { name: 'Otra cosa' }, images: [] });

    expect(readDraft(designKey)?.formData).toEqual({ logoUrl: 'https://cdn/logo.png' });
    expect(readDraft(configKey)?.formData).toEqual({ name: 'Otra cosa' });

    removeDraft(configKey);
  });
});
