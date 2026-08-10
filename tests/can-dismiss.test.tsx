import { describe, expect, it, vi } from "vitest";
import { createModal } from "../src";
import type { ModalDismissal } from "../src";
import { modals$ } from "../src/store";
import { click, flush, modalRoots, pressKey, renderContainer } from "./helpers";

describe("canDismiss", () => {
  it("canDismiss: false refuses every route out", async () => {
    renderContainer();
    const modal = createModal(<p>hello</p>, { canDismiss: false });
    await flush();

    await expect(modal.close()).resolves.toBe(false);
    await pressKey("Escape");
    const backdrop = modalRoots()[0]?.querySelector(".psm-backdrop");
    if (backdrop) await click(backdrop);

    expect(modals$.value).toHaveLength(1);
    expect(document.querySelector(".psm-wrapper")?.textContent).toBe("hello");
  });

  it("an async guard holds the modal open until it resolves", async () => {
    renderContainer();

    let allow!: (value: boolean) => void;
    const decision = new Promise<boolean>((resolve) => {
      allow = resolve;
    });

    const modal = createModal(<p>hello</p>, { canDismiss: () => decision });
    await flush();

    const closing = modal.close();
    await flush();
    expect(modals$.value).toHaveLength(1);

    allow(true);
    await expect(closing).resolves.toBe(true);
    await flush();
    expect(modals$.value).toHaveLength(0);
  });

  it("hands the guard the pending data and role", async () => {
    renderContainer();
    const canDismiss = vi.fn<(d: ModalDismissal<string>) => boolean>(() => true);

    const modal = createModal<string>(<p>hello</p>, { canDismiss });
    await flush();

    await modal.close("payload", "save");

    expect(canDismiss).toHaveBeenCalledWith({ data: "payload", role: "save" });
  });

  it("stays closable after a refusal", async () => {
    renderContainer();

    let allowed = false;
    const modal = createModal(<p>hello</p>, { canDismiss: () => allowed });
    await flush();

    await expect(modal.close()).resolves.toBe(false);
    expect(modals$.value).toHaveLength(1);

    allowed = true;
    await expect(modal.close()).resolves.toBe(true);
    await flush();
    expect(modals$.value).toHaveLength(0);
  });

  it("does not fire the dismiss hooks when it refuses", async () => {
    renderContainer();
    const onWillDismiss = vi.fn();
    const onDidDismiss = vi.fn();

    const modal = createModal(<p>hello</p>, {
      canDismiss: false,
      onWillDismiss,
      onDidDismiss,
    });
    await flush();

    await modal.close();

    expect(onWillDismiss).not.toHaveBeenCalled();
    expect(onDidDismiss).not.toHaveBeenCalled();
  });

  it("lets closeAllModals skip the modals that refuse and close the rest", async () => {
    renderContainer();
    createModal(<p>a</p>);
    createModal(<p>stubborn</p>, { canDismiss: false });
    createModal(<p>c</p>);
    await flush();

    const { closeAllModals } = await import("../src");
    await closeAllModals();
    await flush();

    expect(modals$.value).toHaveLength(1);
    expect(document.querySelector(".psm-wrapper")?.textContent).toBe("stubborn");
  });
});
