import { describe, expect, it } from "vitest";
import { createModal, useModal } from "../src";
import {
  getNextBreakpoint,
  normalizeBreakpoints,
  resolveGestureBreakpoint,
  snapToBreakpoint,
} from "../src/core/breakpoints";
import { modals$ } from "../src/store";
import { drag, flush, modalRoots, renderContainer } from "./helpers";

const VIEWPORT = window.innerHeight; // jsdom: 768

const sheet = (initialBreakpoint = 0.25, options = {}) =>
  createModal(<p>sheet</p>, {
    breakpoints: [0, 0.25, 0.5, 1],
    initialBreakpoint,
    ...options,
  });

const wrapper = (): HTMLElement => {
  const el = modalRoots()[0]?.querySelector<HTMLElement>(".psm-wrapper");
  if (!el) throw new Error("no sheet wrapper");
  return el;
};

describe("breakpoint maths", () => {
  it("sorts and de-duplicates the breakpoints", () => {
    expect(normalizeBreakpoints([0.5, 0, 0.5, 1], 0.5)).toEqual({
      breakpoints: [0, 0.5, 1],
      initialBreakpoint: 0.5,
    });
  });

  it("rejects breakpoints outside 0…1", () => {
    expect(() => normalizeBreakpoints([0, 1.5], 0)).toThrow(/between 0 and 1/);
  });

  it("rejects an empty list", () => {
    expect(() => normalizeBreakpoints([], 0)).toThrow(/must not be empty/);
  });

  it("insists on an initialBreakpoint, and on it being one of the breakpoints", () => {
    expect(() => normalizeBreakpoints([0, 0.5], undefined)).toThrow(
      /`initialBreakpoint` is required/,
    );
    expect(() => normalizeBreakpoints([0, 0.5], 0.75)).toThrow(/is not one of the breakpoints/);
  });

  it("snaps to the nearest breakpoint", () => {
    expect(snapToBreakpoint(0.3, [0, 0.25, 0.5, 1])).toBe(0.25);
    expect(snapToBreakpoint(0.4, [0, 0.25, 0.5, 1])).toBe(0.5);
    expect(snapToBreakpoint(0.9, [0, 0.25, 0.5, 1])).toBe(1);
  });

  it("follows a flick past the nearest breakpoint", () => {
    const points = [0, 0.25, 0.5, 1];

    // Slow enough to be a drag: nearest wins.
    expect(resolveGestureBreakpoint(0.3, 0.0001, points)).toBe(0.25);
    // A flick upwards carries on to the next one up.
    expect(resolveGestureBreakpoint(0.3, 0.005, points)).toBe(0.5);
    // And downwards, to the next one down.
    expect(resolveGestureBreakpoint(0.3, -0.005, points)).toBe(0.25);
    expect(resolveGestureBreakpoint(0.2, -0.005, points)).toBe(0);
  });

  it("cycles the handle upwards and wraps past the top", () => {
    const points = [0, 0.25, 0.5, 1];

    expect(getNextBreakpoint(0.25, points)).toBe(0.5);
    expect(getNextBreakpoint(0.5, points)).toBe(1);
    // Wraps to the lowest breakpoint that is not a dismissal.
    expect(getNextBreakpoint(1, points)).toBe(0.25);
  });
});

