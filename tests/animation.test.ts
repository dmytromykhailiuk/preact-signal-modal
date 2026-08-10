import { describe, expect, it, vi } from "vitest";
import { createAnimation } from "../src";

const element = (): HTMLElement => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
};

describe("createAnimation", () => {
  it("builds keyframes from fromTo", () => {
    const animation = createAnimation().fromTo("opacity", 0, 1);

    expect(animation.getKeyframes()).toEqual([
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ]);
  });

  it("merges repeated from/to calls into the same frames", () => {
    const animation = createAnimation()
      .fromTo("opacity", 0, 1)
      .fromTo("transform", "translateY(10px)", "translateY(0)");

    expect(animation.getKeyframes()).toEqual([
      { offset: 0, opacity: 0, transform: "translateY(10px)" },
      { offset: 1, opacity: 1, transform: "translateY(0)" },
    ]);
  });

  it("keeps explicit keyframes as given", () => {
    const frames = [
      { offset: 0, opacity: 0.01, transform: "translateY(40px)" },
      { offset: 1, opacity: 1, transform: "translateY(0px)" },
    ];

    expect(createAnimation().keyframes(frames).getKeyframes()).toEqual(frames);
  });

  it("falls back to its parent's timing and prefers its own", () => {
    const child = createAnimation();
    const inheritingChild = createAnimation();
    createAnimation()
      .duration(500)
      .easing("ease-in")
      .delay(20)
      .addAnimation([child, inheritingChild]);

    child.duration(120).easing("linear");

    expect(child.getDuration()).toBe(120);
    expect(child.getEasing()).toBe("linear");
    expect(child.getDelay()).toBe(20);
    expect(inheritingChild.getDuration()).toBe(500);
    expect(inheritingChild.getEasing()).toBe("ease-in");
  });

  it("defaults to fill both, one iteration and normal direction", () => {
    const animation = createAnimation();

    expect(animation.getFill()).toBe("both");
    expect(animation.getIterations()).toBe(1);
    expect(animation.getDirection()).toBe("normal");
    expect(animation.getDuration()).toBe(0);
  });

  it("applies before styles and classes when it starts, after ones when it ends", async () => {
    const el = element();

    await createAnimation()
      .addElement(el)
      .duration(10)
      .fromTo("opacity", 0, 1)
      .beforeStyles({ "pointer-events": "none" })
      .beforeAddClass("is-entering")
      .afterClearStyles(["pointer-events"])
      .afterRemoveClass("is-entering")
      .afterAddClass("is-entered")
      .play();

    expect(el.style.pointerEvents).toBe("");
    expect(el.classList.contains("is-entering")).toBe(false);
    expect(el.classList.contains("is-entered")).toBe(true);
  });

  it("runs the read and write hooks around the animation", async () => {
    const calls: string[] = [];
    const el = element();

    await createAnimation()
      .addElement(el)
      .duration(10)
      .fromTo("opacity", 0, 1)
      .beforeAddRead(() => calls.push("before-read"))
      .beforeAddWrite(() => calls.push("before-write"))
      .afterAddRead(() => calls.push("after-read"))
      .afterAddWrite(() => calls.push("after-write"))
      .play();

    expect(calls).toEqual(["before-read", "before-write", "after-read", "after-write"]);
  });

  it("calls onFinish with a current step of 1", async () => {
    const onFinish = vi.fn();
    const el = element();

    await createAnimation()
      .addElement(el)
      .duration(10)
      .fromTo("opacity", 0, 1)
      .onFinish(onFinish)
      .play();

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]?.[0]).toBe(1);
  });

  it("waits for every child before resolving", async () => {
    const order: string[] = [];
    const parent = createAnimation().addElement(element()).duration(10);

    const childA = createAnimation()
      .addElement(element())
      .fromTo("opacity", 0, 1)
      .onFinish(() => order.push("a"));
    const childB = createAnimation()
      .addElement(element())
      .fromTo("opacity", 0, 1)
      .onFinish(() => order.push("b"));

    parent.addAnimation([childA, childB]).onFinish(() => order.push("parent"));
    await parent.play();

    expect(order).toEqual(["a", "b", "parent"]);
    expect(parent.childAnimations).toHaveLength(2);
  });

  it("addElement accepts a node list", () => {
    const host = element();
    host.innerHTML = "<span></span><span></span>";

    const animation = createAnimation().addElement(host.querySelectorAll("span"));

    expect(animation.elements).toHaveLength(2);
  });

  it("plays instantly when asked to run in sync", async () => {
    const el = element();
    const animation = createAnimation().addElement(el).duration(500).fromTo("opacity", 0, 1);

    await animation.play({ sync: true });

    expect(animation.isRunning()).toBe(false);
  });

  it("finishes without Web Animations, applying its after styles anyway", async () => {
    const original = Element.prototype.animate;
    // @ts-expect-error — modelling an environment that has no Web Animations.
    Element.prototype.animate = undefined;

    try {
      const el = element();
      const onFinish = vi.fn();

      await createAnimation()
        .addElement(el)
        .duration(500)
        .fromTo("opacity", 0, 1)
        .afterStyles({ opacity: "1" })
        .onFinish(onFinish)
        .play();

      expect(onFinish).toHaveBeenCalledTimes(1);
      expect(el.style.opacity).toBe("1");
    } finally {
      Element.prototype.animate = original;
    }
  });

  it("stop() resolves a pending play without running the finish callbacks", async () => {
    const el = element();
    const onFinish = vi.fn();
    const animation = createAnimation()
      .addElement(el)
      .duration(500)
      .fromTo("opacity", 0, 1)
      .onFinish(onFinish);

    const playing = animation.play();
    animation.stop();
    await playing;

    expect(onFinish).not.toHaveBeenCalled();
  });

  it("scrubs through progressStart and progressStep, then plays out with progressEnd", async () => {
    const el = element();
    const animation = createAnimation()
      .addElement(el)
      .duration(500)
      .easing("ease-out")
      .fromTo("opacity", 0, 1);

    // A gesture-driven animation is forced to linear so the sheet tracks the
    // finger one-to-one instead of easing under it.
    animation.progressStart(true, 0);
    expect(animation.getEasing()).toBe("linear");

    animation.progressStep(0.5);

    // Handing control back restores the real easing and runs out the rest of
    // the animation over the duration the gesture asked for.
    animation.progressEnd(1, 0.5, 100);
    expect(animation.getEasing()).toBe("ease-out");
    expect(animation.getDuration()).toBe(100);

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    // ...and that override is forgotten once it lands.
    expect(animation.getDuration()).toBe(500);
  });

  it("progressEnd(0) rewinds instead of completing", async () => {
    const el = element();
    const steps: number[] = [];
    const animation = createAnimation()
      .addElement(el)
      .duration(500)
      .fromTo("opacity", 0, 1)
      .onFinish((currentStep) => steps.push(currentStep));

    animation.progressStart(true, 0);
    animation.progressStep(0.4);
    animation.progressEnd(0, 0.4, 100);

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(animation.getDirection()).toBe("normal");
    expect(steps).toEqual([0]);
  });

  it("destroy() releases the elements and keyframes", () => {
    const animation = createAnimation().addElement(element()).fromTo("opacity", 0, 1);

    animation.destroy();

    expect(animation.elements).toHaveLength(0);
    expect(animation.getKeyframes()).toHaveLength(0);
  });
});
