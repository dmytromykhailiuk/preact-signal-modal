/**
 * The stock modal transitions, ported from `@ionic/core`.
 *
 * Every duration, easing curve and keyframe here is copied from Ionic's own
 * modal animations (`components/modal/animations/{ios,md}.{enter,leave}.ts`
 * and `sheet.ts`) so a modal from this package moves exactly like an
 * `<ion-modal>`. Only the selectors differ: Ionic animates `ion-backdrop`,
 * `.modal-wrapper` and `.ion-page` inside a shadow root, we animate
 * `.psm-backdrop`, `.psm-wrapper` and `.psm-content` in the light DOM, and the
 * `--backdrop-opacity` variable is `--psm-backdrop-opacity` here.
 *
 * Ionic's card presentation (`presentingElement`) is deliberately not ported —
 * it scales the page behind the modal, which only makes sense inside an Ionic
 * app shell.
 */

import type { Animation, AnimationBuilder, ModalAnimationOptions } from "../types";
import { createAnimation } from "./animation";

const IOS_EASING = "cubic-bezier(0.32,0.72,0,1)";
const IOS_DURATION = 500;
const MD_ENTER_EASING = "cubic-bezier(0.36,0.66,0.04,1)";
const MD_ENTER_DURATION = 280;
const MD_LEAVE_EASING = "cubic-bezier(0.47,0,0.745,0.715)";
const MD_LEAVE_DURATION = 200;

// The fallback is spelled out rather than declared in the stylesheet: a
// `--psm-backdrop-opacity` the injected sheet defines would outrank the one an
// app sets on `:root`, since the sheet is appended at runtime and wins on
// order. Inline fallbacks leave the app's value untouched.
const BACKDROP_OPACITY = "var(--psm-backdrop-opacity, 0.32)";

interface AnimationParts {
  backdropAnimation: Animation;
  wrapperAnimation: Animation;
  contentAnimation?: Animation;
}

/**
 * Solve `y = mx + b` for the backdrop opacity at an arbitrary sheet offset.
 * The two known points are `(backdropBreakpoint, 0)` and `(1, 1)`: the
 * backdrop is invisible until the sheet passes `backdropBreakpoint` and is
 * fully opaque once the sheet is all the way up.
 */
export const getBackdropValueForSheet = (x: number, backdropBreakpoint: number): number => {
  if (backdropBreakpoint === 1) return 0;
  const slope = 1 / (1 - backdropBreakpoint);
  const b = -(backdropBreakpoint * slope);
  return x * slope + b;
};

/* ------------------------------------------------------------------ *
 * Sheet modals
 * ------------------------------------------------------------------ */

const createSheetEnterAnimation = (opts: ModalAnimationOptions): AnimationParts => {
  const currentBreakpoint = opts.currentBreakpoint ?? 0;
  const { backdropBreakpoint, expandToScroll } = opts;

  // With no backdropBreakpoint the backdrop always fades in; with one, only
  // once the sheet has risen past it.
  const shouldShowBackdrop =
    backdropBreakpoint === undefined || backdropBreakpoint < currentBreakpoint;
  const initialBackdrop = shouldShowBackdrop
    ? `calc(${BACKDROP_OPACITY} * ${currentBreakpoint})`
    : "0";

  const backdropAnimation = createAnimation("backdropAnimation").fromTo(
    "opacity",
    0,
    initialBackdrop,
  );
  if (shouldShowBackdrop) {
    backdropAnimation
      .beforeStyles({ "pointer-events": "none" })
      .afterClearStyles(["pointer-events"]);
  }

  const wrapperAnimation = createAnimation("wrapperAnimation").keyframes([
    { offset: 0, opacity: 1, transform: "translateY(100%)" },
    { offset: 1, opacity: 1, transform: `translateY(${100 - currentBreakpoint * 100}%)` },
  ]);

  // Growing max-height alongside the sheet is what lets the content scroll at
  // every breakpoint instead of only at the top one.
  const contentAnimation = expandToScroll
    ? undefined
    : createAnimation("contentAnimation").keyframes([
        { offset: 0, opacity: 1, maxHeight: `${(1 - currentBreakpoint) * 100}%` },
        { offset: 1, opacity: 1, maxHeight: `${currentBreakpoint * 100}%` },
      ]);

  return { wrapperAnimation, backdropAnimation, contentAnimation };
};

