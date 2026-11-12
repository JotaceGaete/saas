import { useCallback, useEffect, useRef, useState } from 'react';

const DRAFT_VERSION = 1;
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const SAVE_DEBOUNCE_MS = 400;

function safeStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readDraft(storageKey) {
  const ls = safeStorage();
  if (!ls || !storageKey) return null;
  try {
    const raw = ls.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== DRAFT_VERSION || !parsed.value) return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DRAFT_MAX_AGE_MS) {
      ls.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(storageKey, value) {
  const ls = safeStorage();
  if (!ls || !storageKey) return;
  try {
    ls.setItem(storageKey, JSON.stringify({ v: DRAFT_VERSION, savedAt: Date.now(), value }));
  } catch {
    // Cuota llena o storage bloqueado: el borrador es una ayuda, no crítico.
  }
}

export function removeDraft(storageKey) {
  const ls = safeStorage();
  if (!ls || !storageKey) return;
  try {
    ls.removeItem(storageKey);
  } catch {
    /* noop */
  }
}

/**
 * Borrador local para formularios de documentos (presupuestos, notas de venta).
 *
 * - Guarda automáticamente `value` en localStorage (si hay `storageKey`) mientras
 *   el formulario tenga cambios respecto de su estado base.
 * - Al quedar `ready`, toma el estado actual como base y, si existe un borrador
 *   guardado distinto, lo entrega a `onRestore` para recuperarlo.
 * - Mientras haya cambios sin guardar, avisa al cerrar/recargar la pestaña.
 *
 * Sin `storageKey` solo hace el seguimiento de cambios + aviso al salir.
 */
export function useDocumentDraft({ storageKey, ready, value, onRestore }) {
  const serialized = JSON.stringify(value);
  const [baseline, setBaseline] = useState(null);
  const baselineValueRef = useRef(null);
  const initializedScopeRef = useRef(null);
  const [restoredAt, setRestoredAt] = useState(null);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const valueRef = useRef(value);
  valueRef.current = value;

  const scope = storageKey || '__no-storage__';

  // Inicialización: fijar estado base y recuperar borrador si lo hay.
  useEffect(() => {
    if (!ready || initializedScopeRef.current === scope) return;
    initializedScopeRef.current = scope;
    baselineValueRef.current = valueRef.current;
    setBaseline(serialized);
    setRestoredAt(null);
    const draft = readDraft(storageKey);
    if (draft && JSON.stringify(draft.value) !== serialized) {
      onRestoreRef.current?.(draft.value);
      setRestoredAt(draft.savedAt);
    }
  }, [ready, scope, storageKey, serialized]);

  const isDirty = ready && baseline !== null && serialized !== baseline;

  // Autoguardado (con debounce).
  useEffect(() => {
    if (!storageKey || baseline === null) return undefined;
    const t = setTimeout(() => {
      if (isDirty) writeDraft(storageKey, JSON.parse(serialized));
      else removeDraft(storageKey);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [storageKey, baseline, serialized, isDirty]);

  // Al desmontar (navegación interna), guardar lo pendiente del debounce.
  const pendingRef = useRef({ storageKey, isDirty, serialized });
  pendingRef.current = { storageKey, isDirty, serialized };
  useEffect(() => () => {
    const p = pendingRef.current;
    if (p.storageKey && p.isDirty) writeDraft(p.storageKey, JSON.parse(p.serialized));
  }, []);

  // Guardar de inmediato si la pestaña se oculta (evita perder el último debounce).
  useEffect(() => {
    if (!storageKey || !isDirty) return undefined;
    const flush = () => {
      if (document.visibilityState === 'hidden') writeDraft(storageKey, JSON.parse(serialized));
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [storageKey, isDirty, serialized]);

  // Aviso nativo del navegador al cerrar o recargar con cambios sin guardar.
  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (e) => {
      if (storageKey) writeDraft(storageKey, JSON.parse(serialized));
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, storageKey, serialized]);

  /** Llamar tras guardar en el servidor: el estado actual pasa a ser la base. */
  const markSaved = useCallback(() => {
    removeDraft(storageKey);
    pendingRef.current = { ...pendingRef.current, isDirty: false };
    baselineValueRef.current = valueRef.current;
    setBaseline(JSON.stringify(valueRef.current));
    setRestoredAt(null);
  }, [storageKey]);

  /** Descarta el borrador y vuelve el formulario a su estado base. */
  const discardDraft = useCallback(() => {
    removeDraft(storageKey);
    setRestoredAt(null);
    if (baselineValueRef.current) onRestoreRef.current?.(baselineValueRef.current);
  }, [storageKey]);

  return { isDirty, restoredAt, markSaved, discardDraft };
}
