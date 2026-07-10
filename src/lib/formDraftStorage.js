/**
 * Silent local backup of the product editor's form fields (V2 mínima).
 * Read/write/remove are wrapped in try/catch because localStorage can throw
 * (private mode, quota, disabled storage) — this feature must never break
 * the editor. It never touches Supabase and never creates a product, so it
 * can't produce an incomplete product.
 *
 * Images: only images that already have a real (non-blob) URL — uploaded to
 * temporary or definitive storage — are persisted. A raw File/blob only
 * exists in memory for the current tab, so it's never written to
 * localStorage; those images are reported via hasUnpersistedImages so the
 * UI can show a discreet notice instead of silently losing them.
 */
export function buildDraftKey(businessId, productId) {
  return `product-editor:${businessId}:${productId || 'new'}`;
}

export function isPersistableImage(image) {
  if (!image) return false;
  if (image.persistedUrl) return true;
  return typeof image.url === 'string' && !image.url.startsWith('blob:');
}

/**
 * Splits the editor's images into the subset safe to write to localStorage
 * (real URLs only) and a flag for the rest (local File/blob previews that
 * would disappear on reload no matter what we do).
 */
export function splitDraftableImages(images) {
  const list = Array.isArray(images) ? images : [];
  const persistable = [];
  let hasUnpersistedImages = false;

  list.forEach((image) => {
    if (isPersistableImage(image)) {
      const { id, url, persistedUrl, thumbnailUrl, thumbnailPath, alt, name } = image;
      persistable.push({ id, url, persistedUrl, thumbnailUrl, thumbnailPath, alt, name });
    } else {
      hasUnpersistedImages = true;
    }
  });

  return { persistable, hasUnpersistedImages };
}

export function buildDraftSnapshot(formData, images) {
  const { persistable, hasUnpersistedImages } = splitDraftableImages(images);
  return {
    formData,
    images: persistable,
    hasUnpersistedImages,
    savedAt: Date.now(),
  };
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
 * immediate flush on blur/visibilitychange/beforeunload. Returns the
 * snapshot that was written (or null if nothing was written) so the caller
 * can react to hasUnpersistedImages without recomputing it.
 */
export function persistDraftIfDirty({ isDirty, key, formData, images, write = writeDraft }) {
  if (!isDirty || !key) return null;
  const snapshot = buildDraftSnapshot(formData, images);
  write(key, snapshot);
  return snapshot;
}