const createSheetLeaveAnimation = (opts: ModalAnimationOptions): AnimationParts => {
  const currentBreakpoint = opts.currentBreakpoint ?? 0;
  const backdropBreakpoint = opts.backdropBreakpoint ?? 0;

  // The backdrop does not necessarily start at full opacity, so work out where
  // it actually is before fading it out.
  const backdropValue = `calc(${BACKDROP_OPACITY} * ${getBackdropValueForSheet(
    currentBreakpoint,
    backdropBreakpoint,
  )})`;

  const defaultBackdrop = [
    { offset: 0, opacity: backdropValue },
    { offset: 1, opacity: 0 },
  ];
  const customBackdrop = [
    { offset: 0, opacity: backdropValue },
    { offset: backdropBreakpoint, opacity: 0 },
    { offset: 1, opacity: 0 },
  ];

  const backdropAnimation = createAnimation("backdropAnimation").keyframes(
    backdropBreakpoint !== 0 ? customBackdrop : defaultBackdrop,
  );

  const wrapperAnimation = createAnimation("wrapperAnimation").keyframes([
    { offset: 0, opacity: 1, transform: `translateY(${100 - currentBreakpoint * 100}%)` },
    { offset: 1, opacity: 1, transform: "translateY(100%)" },
  ]);

  return { wrapperAnimation, backdropAnimation };
};

/* ------------------------------------------------------------------ *
 * iOS
 * ------------------------------------------------------------------ */

const createIosEnterAnimation = (): AnimationParts => {
  const backdropAnimation = createAnimation()
    .fromTo("opacity", 0.01, BACKDROP_OPACITY)
    .beforeStyles({ "pointer-events": "none" })
    .afterClearStyles(["pointer-events"]);

  const wrapperAnimation = createAnimation().fromTo(
    "transform",
    "translateY(100vh)",
    "translateY(0vh)",
  );

  return { backdropAnimation, wrapperAnimation };
};

const createIosLeaveAnimation = (): AnimationParts => {
  const backdropAnimation = createAnimation().fromTo("opacity", BACKDROP_OPACITY, 0);
  const wrapperAnimation = createAnimation().fromTo(
    "transform",
    "translateY(0vh)",
    "translateY(100vh)",
  );
  return { backdropAnimation, wrapperAnimation };
};

export const iosEnterAnimation: AnimationBuilder = (baseEl, opts) => {
  const { currentBreakpoint, expandToScroll } = opts;
  const { wrapperAnimation, backdropAnimation, contentAnimation } =
    currentBreakpoint !== undefined ? createSheetEnterAnimation(opts) : createIosEnterAnimation();

  backdropAnimation.addElement(baseEl.querySelector(".psm-backdrop"));
  wrapperAnimation.addElement(baseEl.querySelector(".psm-wrapper")).beforeStyles({ opacity: 1 });
  if (!expandToScroll) contentAnimation?.addElement(baseEl.querySelector(".psm-content"));

  const baseAnimation = createAnimation("entering-base")
    .addElement(baseEl)
    .easing(IOS_EASING)
    .duration(opts.duration ?? IOS_DURATION)
    .addAnimation([wrapperAnimation, backdropAnimation]);

  if (contentAnimation) baseAnimation.addAnimation(contentAnimation);

  return baseAnimation;
};

