import { describe, expect, it, vi } from 'vitest';
import { createDebouncer } from './debounce';

describe('createDebouncer', () => {
  it('flush ejecuta el estado pendiente y cancel lo descarta', () => {
    vi.useFakeTimers();
    const debouncer = createDebouncer(400);
    const pending = vi.fn();
    debouncer.schedule(pending);
    debouncer.flush(pending);
    expect(pending).toHaveBeenCalledOnce();
    debouncer.schedule(pending);
    debouncer.cancel();
    vi.advanceTimersByTime(500);
    expect(pending).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
