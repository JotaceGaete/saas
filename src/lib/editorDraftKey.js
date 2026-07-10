/**
 * Draft key for whole-editor forms (business-configuration, design) that
 * have a single working copy per business — unlike product-editor's
 * buildDraftKey (formDraftStorage.js), which is keyed per product too.
 * Deliberately kept separate from formDraftStorage.js instead of adding a
 * namespace param there, to avoid touching an already-tested file.
 */
export function buildEditorDraftKey(namespace, businessId) {
  const ns = String(namespace || '').trim();
  const id = String(businessId || '').trim();
  if (!ns || !id) return null;
  return `${ns}:${id}`;
}
