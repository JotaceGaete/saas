import { describe, it, expect } from 'vitest';
import { createDirtyTracker } from './formDirtyTracker';

describe('createDirtyTracker', () => {
  it('does not mark dirty for the initial hydration (mount / load)', () => {
    const tracker = createDirtyTracker();
    expect(tracker.onWatchedChange()).toBe(false);
  });

  it('marks dirty on the first real change after hydration (Regla 1)', () => {
    const tracker = createDirtyTracker();
    tracker.onWatchedChange(); // initial hydration, ignored
    expect(tracker.onWatchedChange()).toBe(true);
  });

  it('keeps reporting dirty for subsequent changes', () => {
    const tracker = createDirtyTracker();
    tracker.onWatchedChange();
    tracker.onWatchedChange();
    expect(tracker.onWatchedChange()).toBe(true);
  });

  it('ignores the write right after armSkip (e.g. loading a product, or resetting after "Guardar y crear otro")', () => {
    const tracker = createDirtyTracker();
    tracker.onWatchedChange(); // consume initial skip
    tracker.onWatchedChange(); // now dirty
    tracker.armSkip();
    expect(tracker.onWatchedChange()).toBe(false);
    expect(tracker.onWatchedChange()).toBe(true);
  });
});
