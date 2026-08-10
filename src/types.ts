/**
 * Every public type of the package lives here. Runtime modules import from
 * this file; nothing here imports from them, so the type graph stays acyclic.
 */

import type { ReadonlySignal } from "@preact/signals";
import type { ComponentChildren } from "preact";

/* ------------------------------------------------------------------ *
 * Animation — a port of the `@ionic/core` Animation API
 * ------------------------------------------------------------------ */

export type AnimationDirection = "normal" | "reverse" | "alternate" | "alternate-reverse";

export type AnimationFill = "auto" | "none" | "forwards" | "backwards" | "both";

/** One keyframe. `offset` is the 0…1 position; every other key is a CSS property. */
export interface AnimationKeyFrame {
  offset?: number | null;
  [property: string]: string | number | null | undefined;
}

export type AnimationKeyFrames = AnimationKeyFrame[];

export interface AnimationCallbackOptions {
  /** Fire the callback once, then forget it. */
  oneTimeCallback?: boolean;
}

export interface AnimationPlayOptions {
  /** Run with a duration of 0 — the animation lands on its final frame at once. */
  sync?: boolean;
}

/** `currentStep` is 1 when the animation played to the end, 0 when it reversed. */
export type AnimationLifecycle = (currentStep: 0 | 1, animation: Animation) => void;

/**
 * A chainable animation. Timing set on a parent is inherited by children that
 * do not define their own, which is what lets a modal preset give the backdrop
 * and the wrapper a single shared duration and easing.
 */
export interface Animation {
  readonly id: string | undefined;
  readonly elements: HTMLElement[];
  readonly childAnimations: Animation[];

  /* structure */
  addElement(el: Element | NodeList | Element[] | null | undefined): Animation;
  addAnimation(animation: Animation | Animation[] | null | undefined): Animation;
  parent(animation: Animation | undefined): Animation;

  /* timing */
  duration(ms: number): Animation;
  easing(easing: string): Animation;
  delay(ms: number): Animation;
  fill(fill: AnimationFill): Animation;
  direction(direction: AnimationDirection): Animation;
  iterations(iterations: number): Animation;

  /* keyframes */
  keyframes(keyframes: AnimationKeyFrames): Animation;
  from(property: string, value: string | number): Animation;
  to(property: string, value: string | number): Animation;
  fromTo(property: string, fromValue: string | number, toValue: string | number): Animation;

  /* hooks that run before the first frame */
  beforeAddClass(className: string | string[]): Animation;
  beforeRemoveClass(className: string | string[]): Animation;
  beforeStyles(styles: Record<string, string | number>): Animation;
  beforeClearStyles(propertyNames: string[]): Animation;
  beforeAddRead(readFn: () => void): Animation;
  beforeAddWrite(writeFn: () => void): Animation;

  /* hooks that run after the last frame */
  afterAddClass(className: string | string[]): Animation;
  afterRemoveClass(className: string | string[]): Animation;
  afterStyles(styles: Record<string, string | number>): Animation;
  afterClearStyles(propertyNames: string[]): Animation;
  afterAddRead(readFn: () => void): Animation;
  afterAddWrite(writeFn: () => void): Animation;

  /* playback */
  play(opts?: AnimationPlayOptions): Promise<void>;
  pause(): Animation;
  stop(): void;
  destroy(): Animation;
  onFinish(callback: AnimationLifecycle, opts?: AnimationCallbackOptions): Animation;
  isRunning(): boolean;

  /* gesture-driven playback */
  progressStart(forceLinearEasing?: boolean, step?: number): Animation;
  progressStep(step: number): Animation;
  progressEnd(playTo: 0 | 1 | undefined, step: number, dur?: number): Animation;

  /* resolved timing — a child asks its parent through these */
  getDuration(): number;
  getEasing(): string;
  getDelay(): number;
  getFill(): AnimationFill;
  getDirection(): AnimationDirection;
  getIterations(): number;
  getKeyframes(): AnimationKeyFrames;

  /** @internal */
  update(deep?: boolean, step?: number): Animation;
  /** @internal */
  animationFinish(): void;
}

/** Platform styling. `ios` slides up from the bottom, `md` fades and rises 40px. */
export type ModalMode = "ios" | "md";

/** What a preset receives. `currentBreakpoint` is set only for sheet modals. */
export interface ModalAnimationOptions {
  mode: ModalMode;
  currentBreakpoint?: number;
  backdropBreakpoint?: number;
  expandToScroll?: boolean;
  /** Overrides the preset's own duration — used by the swipe-to-close gesture. */
  duration?: number;
}

/**
 * Builds the animation for one modal. `baseEl` is the modal's root element
 * (`.psm-root`), which contains `.psm-backdrop` and `.psm-wrapper`.
 */
export type AnimationBuilder = (baseEl: HTMLElement, opts: ModalAnimationOptions) => Animation;

/* ------------------------------------------------------------------ *
 * Modals
 * ------------------------------------------------------------------ */

/**
 * Why a modal closed. `handler` means code asked for it — `close()`, the
 * `isOpen` signal going false, or `closeAllModals()`. Your own strings are
 * welcome; they travel through untouched.
 */
export type ModalRole = "backdrop" | "escape" | "gesture" | "handler" | (string & {});

/** What `afterClose` resolves to and what the dismiss hooks receive. */
export interface ModalDismissal<T = unknown> {
  data?: T;
  role?: ModalRole;
}

export type ModalState = "presenting" | "presented" | "dismissing";

export type CanDismiss<T = unknown> =
  | boolean
  | ((dismissal: ModalDismissal<T>) => boolean | Promise<boolean>);

