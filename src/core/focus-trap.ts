/**
 * Keyboard and screen-reader containment for an open modal.
 *
 * The interesting part is how the rest of the page gets hidden. The usual
 * recipe — mark every sibling of `document.body` as `inert` — assumes the
 * modal is portalled to the body, and this package deliberately renders into
 * a `<ModalContainer/>` that lives wherever you put it. So instead of touching
 * body children, we walk from the modal element up to `<body>` and, at each
 * step, inert every child that is *not* on the path back down to the modal.
 * That hides exactly the rest of the document no matter how deeply the
 * container is nested.
 *
 * Because each trap records the attribute state it found, stacked modals nest
 * correctly on their own: the second modal sees the page already inert and
 * leaves it that way when it closes, while the first modal's own layer — which
 * only the second one inerted — is handed back.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
  "audio[controls]",
  "video[controls]",
].join(",");

export interface FocusTrap {
  release(): void;
}

interface ActiveTrap {
  el: HTMLElement;
  restoreFocusTo: HTMLElement | null;
  undoInert: Array<() => void>;
}

const stack: ActiveTrap[] = [];
let keydownBound = false;

const isVisible = (el: HTMLElement): boolean =>
  el.offsetWidth > 0 ||
  el.offsetHeight > 0 ||
  el.getClientRects().length > 0 ||
  // jsdom reports every element as zero-sized, so nothing would ever count as
  // tabbable there. Fall back to "not explicitly hidden".
  el.ownerDocument.defaultView?.getComputedStyle(el).display !== "none";

const getTabbables = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("inert") && isVisible(el),
  );

/** Inert everything outside `el`, and hand back the undo steps. */
const inertOutside = (el: HTMLElement): Array<() => void> => {
  const undo: Array<() => void> = [];
  let node: HTMLElement = el;

  while (node.parentElement) {
    const parent: HTMLElement = node.parentElement;
    for (const child of Array.from(parent.children)) {
      if (child === node) continue;
      if (child.tagName === "SCRIPT" || child.tagName === "STYLE" || child.tagName === "LINK") {
        continue;
      }

      const hadInert = child.hasAttribute("inert");
      const previousAriaHidden = child.getAttribute("aria-hidden");

      if (!hadInert) child.setAttribute("inert", "");
      if (previousAriaHidden === null) child.setAttribute("aria-hidden", "true");

      undo.push(() => {
        if (!hadInert) child.removeAttribute("inert");
        if (previousAriaHidden === null) child.removeAttribute("aria-hidden");
      });
    }
    node = parent;
  }

  return undo;
};

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key !== "Tab") return;

  const trap = stack[stack.length - 1];
  if (!trap) return;

  const tabbables = getTabbables(trap.el);
  if (tabbables.length === 0) {
    // Nothing to tab to — keep focus pinned to the dialog itself.
    event.preventDefault();
    trap.el.focus();
    return;
  }

  const first = tabbables[0] as HTMLElement;
  const last = tabbables[tabbables.length - 1] as HTMLElement;
  const active = document.activeElement;

  if (event.shiftKey && (active === first || active === trap.el)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  } else if (active === null || !trap.el.contains(active)) {
    // Focus drifted outside the modal — pull it back to the top of the dialog.
    event.preventDefault();
    first.focus();
  }
};

const bindKeydown = (): void => {
  if (keydownBound || typeof document === "undefined") return;
  document.addEventListener("keydown", onKeydown, true);
  keydownBound = true;
};

const unbindKeydown = (): void => {
  if (!keydownBound || stack.length > 0 || typeof document === "undefined") return;
  document.removeEventListener("keydown", onKeydown, true);
  keydownBound = false;
};

/**
 * Hide the rest of the page from assistive tech, move focus into `el`, and
 * keep Tab inside it until the returned trap is released.
 *
 * `boundary` is what gets protected from `inert`, and it is deliberately not
 * the same element as `el`. Focus belongs inside the dialog, but the backdrop
 * is the dialog's sibling — inerting everything outside `el` would make the
 * backdrop unclickable, and since `inert` also swallows pointer events, clicks
 * would fall straight through the modal layer to the page behind it. Pass the
 * modal root here and the dialog as `el`.
 */
export const createFocusTrap = (el: HTMLElement, boundary: HTMLElement = el): FocusTrap => {
  const activeElement = document.activeElement;
  const trap: ActiveTrap = {
    el,
    restoreFocusTo: activeElement instanceof HTMLElement ? activeElement : null,
    undoInert: inertOutside(boundary),
  };

  stack.push(trap);
  bindKeydown();

  const [firstTabbable] = getTabbables(el);
  (firstTabbable ?? el).focus();

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;

      const index = stack.indexOf(trap);
      if (index > -1) stack.splice(index, 1);

      for (const undo of trap.undoInert) undo();
      trap.undoInert.length = 0;

      unbindKeydown();

      // Only give focus back if it is still ours to give — the user may have
      // clicked elsewhere, or a modal underneath may have taken over.
      const active = document.activeElement;
      if (trap.restoreFocusTo?.isConnected && (active === null || el.contains(active))) {
        trap.restoreFocusTo.focus();
      }
    },
  };
};
