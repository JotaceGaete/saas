/**
 * Silent local backup of the product editor's form fields (V2 mínima).
 * Read/write/remove are wrapped in try/catch because localStorage can throw
 * (private mode, quota, disabled storage) — this feature must never break
 * the editor. It never touches Supabase and never persists images/video,
 * only the plain formData fields, so it can't produce an incomplete product.
 */
export function buildDraftKey(businessId, productId) {
  return `product-editor:${businessId}:${productId || 'new'}`;
}

export function buildDraftSnapshot(formData) {
  return { formData, savedAt: Date.now() };
}

export function readDraft(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeDraft(key, draft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Silencioso por diseño: si localStorage falla, el editor sigue funcionando.
  }
}

export function removeDraft(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Silencioso por diseño.
  }
}

/**
 * Single place that decides whether a change should be persisted: only
 * while isDirty is true, and only when there's a valid key for this
 * business/product. Used both by the debounced "on type" save and by the
 * immediate flush on blur/visibilitychange/beforeunload.
 */
export function persistDraftIfDirty({ isDirty, key, formData, write = writeDraft }) {
  if (!isDirty || !key) return false;
  write(key, buildDraftSnapshot(formData));
  return true;
}
