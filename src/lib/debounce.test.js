import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebouncer } from './debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createDebouncer', () => {
  it('does not call the function before the delay elapses', () => {
    const debouncer = createDebouncer(500);
    const fn = vi.fn();
    debouncer.schedule(fn);
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls the function once the delay elapses', () => {
    const debouncer = createDebouncer(500);
    const fn = vi.fn();
    debouncer.schedule(fn);
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets the timer on every new schedule call (true debounce, e.g. al escribir)', () => {
    const debouncer = createDebouncer(500);
    const fn = vi.fn();
    debouncer.schedule(fn);
    vi.advanceTimersByTime(300);
    debouncer.schedule(fn); // el usuario sigue escribiendo
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush() runs immediately and cancels the pending scheduled call', () => {
    const debouncer = createDebouncer(500);
    const scheduled = vi.fn();
    const flushed = vi.fn();
    debouncer.schedule(scheduled);
    debouncer.flush(flushed);
    expect(flushed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(scheduled).not.toHaveBeenCalled();
  });

  it('cancel() drops the pending call entirely', () => {
    const debouncer = createDebouncer(500);
    const fn = vi.fn();
    debouncer.schedule(fn);
    debouncer.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
