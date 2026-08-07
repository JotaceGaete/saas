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
      if (timer) clearTimeout(timer);
      timer = null;
      fn();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    isPending() {
      return timer !== null;
    },
  };
}
