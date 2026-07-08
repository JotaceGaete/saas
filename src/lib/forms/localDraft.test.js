import { describe, it, expect, vi } from 'vitest';
import { buildDraftKey, buildFormRecordScopeId, readDraft, writeDraft, removeDraft, shouldWriteDraftTick } from './localDraft';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    _store: store,
  };
}

describe('buildDraftKey', () => {
  it('namespacea por formulario y scope (businessId / businessId:recordId)', () => {
    expect(buildDraftKey('product-editor', 'biz1:prod1')).toBe('ventalink_draft_v1:product-editor:biz1:prod1');
  });

  it('usa "anon" cuando no hay scopeId', () => {
    expect(buildDraftKey('product-editor', undefined)).toBe('ventalink_draft_v1:product-editor:anon');
  });

  it('claves distintas para registros distintos del mismo formulario (no se filtran entre sí)', () => {
    const keyA = buildDraftKey('product-editor', 'biz1:prod-A');
    const keyB = buildDraftKey('product-editor', 'biz1:prod-B');
    expect(keyA).not.toBe(keyB);
  });
});

describe('buildFormRecordScopeId', () => {
  it('arma negocio:modo:registro', () => {
    expect(buildFormRecordScopeId({ businessId: 'biz1', mode: 'edit', recordId: 'prod-A' }))
      .toBe('biz1:edit:prod-A');
  });

  it('usa "new" como registro cuando no hay recordId (producto nuevo)', () => {
    expect(buildFormRecordScopeId({ businessId: 'biz1', mode: 'new', recordId: null }))
      .toBe('biz1:new:new');
  });

  it('el scope de "nuevo" nunca coincide con el de editar un registro puntual', () => {
    const newScope  = buildFormRecordScopeId({ businessId: 'biz1', mode: 'new', recordId: null });
    const editScope = buildFormRecordScopeId({ businessId: 'biz1', mode: 'edit', recordId: 'prod-A' });
    expect(newScope).not.toBe(editScope);
  });

  it('registros distintos del mismo negocio y modo tienen scopes distintos', () => {
    const scopeA = buildFormRecordScopeId({ businessId: 'biz1', mode: 'edit', recordId: 'prod-A' });
    const scopeB = buildFormRecordScopeId({ businessId: 'biz1', mode: 'edit', recordId: 'prod-B' });
    expect(scopeA).not.toBe(scopeB);
  });

  it('el mismo registro en negocios distintos tiene scopes distintos', () => {
    const scopeBiz1 = buildFormRecordScopeId({ businessId: 'biz1', mode: 'edit', recordId: 'prod-A' });
    const scopeBiz2 = buildFormRecordScopeId({ businessId: 'biz2', mode: 'edit', recordId: 'prod-A' });
    expect(scopeBiz1).not.toBe(scopeBiz2);
  });

  it('devuelve null sin negocio (no hay dónde namespacear el borrador)', () => {
    expect(buildFormRecordScopeId({ businessId: null, mode: 'new', recordId: null })).toBeNull();
  });
});

describe('writeDraft / readDraft / removeDraft', () => {
  it('escribe y lee un borrador con su timestamp', () => {
    const storage = createMemoryStorage();
    const key = buildDraftKey('product-editor', 'biz1:new');
    const ok = writeDraft(storage, key, { nombre: 'Zapatillas', precio: '19990' });
    expect(ok).toBe(true);

    const draft = readDraft(storage, key);
    expect(draft.data).toEqual({ nombre: 'Zapatillas', precio: '19990' });
    expect(typeof draft.savedAt).toBe('number');
  });

  it('readDraft devuelve null si no hay nada guardado', () => {
    const storage = createMemoryStorage();
    expect(readDraft(storage, buildDraftKey('product-editor', 'biz1:new'))).toBeNull();
  });

  it('readDraft devuelve null ante JSON corrupto (no revienta el formulario)', () => {
    const storage = createMemoryStorage();
    const key = buildDraftKey('product-editor', 'biz1:new');
    storage.setItem(key, '{not valid json');
    expect(readDraft(storage, key)).toBeNull();
  });

  it('removeDraft elimina el borrador (se usa al descartar o tras guardar con éxito)', () => {
    const storage = createMemoryStorage();
    const key = buildDraftKey('product-editor', 'biz1:new');
    writeDraft(storage, key, { nombre: 'Zapatillas' });
    expect(readDraft(storage, key)).not.toBeNull();

    removeDraft(storage, key);
    expect(readDraft(storage, key)).toBeNull();
  });

  it('sin storage disponible (SSR / bloqueado) no revienta, solo no persiste', () => {
    expect(writeDraft(null, 'k', { a: 1 })).toBe(false);
    expect(readDraft(null, 'k')).toBeNull();
    expect(() => removeDraft(null, 'k')).not.toThrow();
  });

  it('si localStorage tira (cuota excedida / modo privado), writeDraft no revienta', () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: vi.fn(),
    };
    expect(writeDraft(storage, 'k', { a: 1 })).toBe(false);
  });
});

describe('shouldWriteDraftTick', () => {
  it('escribe en el primer tick (no hay serialized previo)', () => {
    const { should, serialized } = shouldWriteDraftTick(null, { nombre: 'A' });
    expect(should).toBe(true);
    expect(serialized).toBe(JSON.stringify({ nombre: 'A' }));
  });

  it('no vuelve a escribir si los datos no cambiaron desde el último tick', () => {
    const first = shouldWriteDraftTick(null, { nombre: 'A' });
    const second = shouldWriteDraftTick(first.serialized, { nombre: 'A' });
    expect(second.should).toBe(false);
  });

  it('vuelve a escribir cuando los datos cambian entre ticks', () => {
    const first = shouldWriteDraftTick(null, { nombre: 'A' });
    const second = shouldWriteDraftTick(first.serialized, { nombre: 'A editado' });
    expect(second.should).toBe(true);
  });
});
