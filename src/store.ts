/**
 * The modal stack and everything that happens to a modal between `createModal`
 * and the promise resolving.
 *
 * One signal holds every open modal, declarative and imperative alike, which
 * is what lets the two styles share a stacking order, a scroll lock and a
 * focus trap. `<ModalContainer/>` renders the list; this module never touches
 * the DOM except through the root element the container hands back via
 * `attach`, because the animation and the focus trap need a real element and
 * that element only exists once Preact has committed.
 */

import { type ReadonlySignal, type Signal, computed, signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { getModalConfig } from "./config";
import { createAnimation } from "./core/animation";
import { normalizeBreakpoints } from "./core/breakpoints";
import { type FocusTrap, createFocusTrap } from "./core/focus-trap";
import { generateModalId } from "./core/id";
import { prefersReducedMotion } from "./core/mode";
import { getBackdropValueForSheet, getEnterAnimation, getLeaveAnimation } from "./core/presets";
import { lockScroll, unlockScroll } from "./core/scroll-lock";
import { ensureModalStyles } from "./styles";
import type {
  Animation,
  AnimationBuilder,
  CanDismiss,
  ModalAnimationOptions,
  ModalDismissal,
  ModalOptions,
  ModalRef,
  ModalRole,
  ModalState,
  OpenModal,
} from "./types";

/** Every option with its default filled in, which is what the runtime reads. */
export interface ResolvedModalOptions<T = unknown> extends ModalOptions<T> {
  mode: NonNullable<ModalOptions<T>["mode"]>;
  animated: boolean;
  showBackdrop: boolean;
  backdropDismiss: boolean;
  keyboardClose: boolean;
  scrollLock: boolean;
  focusTrap: boolean;
  expandToScroll: boolean;
  handle: boolean;
  handleBehavior: "none" | "cycle";
  backdropBreakpoint: number;
  enterAnimation: AnimationBuilder;
  leaveAnimation: AnimationBuilder;
}

/** A modal as the container and the gesture code see it. */
export interface ModalInstance<T = unknown> extends OpenModal<T> {
  readonly content: ComponentChildren;
  readonly options: ResolvedModalOptions<T>;
  readonly state$: Signal<ModalState>;
  readonly breakpoint$: Signal<number | undefined>;
  /** Called by `<ModalHost>` once its root element is in the document. */
  attach(root: HTMLElement): void;
  /** Called by `<ModalHost>` on unmount — cleans up whatever dismissal did not. */
  detach(): void;
  /** Animate a sheet modal to one of its breakpoints. `0` dismisses it. */
  setBreakpoint(breakpoint: number, duration?: number): Promise<void>;
  /** The root element, once attached. */
  readonly root: HTMLElement | undefined;
}

const SHEET_EASING = "cubic-bezier(0.32,0.72,0,1)";
const SHEET_DURATION = 300;

const _modals$ = signal<ModalInstance<any>[]>([]);

/**
 * The stack, bottom first. Internal on purpose: handing an app the raw list
 * invites it to reach for `modals$.value` in a render body, which subscribes
 * that component to every open and close — the one thing this package exists
 * to avoid. `hasModals()` and `getTopModal()` cover what apps actually need.
 *
 * @internal
 */
export const modals$ = computed<readonly ModalInstance<any>[]>(() => _modals$.value);

/* ------------------------------------------------------------------ *
 * Escape handling — one listener for the whole stack
 * ------------------------------------------------------------------ */

const onDocumentKeydown = (event: KeyboardEvent): void => {
  if (event.key !== "Escape") return;

  const list = _modals$.peek();
  for (let i = list.length - 1; i >= 0; i--) {
    const modal = list[i];
    if (!modal || modal.state$.peek() === "dismissing") continue;
    // Only the topmost live modal reacts, and it swallows the key either way —
    // Escape should never fall through to a modal underneath.
    if (modal.options.keyboardClose) {
      event.preventDefault();
      void modal.close(undefined, "escape");
    }
    return;
  }
};

const syncKeydownListener = (): void => {
  if (typeof document === "undefined") return;
  document.removeEventListener("keydown", onDocumentKeydown);
  if (_modals$.peek().length > 0) {
    document.addEventListener("keydown", onDocumentKeydown);
  }
};

/* ------------------------------------------------------------------ *
 * Options
 * ------------------------------------------------------------------ */

const resolveOptions = <T>(options: ModalOptions<T>): ResolvedModalOptions<T> => {
  const config = getModalConfig();
  const mode = options.mode ?? config.mode;

  let breakpoints = options.breakpoints;
  let initialBreakpoint = options.initialBreakpoint;
  if (breakpoints !== undefined) {
    const normalized = normalizeBreakpoints(breakpoints, initialBreakpoint);
    breakpoints = normalized.breakpoints;
    initialBreakpoint = normalized.initialBreakpoint;
  }

  return {
    ...options,
    mode,
    // Someone who asked their OS for less motion gets none of ours.
    animated: (options.animated ?? config.animated) && !prefersReducedMotion(),
    showBackdrop: options.showBackdrop ?? config.showBackdrop,
    backdropDismiss: options.backdropDismiss ?? config.backdropDismiss,
    keyboardClose: options.keyboardClose ?? config.keyboardClose,
    scrollLock: options.scrollLock ?? config.scrollLock,
    focusTrap: options.focusTrap ?? config.focusTrap,
    expandToScroll: options.expandToScroll ?? config.expandToScroll,
    handleBehavior: options.handleBehavior ?? config.handleBehavior,
    handle: options.handle ?? breakpoints !== undefined,
    backdropBreakpoint: options.backdropBreakpoint ?? 0,
    breakpoints,
    initialBreakpoint,
    enterAnimation: options.enterAnimation ?? config.enterAnimation ?? getEnterAnimation(mode),
    leaveAnimation: options.leaveAnimation ?? config.leaveAnimation ?? getLeaveAnimation(mode),
  };
};

const checkCanDismiss = async <T>(
  canDismiss: CanDismiss<T> | undefined,
  dismissal: ModalDismissal<T>,
): Promise<boolean> => {
  if (canDismiss === undefined) return true;
  if (typeof canDismiss === "boolean") return canDismiss;
  return await canDismiss(dismissal);
};

/* ------------------------------------------------------------------ *
 * createModal
 * ------------------------------------------------------------------ */

/**
 * Open a modal and get a handle on it. The content is rendered by
 * `<ModalContainer/>`, so one has to be mounted somewhere in the tree.
 *
 * `afterClose` resolves once the leave animation has finished and the content
 * has been unmounted — the modal is genuinely gone by then, not merely hidden.
 */
export function createModal<T = unknown>(
  content: ComponentChildren,
  options: ModalOptions<T> = {},
): ModalRef<T> {
  // Before anything reaches the stack, so the very first modal of a session
  // cannot be painted unstyled for a frame while the sheet is still on its way
  // into <head>.
  if (getModalConfig().injectStyles) ensureModalStyles();

  const id = generateModalId();
  const resolved = resolveOptions(options);

  let settle!: (dismissal: ModalDismissal<T>) => void;
  const afterClose = new Promise<ModalDismissal<T>>((resolve) => {
    settle = resolve;
  });

  const state$ = signal<ModalState>("presenting");
  const breakpoint$ = signal<number | undefined>(resolved.initialBreakpoint);

  let root: HTMLElement | undefined;
  let animation: Animation | undefined;
  let trap: FocusTrap | undefined;
  let scrollLocked = false;
  let dismissal: Promise<boolean> | undefined;

  const isSheet = resolved.breakpoints !== undefined;

  const query = <E extends HTMLElement>(selector: string): E | null =>
    root ? root.querySelector<E>(selector) : null;

  const animationOptions = (duration?: number): ModalAnimationOptions => ({
    mode: resolved.mode,
    // A defined `currentBreakpoint` is what switches the presets over to their
    // sheet variants, so it has to stay undefined for a regular modal.
    currentBreakpoint: isSheet ? (breakpoint$.peek() ?? 0) : undefined,
    backdropBreakpoint: isSheet ? resolved.backdropBreakpoint : undefined,
    expandToScroll: resolved.expandToScroll,
    duration,
  });

  const play = async (builder: AnimationBuilder, duration?: number): Promise<void> => {
    if (!root) return;
    if (animation) {
      // `stop` resolves whatever `play` promise is still pending; `destroy`
      // then releases the Web Animations objects and their fill styles.
      animation.stop();
      animation.destroy();
      animation = undefined;
    }
    const next = builder(root, animationOptions(duration));
    animation = next;
    await next.play(resolved.animated ? undefined : { sync: true });
  };

  const backdropOpacityAt = (breakpoint: number): string => {
    const shouldShow = resolved.backdropBreakpoint < breakpoint;
    if (!shouldShow) return "0";
    const value = Math.max(
      0,
      Math.min(1, getBackdropValueForSheet(breakpoint, resolved.backdropBreakpoint)),
    );
    return `calc(var(--psm-backdrop-opacity, 0.32) * ${value})`;
  };

  /**
   * A finished animation keeps its final frame only while it is alive, and the
   * drag gesture needs to write `transform` itself. So once a sheet has
   * settled we copy the final values to inline styles and let the animation go.
   */
  const applyRestingStyles = (): void => {
    if (!isSheet) return;
    const breakpoint = breakpoint$.peek() ?? 0;

    const wrapper = query(".psm-wrapper");
    if (wrapper) wrapper.style.transform = `translateY(${100 - breakpoint * 100}%)`;

    const backdrop = query(".psm-backdrop");
    if (backdrop) backdrop.style.opacity = backdropOpacityAt(breakpoint);

    if (!resolved.expandToScroll) {
      const contentEl = query(".psm-content");
      if (contentEl) contentEl.style.maxHeight = `${breakpoint * 100}%`;
    }
  };

  const teardown = (): void => {
    trap?.release();
    trap = undefined;
    if (scrollLocked) {
      unlockScroll();
      scrollLocked = false;
    }
    if (animation) {
      animation.destroy();
      animation = undefined;
    }
  };

  const remove = (): void => {
    // `peek`, not `value` — removal can happen inside a `useSignalEffect` (the
    // `<Modal>` bridge) and reading here would subscribe that effect to the
    // whole stack.
    _modals$.value = _modals$.peek().filter((modal) => modal.id !== id);
    syncKeydownListener();
  };

  const close = (data?: T, role: ModalRole = "handler"): Promise<boolean> => {
    if (dismissal) return dismissal;

    const pending: ModalDismissal<T> = { data, role };

    dismissal = (async () => {
      const allowed = await checkCanDismiss(resolved.canDismiss, pending);
      if (!allowed) {
        // A refused dismissal must not poison the modal — it has to stay
        // closable the next time round.
        dismissal = undefined;
        return false;
      }

      resolved.onWillDismiss?.(pending);
      state$.value = "dismissing";

      await play(resolved.leaveAnimation);

      // Release the trap while the modal is still in the document, otherwise
      // there is nothing left to move focus away from and the restore is
      // skipped.
      teardown();
      remove();

      settle(pending);
      resolved.onDidDismiss?.(pending);
      return true;
    })();

    return dismissal;
  };

  const attach = (el: HTMLElement): void => {
    root = el;

    resolved.onWillPresent?.();

    if (resolved.scrollLock) {
      lockScroll();
      scrollLocked = true;
    }
    if (resolved.focusTrap) {
      // Focus goes in the dialog, but the whole modal root is protected from
      // `inert` — the backdrop is the dialog's sibling and has to stay
      // clickable.
      trap = createFocusTrap(query(".psm-wrapper") ?? el, el);
    }

    void play(resolved.enterAnimation).then(() => {
      // A modal closed mid-entrance has already moved on.
      if (state$.peek() === "dismissing") return;
      applyRestingStyles();
      if (animation) {
        animation.destroy();
        animation = undefined;
      }
      state$.value = "presented";
      resolved.onDidPresent?.();
    });
  };

  const detach = (): void => {
    teardown();
    root = undefined;
  };

  const setBreakpoint = async (breakpoint: number, duration = SHEET_DURATION): Promise<void> => {
    if (!isSheet || !root) return;
    if (breakpoint === 0) {
      await close(undefined, "gesture");
      return;
    }

    const from = breakpoint$.peek() ?? 0;
    if (from === breakpoint) return;

    const wrapper = query(".psm-wrapper");
    const backdrop = query(".psm-backdrop");

    const move = createAnimation("sheet-breakpoint")
      .addElement(root)
      .easing(SHEET_EASING)
      .duration(resolved.animated ? duration : 0);

    if (wrapper) {
      move.addAnimation(
        createAnimation()
          .addElement(wrapper)
          .fromTo(
            "transform",
            `translateY(${100 - from * 100}%)`,
            `translateY(${100 - breakpoint * 100}%)`,
          ),
      );
    }
    if (backdrop) {
      move.addAnimation(
        createAnimation()
          .addElement(backdrop)
          .fromTo("opacity", backdropOpacityAt(from), backdropOpacityAt(breakpoint)),
      );
    }
    if (!resolved.expandToScroll) {
      const contentEl = query(".psm-content");
      if (contentEl) {
        move.addAnimation(
          createAnimation()
            .addElement(contentEl)
            .fromTo("max-height", `${from * 100}%`, `${breakpoint * 100}%`),
        );
      }
    }

    await move.play();
    breakpoint$.value = breakpoint;
    applyRestingStyles();
    move.destroy();
  };

  const instance: ModalInstance<T> = {
    id,
    content,
    options: resolved,
    state$,
    breakpoint$,
    close,
    attach,
    detach,
    setBreakpoint,
    get root() {
      return root;
    },
  };

  // `putAfter` slots the modal directly above a specific one instead of on top
  // of everything, which is how a modal opened *from* another modal can still
  // sit below a third one that was already there.
  const list = _modals$.peek();
  const afterIndex = resolved.putAfter
    ? list.findIndex((modal) => modal.id === resolved.putAfter)
    : -1;

  _modals$.value =
    afterIndex === -1
      ? [...list, instance]
      : [...list.slice(0, afterIndex + 1), instance, ...list.slice(afterIndex + 1)];

  syncKeydownListener();

  return { id, close, afterClose };
}

/* ------------------------------------------------------------------ *
 * Closing from the outside
 * ------------------------------------------------------------------ */

/** Close one modal by id. Resolves `false` if it is gone or refused to close. */
export const closeModal = async <T>(
  id: string,
  data?: T,
  role: ModalRole = "handler",
): Promise<boolean> => {
  const modal = _modals$.peek().find((candidate) => candidate.id === id);
  if (!modal) return false;
  return await modal.close(data, role);
};

/**
 * Close every open modal, topmost first. Useful on navigation, where leaving
 * a modal behind is always a bug. `canDismiss` still gets its say.
 */
export const closeAllModals = async (role: ModalRole = "handler"): Promise<void> => {
  const list = [..._modals$.peek()].reverse();
  for (const modal of list) {
    await modal.close(undefined, role);
  }
};

/* ------------------------------------------------------------------ *
 * Reading the stack
 * ------------------------------------------------------------------ */

/**
 * Whether anything is open, right now.
 *
 * A plain read: it does not subscribe anything, so it is safe to call from an
 * event handler, a route guard or a component body. Calling it inside a
 * `computed` gives you a value that never updates — that is what
 * {@link hasModals$} is for.
 *
 * ```ts
 * if (hasModals()) return; // ignore the shortcut while a modal is up
 * ```
 */
export const hasModals = (): boolean => _modals$.peek().length > 0;

/**
 * Whether anything is open, as a signal — the reactive half of
 * {@link hasModals}, and the one to derive from.
 *
 * ```ts
 * const shortcutsEnabled = computed(() => !hasModals$.value);
 * ```
 *
 * Bind it, or a `useComputed` over it, straight into JSX. Unwrapping `.value`
 * in a component body subscribes that component and re-renders it on every
 * open and close.
 */
export const hasModals$: ReadonlySignal<boolean> = computed(() => _modals$.value.length > 0);

/**
 * The modal on top of the stack right now — the one Escape would close — or
 * `undefined` when nothing is open. A plain read, like {@link hasModals}.
 *
 * ```ts
 * await getTopModal()?.close(undefined, "navigation");
 * ```
 */
export const getTopModal = <T = unknown>(): OpenModal<T> | undefined => {
  const list = _modals$.peek();
  return list[list.length - 1] as OpenModal<T> | undefined;
};

/**
 * Drop the whole stack without animating, dismissing or asking `canDismiss`.
 * Exported for tests only — the store is module state, and one test's leftover
 * modal must not become the next test's stacking order.
 */
export const __resetModalStore = (): void => {
  for (const modal of _modals$.peek()) modal.detach();
  _modals$.value = [];
  syncKeydownListener();
};
