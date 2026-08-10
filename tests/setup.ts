/**
 * jsdom implements neither the Web Animations API nor `matchMedia`, and the
 * whole package is built on the first one. The stub below is not a general
 * WAAPI polyfill — it is just faithful enough that the animation engine drives
 * a real lifecycle: animations can be created, paused, played, cancelled and
 * scrubbed, and they finish on the next macrotask however long they claim to
 * last, so a test never waits out a 500ms iOS transition.
 *
 * Deliberately, animated values are never written to `element.style`. Real Web
 * Animations sit above inline styles in their own cascade layer rather than
 * mutating them, and a stub that wrote them would make inline styles look like
 * they had been clobbered.
 */

import { afterEach } from "vitest";
import { resetModalConfig } from "../src/config";
import { resetScrollLock } from "../src/core/scroll-lock";
import { __resetModalStore } from "../src/store";
import { STYLE_ELEMENT_ID } from "../src/styles";

interface StubTiming {
  delay: number;
  duration: number;
  easing: string;
  iterations: number;
  fill: string;
  direction: string;
}

class StubEffect {
  constructor(
    public target: Element,
    public keyframes: Keyframe[],
    private timing: StubTiming,
  ) {}

  getComputedTiming(): StubTiming {
    return { ...this.timing };
  }

  updateTiming(timing: Partial<StubTiming>): void {
    Object.assign(this.timing, timing);
  }

  setKeyframes(keyframes: Keyframe[]): void {
    this.keyframes = keyframes;
  }
}

class StubAnimation {
  effect: StubEffect;
  onfinish: (() => void) | null = null;
  currentTime = 0;
  playState: "idle" | "running" | "paused" | "finished" = "idle";
  finished: Promise<void>;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private settle!: () => void;

  constructor(el: HTMLElement, keyframes: Keyframe[], timing: StubTiming) {
    this.effect = new StubEffect(el, keyframes, timing);
    this.finished = new Promise<void>((resolve) => {
      this.settle = resolve;
    });
  }

  play(): void {
    if (this.playState === "finished") return;
    this.playState = "running";
    this.clear();
    // Always the next macrotask, whatever the declared duration — tests should
    // not have to wait out a 500ms iOS transition in real time.
    this.timer = setTimeout(() => {
      this.timer = null;
      this.playState = "finished";
      this.settle();
      this.onfinish?.();
    }, 0);
  }

  pause(): void {
    this.clear();
    if (this.playState !== "finished") this.playState = "paused";
  }

  cancel(): void {
    this.clear();
    this.playState = "idle";
    this.settle();
  }

  private clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

const animations = new WeakMap<Element, StubAnimation[]>();

Element.prototype.animate = function animate(
  this: HTMLElement,
  keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
  options?: number | KeyframeAnimationOptions,
): globalThis.Animation {
  const timing: StubTiming = {
    delay: 0,
    duration: 0,
    easing: "linear",
    iterations: 1,
    fill: "both",
    direction: "normal",
    ...(typeof options === "object" && options !== null ? (options as Partial<StubTiming>) : {}),
  };

  const animation = new StubAnimation(this, (keyframes ?? []) as Keyframe[], timing);
  const existing = animations.get(this) ?? [];
  existing.push(animation);
  animations.set(this, existing);

  return animation as unknown as globalThis.Animation;
} as typeof Element.prototype.animate;

/* ---- matchMedia ---- */

let reducedMotion = false;

/** Flip `prefers-reduced-motion` for a test. */
export const setReducedMotion = (value: boolean): void => {
  reducedMotion = value;
};

/* ---- isolation ---- */

afterEach(() => {
  // The store, the config and the scroll lock are module state shared by every
  // test in the file. Reset them hard so one test's leftovers cannot become
  // the next one's starting stack.
  __resetModalStore();
  resetModalConfig();
  resetScrollLock();
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
  reducedMotion = false;
});

window.matchMedia = ((query: string) => ({
  matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
