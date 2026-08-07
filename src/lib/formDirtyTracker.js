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
