/**
 * Decides whether a change to watched form state should mark the form dirty.
 * Loading a product's data (or resetting the form after "Guardar y crear otro")
 * changes the same state a real edit would, so the caller must arm the skip
 * before those programmatic writes to avoid a false-positive dirty flag.
 */
export function createDirtyTracker() {
  let skipNext = true;

  return {
    armSkip() {
      skipNext = true;
    },
    onWatchedChange() {
      if (skipNext) {
        skipNext = false;
        return false;
      }
      return true;
    },
  };
}
