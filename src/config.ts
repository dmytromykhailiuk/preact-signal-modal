/**
 * Package-wide defaults. Three layers decide any given setting: what you pass
 * to `createModal` / `<Modal>` beats what you passed to `configureModal`,
 * which beats the built-ins below.
 */

import { detectMode } from "./core/mode";
import type { ModalConfig } from "./types";

const BUILT_IN: ModalConfig = {
  mode: detectMode(),
  animated: true,
  showBackdrop: true,
  backdropDismiss: true,
  keyboardClose: true,
  scrollLock: true,
  focusTrap: true,
  expandToScroll: true,
  handleBehavior: "none",
  baseZIndex: 1000,
  injectStyles: true,
};

let current: ModalConfig = { ...BUILT_IN };

/**
 * Change the defaults for every modal created from now on. Call it once at
 * startup — modals already on screen keep the settings they were created with.
 */
export const configureModal = (overrides: Partial<ModalConfig>): void => {
  current = { ...current, ...overrides };
};

/** The defaults as they stand right now. */
export const getModalConfig = (): Readonly<ModalConfig> => current;

/**
 * Back to the built-ins. Exported for tests — it is deliberately absent from
 * the package entry point, since an app that resets global config at runtime
 * has a different problem.
 */
export const resetModalConfig = (): void => {
  current = { ...BUILT_IN };
};
