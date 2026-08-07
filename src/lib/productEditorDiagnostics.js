const DIAGNOSTIC_KEY = 'walinka:diagnostics:product-editor';
const MAX_ENTRIES = 500;

function safePayload(payload) {
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return { serializationError: true };
  }
}

export function productEditorDiagnostic(event, payload = {}) {
  if (typeof window === 'undefined') return;
  const entry = {
    timestamp: new Date().toISOString(),
    elapsedMs: Math.round(performance.now()),
    event,
    path: `${window.location.pathname}${window.location.search}`,
    ...safePayload(payload),
  };
  console.info('[ProductEditorDiagnostic]', entry);
  try {
    const previous = JSON.parse(window.sessionStorage.getItem(DIAGNOSTIC_KEY) || '[]');
    const entries = Array.isArray(previous) ? previous : [];
    entries.push(entry);
    window.sessionStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Diagnostics must never affect ProductEditor behavior.
  }
}

export function summarizeProductDraft(draft) {
  if (!draft) return null;
  return {
    schemaVersion: draft.schemaVersion,
    formData: draft.formData,
    images: Array.isArray(draft.images) ? draft.images : [],
    currentProductId: draft.currentProductId || null,
    temporaryProductDraft: draft.temporaryProductDraft === true,
    savedAt: draft.savedAt || null,
  };
}