export const iosLeaveAnimation: AnimationBuilder = (baseEl, opts) => {
  const { currentBreakpoint } = opts;
  const { wrapperAnimation, backdropAnimation } =
    currentBreakpoint !== undefined ? createSheetLeaveAnimation(opts) : createIosLeaveAnimation();

  backdropAnimation.addElement(baseEl.querySelector(".psm-backdrop"));
  wrapperAnimation.addElement(baseEl.querySelector(".psm-wrapper")).beforeStyles({ opacity: 1 });

  return createAnimation("leaving-base")
    .addElement(baseEl)
    .easing(IOS_EASING)
    .duration(opts.duration ?? IOS_DURATION)
    .addAnimation([wrapperAnimation, backdropAnimation]);
};

/* ------------------------------------------------------------------ *
 * Material Design
 * ------------------------------------------------------------------ */

const createMdEnterAnimation = (): AnimationParts => {
  const backdropAnimation = createAnimation()
    .fromTo("opacity", 0.01, BACKDROP_OPACITY)
    .beforeStyles({ "pointer-events": "none" })
    .afterClearStyles(["pointer-events"]);

  const wrapperAnimation = createAnimation().keyframes([
    { offset: 0, opacity: 0.01, transform: "translateY(40px)" },
    { offset: 1, opacity: 1, transform: "translateY(0px)" },
  ]);

  return { backdropAnimation, wrapperAnimation };
};

const createMdLeaveAnimation = (): AnimationParts => {
  const backdropAnimation = createAnimation().fromTo("opacity", BACKDROP_OPACITY, 0);
  const wrapperAnimation = createAnimation().keyframes([
    { offset: 0, opacity: 0.99, transform: "translateY(0px)" },
    { offset: 1, opacity: 0, transform: "translateY(40px)" },
  ]);
  return { backdropAnimation, wrapperAnimation };
};

export const mdEnterAnimation: AnimationBuilder = (baseEl, opts) => {
  const { currentBreakpoint, expandToScroll } = opts;
  const { wrapperAnimation, backdropAnimation, contentAnimation } =
    currentBreakpoint !== undefined ? createSheetEnterAnimation(opts) : createMdEnterAnimation();

  backdropAnimation.addElement(baseEl.querySelector(".psm-backdrop"));
  wrapperAnimation.addElement(baseEl.querySelector(".psm-wrapper"));
  if (!expandToScroll) contentAnimation?.addElement(baseEl.querySelector(".psm-content"));

  const baseAnimation = createAnimation("entering-base")
    .addElement(baseEl)
    .easing(MD_ENTER_EASING)
    .duration(opts.duration ?? MD_ENTER_DURATION)
    .addAnimation([backdropAnimation, wrapperAnimation]);

  if (contentAnimation) baseAnimation.addAnimation(contentAnimation);

  return baseAnimation;
};

export const mdLeaveAnimation: AnimationBuilder = (baseEl, opts) => {
  const { currentBreakpoint } = opts;
  const { wrapperAnimation, backdropAnimation } =
    currentBreakpoint !== undefined ? createSheetLeaveAnimation(opts) : createMdLeaveAnimation();

  backdropAnimation.addElement(baseEl.querySelector(".psm-backdrop"));
  wrapperAnimation.addElement(baseEl.querySelector(".psm-wrapper"));

  return createAnimation("leaving-base")
    .addElement(baseEl)
    .easing(MD_LEAVE_EASING)
    .duration(opts.duration ?? MD_LEAVE_DURATION)
    .addAnimation([backdropAnimation, wrapperAnimation]);
};

/** The stock enter animation for a mode. */
export const getEnterAnimation = (mode: ModalAnimationOptions["mode"]): AnimationBuilder =>
  mode === "ios" ? iosEnterAnimation : mdEnterAnimation;

/** The stock leave animation for a mode. */
export const getLeaveAnimation = (mode: ModalAnimationOptions["mode"]): AnimationBuilder =>
  mode === "ios" ? iosLeaveAnimation : mdLeaveAnimation;
