import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigationGuard } from '../contexts/NavigationGuardContext';
import { createDebouncer } from '../lib/debounce';
import { persistDraftIfDirty, readDraft, removeDraft } from '../lib/formDraftStorage';

/**
 * Local-draft wiring for whole-form editors (business-configuration, design)
 * that already compute their own isDirty via a baseline-snapshot comparison
 * — unlike product-editor, they don't need formDirtyTracker's "skip the
 * first render" trick, since their isDirty starts false naturally once the
 * baseline is seeded from the loaded record.
 *
 * Built entirely on the existing draft primitives (formDraftStorage.js,
 * debounce.js, NavigationGuardContext) — not a second persistence system.
 * Images are never handled here: by the time logo/cover reach form state in
 * these editors they're already-uploaded URLs (see DesignCustomization.jsx),
 * so there's never a File/Blob to special-case or keep out of localStorage.
 *
 * `data` must be the actual working-copy value (React state, not a
 * pre-stringified snapshot) so the debounce effect reschedules on every
 * edit, not only on the dirty/clean transition.
 */
export function useLocalDraft({ key, isDirty, data, onApplyDraft, debounceMs = 600 }) {
  const { setGuard, clearGuard } = useNavigationGuard();
  const debouncerRef = useRef(null);
  if (!debouncerRef.current) debouncerRef.current = createDebouncer(debounceMs);

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const dataRef = useRef(data);
  dataRef.current = data;

  const [status, setStatus] = useState('idle'); // idle | saving | saved
  const [draftBanner, setDraftBanner] = useState(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [isLeaveDialogSaving, setIsLeaveDialogSaving] = useState(false);
  const pendingLeaveActionRef = useRef(null);
  const checkedKeyRef = useRef(null);
  const statusTimerRef = useRef(null);

  const persistNow = useCallback(() => {
    if (!isDirtyRef.current || !key) return;
    persistDraftIfDirty({ isDirty: isDirtyRef.current, key, formData: dataRef.current, images: [] });
    setStatus('saved');
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus('idle'), 2000);
  }, [key]);

  // Debounced autosave while dirty — reschedules on every real edit.
  useEffect(() => {
    if (!isDirty || !key) return;
    setStatus('saving');
    debouncerRef.current.schedule(persistNow);
  }, [isDirty, key, data, persistNow]);

  // Immediate flush on blur / visibilitychange(hidden) / beforeunload.
  useEffect(() => {
    if (!key) return;
    const flush = () => debouncerRef.current.flush(persistNow);
    const handleVisibility = () => { if (document.hidden) flush(); };
    window.addEventListener('blur', flush);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('blur', flush);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', flush);
    };
  }, [key, persistNow]);

  // Flush (not just cancel) on unmount, so navigating away via a route not
  // covered by the guard below still keeps the latest edit.
  useEffect(() => () => { debouncerRef.current.flush(persistNow); }, [persistNow]);

  // Register the in-app navigation guard: every sidebar/mobile-nav/FAB click
  // already calls attemptLeave(), so this is the only wiring needed.
  useEffect(() => {
    setGuard((action) => {
      if (!isDirty) { action(); return; }
      pendingLeaveActionRef.current = action;
      setShowLeaveDialog(true);
    });
    return () => clearGuard();
  }, [isDirty, setGuard, clearGuard]);

  // Offer to restore an existing draft once per key (never silently, since
  // these editors always start from real DB data, never an empty/new state).
  useEffect(() => {
    if (!key || checkedKeyRef.current === key) return;
    checkedKeyRef.current = key;
    const existing = readDraft(key);
    if (existing) setDraftBanner({ draft: existing });
  }, [key]);

  const restoreDraft = useCallback(() => {
    if (draftBanner?.draft) onApplyDraft?.(draftBanner.draft.formData);
    setDraftBanner(null);
  }, [draftBanner, onApplyDraft]);

  const dismissDraftBanner = useCallback(() => setDraftBanner(null), []);

  const deleteDraft = useCallback(() => {
    if (key) removeDraft(key);
    setDraftBanner(null);
  }, [key]);

  /** Call after a successful server save, or on explicit "Descartar cambios". */
  const clearDraft = useCallback(() => {
    debouncerRef.current.cancel();
    if (key) removeDraft(key);
    setStatus('idle');
  }, [key]);

  const handleKeepEditing = useCallback(() => {
    setShowLeaveDialog(false);
    pendingLeaveActionRef.current = null;
  }, []);

  const handleLeaveWithoutSaving = useCallback(() => {
    setShowLeaveDialog(false);
    clearDraft();
    const action = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    action?.();
  }, [clearDraft]);

  /** saveFn must be async and return false (or throw) on failure. */
  const handleSaveAndLeave = useCallback(async (saveFn) => {
    setIsLeaveDialogSaving(true);
    try {
      const result = await saveFn?.();
      if (result === false) return;
      setShowLeaveDialog(false);
      const action = pendingLeaveActionRef.current;
      pendingLeaveActionRef.current = null;
      action?.();
    } finally {
      setIsLeaveDialogSaving(false);
    }
  }, []);

  return {
    status,
    draftBanner,
    showLeaveDialog,
    isLeaveDialogSaving,
    restoreDraft,
    dismissDraftBanner,
    deleteDraft,
    clearDraft,
    handleKeepEditing,
    handleLeaveWithoutSaving,
    handleSaveAndLeave,
  };
}
