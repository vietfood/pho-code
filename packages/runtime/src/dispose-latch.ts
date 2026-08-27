export interface DisposeLatch {
  readonly disposed: boolean;
  /** How many times teardown was claimed. One-way, so only ever 0 or 1. */
  readonly count: number;
  /**
   * Returns true for exactly one caller — the one that should run teardown.
   * Every later call returns false, so a repeated `dispose()` is a no-op
   * rather than a second teardown.
   */
  claim(): boolean;
}

/**
 * One-way disposal latch for the runtime.
 *
 * Extracted from `createPhoCodeRuntime` so "am I disposed?" and "should I tear
 * down?" cannot drift apart: the flag and the counter move together inside
 * `claim`, and nothing outside can set either one.
 */
export function createDisposeLatch(): DisposeLatch {
  let disposed = false;
  let count = 0;

  return {
    get disposed() {
      return disposed;
    },
    get count() {
      return count;
    },
    claim() {
      if (disposed) {
        return false;
      }
      disposed = true;
      count += 1;
      return true;
    },
  };
}
