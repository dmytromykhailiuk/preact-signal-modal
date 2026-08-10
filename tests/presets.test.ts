import { describe, expect, it } from "vitest";
import {
  type Animation,
  iosEnterAnimation,
  iosLeaveAnimation,
  mdEnterAnimation,
  mdLeaveAnimation,
} from "../src";
import { getBackdropValueForSheet } from "../src/core/presets";

interface Fixture {
  root: HTMLElement;
  backdrop: HTMLElement;
  wrapper: HTMLElement;
  content: HTMLElement;
}

const fixture = (): Fixture => {
  const root = document.createElement("div");
  root.className = "psm-root";
  root.innerHTML =
    '<div class="psm-backdrop"></div><div class="psm-wrapper"><div class="psm-content"></div></div>';
  document.body.appendChild(root);

  return {
    root,
    backdrop: root.querySelector<HTMLElement>(".psm-backdrop") as HTMLElement,
    wrapper: root.querySelector<HTMLElement>(".psm-wrapper") as HTMLElement,
    content: root.querySelector<HTMLElement>(".psm-content") as HTMLElement,
  };
};

/** The child animation that drives a particular element. */
const childFor = (animation: Animation, el: HTMLElement): Animation => {
  const child = animation.childAnimations.find((candidate) => candidate.elements.includes(el));
  if (!child) throw new Error("no child animation for that element");
  return child;
};

const BACKDROP = "var(--psm-backdrop-opacity, 0.32)";

describe("iOS preset", () => {
  it("enters over 500ms on Ionic's curve, sliding the modal up a full viewport", () => {
    const { root, wrapper, backdrop } = fixture();
    const animation = iosEnterAnimation(root, { mode: "ios" });

    expect(animation.getDuration()).toBe(500);
    expect(animation.getEasing()).toBe("cubic-bezier(0.32,0.72,0,1)");

    expect(childFor(animation, wrapper).getKeyframes()).toEqual([
      { offset: 0, transform: "translateY(100vh)" },
      { offset: 1, transform: "translateY(0vh)" },
    ]);
    expect(childFor(animation, backdrop).getKeyframes()).toEqual([
      { offset: 0, opacity: 0.01 },
      { offset: 1, opacity: BACKDROP },
    ]);
  });

  it("leaves by reversing the same movement", () => {
    const { root, wrapper, backdrop } = fixture();
    const animation = iosLeaveAnimation(root, { mode: "ios" });

    expect(animation.getDuration()).toBe(500);
    expect(animation.getEasing()).toBe("cubic-bezier(0.32,0.72,0,1)");

    expect(childFor(animation, wrapper).getKeyframes()).toEqual([
      { offset: 0, transform: "translateY(0vh)" },
      { offset: 1, transform: "translateY(100vh)" },
    ]);
    expect(childFor(animation, backdrop).getKeyframes()).toEqual([
      { offset: 0, opacity: BACKDROP },
      { offset: 1, opacity: 0 },
    ]);
  });

  it("honours a duration override, which is what the swipe gesture uses", () => {
    const { root } = fixture();

    expect(iosLeaveAnimation(root, { mode: "ios", duration: 180 }).getDuration()).toBe(180);
  });
});

describe("Material preset", () => {
  it("enters over 280ms, fading in and rising 40px", () => {
    const { root, wrapper, backdrop } = fixture();
    const animation = mdEnterAnimation(root, { mode: "md" });

    expect(animation.getDuration()).toBe(280);
    expect(animation.getEasing()).toBe("cubic-bezier(0.36,0.66,0.04,1)");

    expect(childFor(animation, wrapper).getKeyframes()).toEqual([
      { offset: 0, opacity: 0.01, transform: "translateY(40px)" },
      { offset: 1, opacity: 1, transform: "translateY(0px)" },
    ]);
    expect(childFor(animation, backdrop).getKeyframes()).toEqual([
      { offset: 0, opacity: 0.01 },
      { offset: 1, opacity: BACKDROP },
    ]);
  });

  it("leaves faster than it enters, over 200ms", () => {
    const { root, wrapper } = fixture();
    const animation = mdLeaveAnimation(root, { mode: "md" });

    expect(animation.getDuration()).toBe(200);
    expect(animation.getEasing()).toBe("cubic-bezier(0.47,0,0.745,0.715)");

    expect(childFor(animation, wrapper).getKeyframes()).toEqual([
      { offset: 0, opacity: 0.99, transform: "translateY(0px)" },
      { offset: 1, opacity: 0, transform: "translateY(40px)" },
    ]);
  });
});

