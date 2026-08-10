import { describe, expect, it, vi } from "vitest";
import { createModal } from "../src";
import { modals$ } from "../src/store";
import { flush, renderContainer } from "./helpers";

describe("lifecycle hooks", () => {
  it("fires present and dismiss hooks in order", async () => {
    renderContainer();
    const calls: string[] = [];

    const modal = createModal(<p>hello</p>, {
      onWillPresent: () => calls.push("willPresent"),
      onDidPresent: () => calls.push("didPresent"),
      onWillDismiss: () => calls.push("willDismiss"),
      onDidDismiss: () => calls.push("didDismiss"),
    });
    await flush();

    expect(calls).toEqual(["willPresent", "didPresent"]);

    await modal.close();
    await flush();

    expect(calls).toEqual(["willPresent", "didPresent", "willDismiss", "didDismiss"]);
  });

  it("hands the dismissal to both dismiss hooks", async () => {
    renderContainer();
    const onWillDismiss = vi.fn();
    const onDidDismiss = vi.fn();

    const modal = createModal<number>(<p>hello</p>, { onWillDismiss, onDidDismiss });
    await flush();

    await modal.close(42, "confirm");

    expect(onWillDismiss).toHaveBeenCalledWith({ data: 42, role: "confirm" });
    expect(onDidDismiss).toHaveBeenCalledWith({ data: 42, role: "confirm" });
  });

  it("reports its state through the whole cycle", async () => {
    renderContainer();
    const modal = createModal(<p>hello</p>);

    const state = () => modals$.value[0]?.state$.value;
    expect(state()).toBe("presenting");

    await flush();
    expect(state()).toBe("presented");

    const closing = modal.close();
    // `close` awaits `canDismiss` first, so give it a turn to reach the
    // dismissing state before looking.
    await Promise.resolve();
    await Promise.resolve();
    expect(state()).toBe("dismissing");

    await closing;
    expect(modals$.value).toHaveLength(0);
  });

  it("mirrors the state onto the root element for CSS to hook into", async () => {
    renderContainer();
    createModal(<p>hello</p>);
    await flush();

    expect(document.querySelector(".psm-root")?.getAttribute("data-state")).toBe("presented");
  });

  it("does not present a modal that was closed before it finished entering", async () => {
    renderContainer();
    const onDidPresent = vi.fn();

    const modal = createModal(<p>hello</p>, { onDidPresent });
    // No flush — the enter animation has not had a chance to finish.
    await modal.close();
    await flush();

    expect(onDidPresent).not.toHaveBeenCalled();
    expect(modals$.value).toHaveLength(0);
  });
});
