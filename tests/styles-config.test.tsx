import { describe, expect, it, vi } from "vitest";
import {
  configureModal,
  createAnimation,
  createModal,
  ensureModalStyles,
  getModalConfig,
} from "../src";
import type { AnimationBuilder } from "../src";
import { modals$ } from "../src/store";
import { MODAL_CSS, STYLE_ELEMENT_ID } from "../src/styles";
import { flush, renderContainer } from "./helpers";
import { setReducedMotion } from "./setup";

const styleTags = () => document.querySelectorAll(`#${STYLE_ELEMENT_ID}`);

describe("styles", () => {
  it("injects the stylesheet on the first modal and never twice", async () => {
    renderContainer();
    expect(styleTags()).toHaveLength(0);

    createModal(<p>a</p>);
    createModal(<p>b</p>);
    await flush();

    expect(styleTags()).toHaveLength(1);
    expect(document.getElementById(STYLE_ELEMENT_ID)?.textContent).toBe(MODAL_CSS);
  });

  it("has the stylesheet in place before the modal can be painted", () => {
    renderContainer();

    createModal(<p>a</p>);

    // No flush: the sheet must already be there the moment createModal returns,
    // otherwise the first modal of a session gets a frame of unstyled content.
    expect(styleTags()).toHaveLength(1);
  });

  it("ensureModalStyles can be called directly and is idempotent", () => {
    ensureModalStyles();
    ensureModalStyles();

    expect(styleTags()).toHaveLength(1);
  });

  it("injectStyles: false leaves the page alone", async () => {
    configureModal({ injectStyles: false });
    renderContainer();

    createModal(<p>a</p>);
    await flush();

    expect(styleTags()).toHaveLength(0);
  });

  it("ships a stylesheet that styles the elements the container renders", () => {
    for (const selector of [
      ".psm-root",
      ".psm-backdrop",
      ".psm-wrapper",
      ".psm-content",
      ".psm-handle",
    ]) {
      expect(MODAL_CSS).toContain(selector);
    }
    // Every token carries its fallback inline, so an app's own `:root` value
    // is never outranked by the stylesheet we append at runtime.
    expect(MODAL_CSS).toContain("var(--psm-backdrop-opacity, 0.32)");
    expect(MODAL_CSS).toContain("var(--psm-z-index, 1000)");
  });
});

describe("configureModal", () => {
  it("changes the defaults for modals created afterwards", async () => {
    configureModal({ backdropDismiss: false, mode: "ios" });
    renderContainer();

    createModal(<p>a</p>);
    await flush();

    expect(modals$.value[0]?.options.backdropDismiss).toBe(false);
    expect(modals$.value[0]?.options.mode).toBe("ios");
  });

  it("is still overridden by the options passed to a single modal", async () => {
    configureModal({ backdropDismiss: false });
    renderContainer();

    createModal(<p>a</p>, { backdropDismiss: true });
    await flush();

    expect(modals$.value[0]?.options.backdropDismiss).toBe(true);
  });

  it("reports the current configuration", () => {
    configureModal({ baseZIndex: 5000 });

    expect(getModalConfig().baseZIndex).toBe(5000);
    expect(getModalConfig().animated).toBe(true);
  });

  it("can swap the animations for every modal at once", async () => {
    const enter = vi.fn<AnimationBuilder>((el) => createAnimation().addElement(el).duration(1));
    configureModal({ enterAnimation: enter });
    renderContainer();

    createModal(<p>a</p>);
    await flush();

    expect(enter).toHaveBeenCalledTimes(1);
    expect(enter.mock.calls[0]?.[1]).toMatchObject({ mode: expect.any(String) });
  });
});

describe("animations per modal", () => {
  it("uses the enter and leave builders it was given", async () => {
    renderContainer();
    const enter = vi.fn<AnimationBuilder>((el) => createAnimation().addElement(el).duration(1));
    const leave = vi.fn<AnimationBuilder>((el) => createAnimation().addElement(el).duration(1));

    const modal = createModal(<p>a</p>, { enterAnimation: enter, leaveAnimation: leave });
    await flush();
    expect(enter).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();

    await modal.close();
    await flush();

    expect(leave).toHaveBeenCalledTimes(1);
    // The builder is handed the modal's root element, so it can reach the
    // backdrop and the wrapper itself.
    expect((enter.mock.calls[0]?.[0] as HTMLElement).classList.contains("psm-root")).toBe(true);
  });

  it("tells the builder which breakpoint a sheet is at", async () => {
    renderContainer();
    const enter = vi.fn<AnimationBuilder>((el) => createAnimation().addElement(el).duration(1));

    createModal(<p>a</p>, {
      breakpoints: [0, 0.5],
      initialBreakpoint: 0.5,
      backdropBreakpoint: 0.25,
      enterAnimation: enter,
    });
    await flush();

    expect(enter.mock.calls[0]?.[1]).toMatchObject({
      currentBreakpoint: 0.5,
      backdropBreakpoint: 0.25,
    });
  });

  it("turns animation off when the user asked their OS for less motion", async () => {
    setReducedMotion(true);
    renderContainer();

    createModal(<p>a</p>);
    await flush();

    expect(modals$.value[0]?.options.animated).toBe(false);
  });

  it("animates by default", async () => {
    renderContainer();
    createModal(<p>a</p>);
    await flush();

    expect(modals$.value[0]?.options.animated).toBe(true);
  });
});
