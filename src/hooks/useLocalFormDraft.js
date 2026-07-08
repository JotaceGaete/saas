import { useCallback, useEffect, useRef, useState } from 'react';
import { buildDraftKey, readDraft, writeDraft, removeDraft, shouldWriteDraftTick } from 'lib/forms/localDraft';

const DEFAULT_INTERVAL_MS = 3000;

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Generic local-only draft autosave for large forms. Never touches Supabase/the backend —
 * purely a localStorage convenience so a user doesn't lose in-progress input to an
 * accidental reload/navigation/tab close. Pairs naturally with useUnsavedChangesGuard,
 * but is independently usable.
 *
 * Namespaced by `formName` + `scopeId` (e.g. businessId, or `${businessId}:${recordId}`)
 * so drafts never leak between businesses or between different records of the same form
 * (e.g. editing product A must not offer to restore a draft that was for product B, or
 * for creating a brand new product).
 *
 * `data` must be JSON-serializable plain data (form field values) — never File/Blob
 * objects (images/video can't be restored from localStorage; re-upload is expected).
 *
 * Usage:
 *   const { hasDraft, draftSavedAt, restoreDraft, discardDraft, clearDraft } = useLocalFormDraft({
 *     formName: 'product-editor',
 *     scopeId: `${business?.id}:${productId || 'new'}`,
 *     data: formData,
 *     enabled: isDirty,
 *   });
 *
 *   // On mount, if hasDraft, show "Encontramos un borrador sin guardar" prompt:
 *   //   Restaurar -> applyRestoredData(restoreDraft())
 *   //   Descartar -> discardDraft()
 *   // After a successful save -> clearDraft()
 */
export function useLocalFormDraft({ formName, scopeId, data, enabled = true, intervalMs = DEFAULT_INTERVAL_MS }) {
  const storageKey = formName && scopeId != null ? buildDraftKey(formName, scopeId) : null;

  const [hasDraft, setHasDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  // Detect an existing draft whenever we switch to a new form/record scope.
  useEffect(() => {
    if (!storageKey) {
      setHasDraft(false);
      setDraftSavedAt(null);
      return;
    }
    const existing = readDraft(getStorage(), storageKey);
    setHasDraft(!!existing);
    setDraftSavedAt(existing?.savedAt ?? null);
  }, [storageKey]);

  // Periodic autosave (every `intervalMs`) while enabled — only writes when the data
  // actually changed since the last tick, to avoid pointless localStorage churn.
  useEffect(() => {
    if (!storageKey || !enabled) return;
    let lastSerialized = null;
    const tick = () => {
      const { should, serialized } = shouldWriteDraftTick(lastSerialized, dataRef.current);
      if (!should) return;
      if (writeDraft(getStorage(), storageKey, dataRef.current)) {
        lastSerialized = serialized;
        setDraftSavedAt(Date.now());
        setHasDraft(true);
      }
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [storageKey, enabled, intervalMs]);

  const restoreDraft = useCallback(() => {
    if (!storageKey) return null;
    return readDraft(getStorage(), storageKey)?.data ?? null;
  }, [storageKey]);

  const discardDraft = useCallback(() => {
    if (!storageKey) return;
    removeDraft(getStorage(), storageKey);
    setHasDraft(false);
    setDraftSavedAt(null);
  }, [storageKey]);

  return {
    hasDraft,
    draftSavedAt,
    restoreDraft,
    discardDraft,
    clearDraft: discardDraft,
  };
}
