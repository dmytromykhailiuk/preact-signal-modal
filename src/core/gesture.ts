/**
 * Drag-to-move and swipe-to-close for sheet modals.
 *
 * Unlike Ionic — which scrubs the leave animation with `progressStep` — this
 * writes `transform` straight onto the wrapper while the finger is down. The
 * sheet has to track the finger one-to-one, and a direct write is both simpler
 * to reason about and immune to a paused Web Animation fighting us for the
 * same property. The animation engine takes over again the moment the finger
 * lifts, to ease into the breakpoint the gesture chose.
 */

import { getBackdropValueForSheet } from "./presets";

export interface SheetGestureCallbacks {
  /** Called on release with the fraction the sheet was left at. */
  onDragEnd(current: number, velocity: number): void;
  /** Called when a tap on the handle should cycle to the next breakpoint. */
  onHandleTap(): void;
}

export interface SheetGestureOptions extends SheetGestureCallbacks {
  root: HTMLElement;
  wrapper: HTMLElement;
  backdrop: HTMLElement | null;
  content: HTMLElement | null;
  handle: HTMLElement | null;
  backdropBreakpoint: number;
  expandToScroll: boolean;
  maxBreakpoint: number;
  getBreakpoint(): number;
}

export interface SheetGesture {
  destroy(): void;
}

/** How far the finger must travel before we call it a drag and not a tap. */
const DRAG_THRESHOLD = 6;

export const createSheetGesture = (options: SheetGestureOptions): SheetGesture => {
  const {
    root,
    wrapper,
    backdrop,
    content,
    handle,
    backdropBreakpoint,
    expandToScroll,
    maxBreakpoint,
    getBreakpoint,
    onDragEnd,
    onHandleTap,
  } = options;

  let pointerId: number | null = null;
  let startY = 0;
  let startBreakpoint = 0;
  let currentValue = 0;
  let dragging = false;
  let fromHandle = false;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;

  const viewportHeight = (): number => (typeof window !== "undefined" && window.innerHeight) || 1;

  const paint = (value: number): void => {
    wrapper.style.transform = `translateY(${100 - value * 100}%)`;

    if (backdrop) {
      const opacity = Math.max(0, Math.min(1, getBackdropValueForSheet(value, backdropBreakpoint)));
      backdrop.style.opacity = `calc(var(--psm-backdrop-opacity, 0.32) * ${opacity})`;
    }
    if (!expandToScroll && content) {
      content.style.maxHeight = `${value * 100}%`;
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (pointerId !== null || !event.isPrimary) return;

    const target = event.target as HTMLElement | null;
    fromHandle = handle !== null && target !== null && handle.contains(target);

    // Anywhere but the handle, a scrolled-down content area owns the gesture —
    // otherwise you could never scroll a sheet back up.
    if (!fromHandle && content && content.scrollTop > 0) return;

    pointerId = event.pointerId;
    startY = event.clientY;
    lastY = event.clientY;
    lastTime = event.timeStamp;
    velocity = 0;
    startBreakpoint = getBreakpoint();
    currentValue = startBreakpoint;
    dragging = false;

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;

    const delta = event.clientY - startY;

    if (!dragging) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      // Dragging up while the content still has room to scroll is a scroll,
      // not a sheet move.
      if (!fromHandle && delta < 0 && content && content.scrollHeight > content.clientHeight) {
        release();
        return;
      }
      dragging = true;
      root.classList.add("psm-root--dragging");
    }

    event.preventDefault();

    const elapsed = event.timeStamp - lastTime;
    if (elapsed > 0) {
      // Positive when the sheet is travelling up, in viewport fractions per ms.
      velocity = (lastY - event.clientY) / elapsed / viewportHeight();
      lastY = event.clientY;
      lastTime = event.timeStamp;
    }

    currentValue = Math.max(0, Math.min(maxBreakpoint, startBreakpoint - delta / viewportHeight()));
    paint(currentValue);
  };

  const release = (): void => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    pointerId = null;
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;

    const wasDragging = dragging;
    const wasFromHandle = fromHandle;
    dragging = false;
    release();
    root.classList.remove("psm-root--dragging");

    if (wasDragging) {
      onDragEnd(currentValue, velocity);
    } else if (wasFromHandle) {
      onHandleTap();
    }
  };

  wrapper.addEventListener("pointerdown", onPointerDown);

  return {
    destroy() {
      wrapper.removeEventListener("pointerdown", onPointerDown);
      release();
      root.classList.remove("psm-root--dragging");
    },
  };
};
