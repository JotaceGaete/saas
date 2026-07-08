// Pura lógica de borradores locales (sin React, sin acceso directo a `window`).
// El storage se recibe por parámetro para poder testear sin jsdom y para que el hook
// decida cuándo pasar `window.localStorage` (o `null` en SSR / storage no disponible).

const DRAFT_KEY_PREFIX = 'ventalink_draft_v1';

// Namespacea por formulario + registro (businessId, o `${businessId}:${recordId}`) para
// que un borrador nunca se filtre entre negocios ni entre distintos registros del mismo
// formulario (ej. editar el producto A no debe ofrecer restaurar un borrador del producto B).
export function buildDraftKey(formName, scopeId) {
  return `${DRAFT_KEY_PREFIX}:${formName}:${scopeId ?? 'anon'}`;
}

// Construye el scopeId de un formulario "registro" (producto, presupuesto, factura, etc.):
// negocio + modo (nuevo/edición) + registro. El modo es explícito a propósito — así un
// borrador de "nuevo" NUNCA se confunde con el de editar un registro puntual, aunque
// ambos compartan negocio, y un registro nunca hereda el borrador de otro.
// Devuelve null si no hay negocio (sin negocio no hay dónde namespacear el borrador).
export function buildFormRecordScopeId({ businessId, mode, recordId }) {
  if (!businessId) return null;
  return `${businessId}:${mode}:${recordId || 'new'}`;
}

export function readDraft(storage, storageKey) {
  if (!storage || !storageKey) return null;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && 'data' in parsed ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDraft(storage, storageKey, data) {
  if (!storage || !storageKey) return false;
  try {
    storage.setItem(storageKey, JSON.stringify({ data, savedAt: Date.now() }));
    return true;
  } catch {
    // Cuota excedida / modo privado — feature de conveniencia best-effort, nunca debe
    // romper el formulario real.
    return false;
  }
}

export function removeDraft(storage, storageKey) {
  if (!storage || !storageKey) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}

// Decide si vale la pena escribir en este "tick" del autosave periódico: solo si los
// datos cambiaron desde el último tick (evita escrituras innecesarias a localStorage).
export function shouldWriteDraftTick(previousSerialized, data) {
  let serialized;
  try {
    serialized = JSON.stringify(data);
  } catch {
    return { should: false, serialized: previousSerialized };
  }
  return { should: serialized !== previousSerialized, serialized };
}
