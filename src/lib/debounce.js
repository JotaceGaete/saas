/**
 * Minimal debouncer used to throttle localStorage writes while the user
 * types. flush()/cancel() let callers bypass or drop the pending write for
 * events (blur, visibilitychange, beforeunload) that need it immediately or
 * not at all.
 */
export function createDebouncer(delayMs) {
  let timer = null;

  return {
    schedule(fn) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delayMs);
    },
    flush(fn) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      fn();
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
