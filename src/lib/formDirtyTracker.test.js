import { describe, expect, it } from 'vitest';
import { createDirtyTracker } from './formDirtyTracker';

describe('createDirtyTracker', () => {
  it('ignora la carga programática y detecta la edición siguiente', () => {
    const tracker = createDirtyTracker();
    expect(tracker.onWatchedChange()).toBe(false);
    expect(tracker.onWatchedChange()).toBe(true);
    tracker.armSkip();
    expect(tracker.onWatchedChange()).toBe(false);
  });
});
