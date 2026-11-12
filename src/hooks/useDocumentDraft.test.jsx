import React, { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useDocumentDraft } from './useDocumentDraft';

const KEY = 'crm-draft:test:b1:nuevo';

function Form({ storageKey = KEY, ready = true }) {
  const [notes, setNotes] = useState('');
  const draft = useDocumentDraft({
    storageKey,
    ready,
    value: { notes },
    onRestore: (d) => setNotes(d.notes || ''),
  });
  return (
    <div>
      <input aria-label="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <span data-testid="dirty">{String(draft.isDirty)}</span>
      <span data-testid="restored">{draft.restoredAt ? 'yes' : 'no'}</span>
      <button onClick={draft.markSaved}>save</button>
      <button onClick={draft.discardDraft}>discard</button>
    </div>
  );
}

describe('useDocumentDraft', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('guarda el borrador y lo recupera al volver a montar', () => {
    vi.useFakeTimers();
    const { unmount } = render(<Form />);
    fireEvent.change(screen.getByLabelText('notes'), { target: { value: 'cliente X' } });
    expect(screen.getByTestId('dirty').textContent).toBe('true');
    act(() => { vi.advanceTimersByTime(500); });
    expect(JSON.parse(localStorage.getItem(KEY)).value).toEqual({ notes: 'cliente X' });
    unmount();

    render(<Form />);
    expect(screen.getByLabelText('notes').value).toBe('cliente X');
    expect(screen.getByTestId('restored').textContent).toBe('yes');
  });

  it('guarda lo pendiente al desmontar aunque no haya pasado el debounce', () => {
    const { unmount } = render(<Form />);
    fireEvent.change(screen.getByLabelText('notes'), { target: { value: 'rápido' } });
    unmount();
    expect(JSON.parse(localStorage.getItem(KEY)).value).toEqual({ notes: 'rápido' });
  });

  it('markSaved borra el borrador y deja el formulario limpio', () => {
    const { unmount } = render(<Form />);
    fireEvent.change(screen.getByLabelText('notes'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('save'));
    expect(screen.getByTestId('dirty').textContent).toBe('false');
    unmount();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('discardDraft vuelve al estado base y elimina el borrador', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, savedAt: Date.now(), value: { notes: 'viejo' } }));
    render(<Form />);
    expect(screen.getByLabelText('notes').value).toBe('viejo');
    fireEvent.click(screen.getByText('discard'));
    expect(screen.getByLabelText('notes').value).toBe('');
    expect(screen.getByTestId('restored').textContent).toBe('no');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('avisa al cerrar la pestaña solo si hay cambios sin guardar', () => {
    render(<Form storageKey={null} />);
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    fireEvent.change(screen.getByLabelText('notes'), { target: { value: 'algo' } });
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('ignora borradores de más de 7 días', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, savedAt: Date.now() - 8 * 86400000, value: { notes: 'antiguo' } }));
    render(<Form />);
    expect(screen.getByLabelText('notes').value).toBe('');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
