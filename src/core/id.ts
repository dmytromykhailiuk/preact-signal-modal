let counter = 0;

/**
 * Ids only need to be unique within a document — they never leave the browser
 * and never get persisted — so a counter plus a little randomness is plenty,
 * and it keeps the package free of a uuid dependency.
 */
export const generateModalId = (): string =>
  `psm_${(++counter).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