/** A CSS style, either as a string or as a property bag. */
export type ModalStyle = string | Record<string, string | number>;

export interface ModalOptions<T = unknown> {
  /** `ios` or `md`. Defaults to the platform (`ios` on iOS/iPadOS, else `md`). */
  mode?: ModalMode;
  /** Set `false` to present and dismiss with no animation at all. */
  animated?: boolean;
  enterAnimation?: AnimationBuilder;
  leaveAnimation?: AnimationBuilder;

  showBackdrop?: boolean;
  /** Clicking the backdrop dismisses with role `backdrop`. Default `true`. */
  backdropDismiss?: boolean;
  /** Escape dismisses the topmost modal with role `escape`. Default `true`. */
  keyboardClose?: boolean;
  /** Lock body scroll while any modal is open. Default `true`. */
  scrollLock?: boolean;
  /** Trap Tab inside the modal and restore focus on close. Default `true`. */
  focusTrap?: boolean;

  /**
   * Vetoes a dismissal. Receives the pending `{ data, role }` and may be async —
   * the modal stays open until it resolves, and stays open for good if it
   * resolves `false`.
   */
  canDismiss?: CanDismiss<T>;

  modalClass?: string;
  backdropClass?: string;
  modalStyle?: ModalStyle;
  backdropStyle?: ModalStyle;

  /** Insert directly above the modal with this id instead of on top of the stack. */
  putAfter?: string;

  /* sheet modal */
  /** Turns the modal into a sheet. Values are 0…1 fractions of the screen height. */
  breakpoints?: number[];
  /** Which breakpoint the sheet opens at. Must be one of `breakpoints`. */
  initialBreakpoint?: number;
  /** Below this breakpoint the backdrop is transparent and lets clicks through. */
  backdropBreakpoint?: number;
  /** Show the drag handle. Defaults to `true` once `breakpoints` is set. */
  handle?: boolean;
  /** `cycle` makes a tap on the handle advance to the next breakpoint. */
  handleBehavior?: "none" | "cycle";
  /** Keep Ionic's default of only scrolling content at the top breakpoint. */
  expandToScroll?: boolean;

  /* accessibility */
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;

  /* lifecycle */
  onWillPresent?: () => void;
  onDidPresent?: () => void;
  onWillDismiss?: (dismissal: ModalDismissal<T>) => void;
  onDidDismiss?: (dismissal: ModalDismissal<T>) => void;
}

/** Handle returned by `createModal`. */
export interface ModalRef<T = unknown> {
  readonly id: string;
  /** Resolves `false` when `canDismiss` refused. */
  close(data?: T, role?: ModalRole): Promise<boolean>;
  /** Resolves once the leave animation is done and the content is unmounted. */
  readonly afterClose: Promise<ModalDismissal<T>>;
}

/** An open modal as seen from the outside — what `getTopModal()` hands back. */
export interface OpenModal<T = unknown> {
  readonly id: string;
  readonly options: Readonly<ModalOptions<T>>;
  readonly state$: ReadonlySignal<ModalState>;
  close(data?: T, role?: ModalRole): Promise<boolean>;
}

/** What `useModal()` hands to the content of a modal. */
export interface ModalHandle<T = unknown> {
  readonly id: string;
  close(data?: T, role?: ModalRole): Promise<boolean>;
  /** The sheet's current breakpoint, or `undefined` for a regular modal. */
  readonly breakpoint$: ReadonlySignal<number | undefined>;
  /** Move a sheet modal to one of its breakpoints. */
  setBreakpoint(breakpoint: number): Promise<void>;
}

/**
 * Defaults for every modal. Anything you pass per modal wins over these, and
 * these win over the built-ins.
 */
export interface ModalConfig {
  mode: ModalMode;
  animated: boolean;
  showBackdrop: boolean;
  backdropDismiss: boolean;
  keyboardClose: boolean;
  scrollLock: boolean;
  focusTrap: boolean;
  expandToScroll: boolean;
  handleBehavior: "none" | "cycle";
  /** The z-index of the first modal; each one above it gets +1. */
  baseZIndex: number;
  /**
   * Inject the stylesheet into `<head>` on first use. Turn it off under a
   * strict CSP or for SSR and import `.../styles.css` yourself instead.
   */
  injectStyles: boolean;
  enterAnimation?: AnimationBuilder;
  leaveAnimation?: AnimationBuilder;
}

interface ModalPropsBase<T = unknown> extends ModalOptions<T> {
  children?: ComponentChildren;
}

/**
 * Props of the declarative `<Modal>`. Exactly one of `isOpen` and `trigger` —
 * they are two different answers to "who owns the open state", and taking both
 * would mean two owners for one boolean.
 */
export type ModalProps<T = unknown> = ModalPropsBase<T> &
  (
    | {
        /**
         * You own the state. A signal, always: a plain boolean would re-render
         * the owning component on every open and close, and this one is
         * read-only because the modal never writes to state it does not own —
         * so a `computed` or a store selector is as welcome as a `useSignal`.
         *
         * The modal still closes on the backdrop, Escape or a swipe. Set your
         * signal back to `false` in `onDidDismiss` to stay in step; until you
         * do, it simply reads `true` for a modal that is no longer there.
         */
        isOpen: ReadonlySignal<boolean>;
        trigger?: never;
      }
    | {
        /**
         * The component owns the state. Name the `id` of an element and its
         * click opens the modal; the backdrop, Escape and `useModal().close()`
         * close it again. Nothing to wire up, and nothing to keep in step.
         */
        trigger: string;
        isOpen?: never;
      }
  );
