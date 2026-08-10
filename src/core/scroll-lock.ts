/**
 * Body scroll locking, reference counted across every open modal so closing
 * one of three does not hand the page back its scrollbar.
 *
 * The padding compensation matters more than it looks: hiding `overflow` on a
 * desktop page removes the scrollbar gutter, and without the substitute
 * padding the whole layout jumps sideways the moment a modal opens.
 */

let lockCount = 0;
let previousOverflow = "";
let previousPaddingRight = "";

export const lockScroll = (): void => {
  if (typeof document === "undefined") return;

  lockCount += 1;
  if (lockCount > 1) return;

  const body = document.body;
  previousOverflow = body.style.overflow;
  previousPaddingRight = body.style.paddingRight;

  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbarWidth > 0) {
    const existing = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${existing + scrollbarWidth}px`;
  }
  body.style.overflow = "hidden";
};

export const unlockScroll = (): void => {
  if (typeof document === "undefined" || lockCount === 0) return;

  lockCount -= 1;
  if (lockCount > 0) return;

  const body = document.body;
  body.style.overflow = previousOverflow;
  body.style.paddingRight = previousPaddingRight;
};

/** Drop every lock at once. Exported for tests. */
export const resetScrollLock = (): void => {
  if (lockCount === 0) return;
  lockCount = 1;
  unlockScroll();
};