describe("sheet preset", () => {
  it("stops the sheet at its breakpoint instead of covering the screen", () => {
    const { root, wrapper, backdrop } = fixture();
    const animation = iosEnterAnimation(root, {
      mode: "ios",
      currentBreakpoint: 0.25,
      backdropBreakpoint: 0,
      expandToScroll: true,
    });

    expect(childFor(animation, wrapper).getKeyframes()).toEqual([
      { offset: 0, opacity: 1, transform: "translateY(100%)" },
      { offset: 1, opacity: 1, transform: "translateY(75%)" },
    ]);
    expect(childFor(animation, backdrop).getKeyframes()).toEqual([
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: `calc(${BACKDROP} * 0.25)` },
    ]);
  });

  it("keeps the backdrop clear until the sheet passes backdropBreakpoint", () => {
    const { root, backdrop } = fixture();
    const animation = iosEnterAnimation(root, {
      mode: "ios",
      currentBreakpoint: 0.25,
      backdropBreakpoint: 0.5,
      expandToScroll: true,
    });

    expect(childFor(animation, backdrop).getKeyframes()).toEqual([
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: "0" },
    ]);
  });

  it("grows the content's max-height with the sheet when expandToScroll is off", () => {
    const { root, content } = fixture();
    const animation = mdEnterAnimation(root, {
      mode: "md",
      currentBreakpoint: 0.25,
      backdropBreakpoint: 0,
      expandToScroll: false,
    });

    expect(childFor(animation, content).getKeyframes()).toEqual([
      { offset: 0, opacity: 1, maxHeight: "75%" },
      { offset: 1, opacity: 1, maxHeight: "25%" },
    ]);
  });

  it("leaves the content alone when expandToScroll is on", () => {
    const { root, content } = fixture();
    const animation = iosEnterAnimation(root, {
      mode: "ios",
      currentBreakpoint: 0.5,
      expandToScroll: true,
    });

    expect(animation.childAnimations.some((child) => child.elements.includes(content))).toBe(false);
  });

  it("fades the sheet's backdrop out from wherever it happens to be", () => {
    const { root, backdrop } = fixture();
    const animation = iosLeaveAnimation(root, {
      mode: "ios",
      currentBreakpoint: 0.5,
      backdropBreakpoint: 0,
    });

    expect(childFor(animation, backdrop).getKeyframes()).toEqual([
      { offset: 0, opacity: `calc(${BACKDROP} * 0.5)` },
      { offset: 1, opacity: 0 },
    ]);
  });
});

describe("getBackdropValueForSheet", () => {
  it("is the identity when the backdrop fades in from the very bottom", () => {
    expect(getBackdropValueForSheet(0, 0)).toBe(0);
    expect(getBackdropValueForSheet(0.5, 0)).toBe(0.5);
    expect(getBackdropValueForSheet(1, 0)).toBe(1);
  });

  it("ramps from the backdrop breakpoint up to full opacity", () => {
    expect(getBackdropValueForSheet(0.5, 0.5)).toBe(0);
    expect(getBackdropValueForSheet(0.75, 0.5)).toBe(0.5);
    expect(getBackdropValueForSheet(1, 0.5)).toBe(1);
  });

  it("keeps the backdrop hidden when it is told never to appear", () => {
    expect(getBackdropValueForSheet(1, 1)).toBe(0);
  });
});