describe("sheet modal", () => {
  it("refuses to open with an initialBreakpoint that is not a breakpoint", () => {
    renderContainer();
    expect(() => sheet(0.75)).toThrow(/is not one of the breakpoints/);
  });

  it("marks itself as a sheet and shows a drag handle", async () => {
    renderContainer();
    sheet();
    await flush();

    const root = modalRoots()[0];
    expect(root?.classList.contains("psm-root--sheet")).toBe(true);
    expect(root?.querySelector(".psm-handle")).not.toBeNull();
  });

  it("hides the handle when asked", async () => {
    renderContainer();
    sheet(0.25, { handle: false });
    await flush();

    expect(modalRoots()[0]?.querySelector(".psm-handle")).toBeNull();
  });

  it("makes the handle a real button only when tapping it does something", async () => {
    renderContainer();
    sheet(0.25, { handleBehavior: "cycle" });
    await flush();

    const handle = modalRoots()[0]?.querySelector(".psm-handle");
    expect(handle?.tagName).toBe("BUTTON");
    expect(handle?.getAttribute("aria-label")).toBeTruthy();
  });

  it("comes to rest at its initial breakpoint", async () => {
    renderContainer();
    sheet(0.25);
    await flush();

    expect(wrapper().style.transform).toBe("translateY(75%)");
  });

  it("flags itself as fullscreen at breakpoint 1, so the top corners can square off", async () => {
    renderContainer();
    sheet(0.25);
    await flush();

    const root = modalRoots()[0];
    expect(root?.hasAttribute("data-fullscreen")).toBe(false);

    const handle = root?.querySelector<HTMLElement>(".psm-handle");
    if (!handle) throw new Error("no handle");

    // 0.25 → 1 in one drag: 75% of a 768px viewport is 576px upwards.
    await drag(
      handle,
      { x: 100, y: 700 },
      { x: 100, y: 700 - VIEWPORT * 0.75 },
      { duration: 1000 },
    );

    expect(modalRoots()[0]?.getAttribute("data-fullscreen")).toBe("true");
  });

  it("drops the fullscreen flag on the way back down", async () => {
    renderContainer();
    sheet(1);
    await flush();
    expect(modalRoots()[0]?.getAttribute("data-fullscreen")).toBe("true");

    const handleEl = modalRoots()[0]?.querySelector<HTMLElement>(".psm-handle");
    if (!handleEl) throw new Error("no handle");

    await drag(
      handleEl,
      { x: 100, y: 100 },
      { x: 100, y: 100 + VIEWPORT * 0.5 },
      { duration: 1000 },
    );

    expect(modalRoots()[0]?.hasAttribute("data-fullscreen")).toBe(false);
  });

  it("never flags a regular modal as fullscreen", async () => {
    renderContainer();
    createModal(<p>regular</p>);
    await flush();

    expect(modalRoots()[0]?.hasAttribute("data-fullscreen")).toBe(false);
  });

  it("snaps to the nearest breakpoint after a slow drag", async () => {
    renderContainer();
    sheet(0.25);
    await flush();

    // 200px up on a 768px viewport is 0.26 — from 0.25 that lands on 0.51.
    await drag(wrapper(), { x: 100, y: 600 }, { x: 100, y: 400 }, { duration: 1000 });

    expect(wrapper().style.transform).toBe("translateY(50%)");
    expect(modals$.value).toHaveLength(1);
  });

  it("closes with role gesture when swiped down past the bottom breakpoint", async () => {
    renderContainer();
    const modal = sheet(0.5);
    await flush();

    await drag(wrapper(), { x: 100, y: 100 }, { x: 100, y: 100 + VIEWPORT }, { duration: 200 });

    await expect(modal.afterClose).resolves.toEqual({ data: undefined, role: "gesture" });
    expect(modals$.value).toHaveLength(0);
  });

  it("ignores a drag that never passes the threshold", async () => {
    renderContainer();
    sheet(0.25);
    await flush();

    await drag(wrapper(), { x: 100, y: 600 }, { x: 100, y: 598 });

    expect(wrapper().style.transform).toBe("translateY(75%)");
    expect(modals$.value).toHaveLength(1);
  });

  it("cycles to the next breakpoint when the handle is tapped", async () => {
    renderContainer();
    sheet(0.25, { handleBehavior: "cycle" });
    await flush();

    const handle = modalRoots()[0]?.querySelector<HTMLElement>(".psm-handle");
    if (!handle) throw new Error("no handle");
    await drag(handle, { x: 100, y: 600 }, { x: 100, y: 600 });

    expect(wrapper().style.transform).toBe("translateY(50%)");
  });

  it("does nothing on a handle tap when the behaviour is none", async () => {
    renderContainer();
    sheet(0.25);
    await flush();

    const handle = modalRoots()[0]?.querySelector<HTMLElement>(".psm-handle");
    if (!handle) throw new Error("no handle");
    await drag(handle, { x: 100, y: 600 }, { x: 100, y: 600 });

    expect(wrapper().style.transform).toBe("translateY(75%)");
  });

  it("exposes the breakpoint through useModal and lets content move the sheet", async () => {
    renderContainer();

    let handle: {
      breakpoint$: { value: number | undefined };
      setBreakpoint(b: number): Promise<void>;
    };
    const Content = () => {
      handle = useModal();
      return <p>sheet</p>;
    };

    createModal(<Content />, { breakpoints: [0, 0.25, 1], initialBreakpoint: 0.25 });
    await flush();
    expect(handle!.breakpoint$.value).toBe(0.25);
    await handle!.setBreakpoint(1);
    await flush();
    expect(handle!.breakpoint$.value).toBe(1);
    expect(wrapper().style.transform).toBe("translateY(0%)");
  });

  it("setBreakpoint(0) dismisses the sheet", async () => {
    renderContainer();

    let handle: { setBreakpoint(b: number): Promise<void> };
    const Content = () => {
      handle = useModal();
      return <p>sheet</p>;
    };

    createModal(<Content />, { breakpoints: [0, 0.5], initialBreakpoint: 0.5 });
    await flush();
    await handle!.setBreakpoint(0);
    await flush();

    expect(modals$.value).toHaveLength(0);
  });
});
