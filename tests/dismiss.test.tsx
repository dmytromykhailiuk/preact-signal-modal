import { describe, expect, it, vi } from "vitest";
import { createModal } from "../src";
import { modals$ } from "../src/store";
import { click, flush, modalRoots, pressKey, renderContainer } from "./helpers";

const backdrop = (index = 0): HTMLElement => {
  const el = modalRoots()[index]?.querySelector<HTMLElement>(".psm-backdrop");
  if (!el) throw new Error(`No backdrop for modal ${index}`);
  return el;
};

describe("dismissing", () => {
  it("closes on a backdrop click with role backdrop", async () => {
    renderContainer();
    const modal = createModal(<p>hello</p>);
    await flush();

    await click(backdrop());

    await expect(modal.afterClose).resolves.toEqual({ data: undefined, role: "backdrop" });
    expect(modals$.value).toHaveLength(0);
  });

  it("ignores a click that merely bubbled up from the content", async () => {
    renderContainer();
    const modal = createModal(
      <button type="button" data-testid="inside">
        click me
      </button>,
    );
    await flush();

    const onClose = vi.fn();
    void modal.afterClose.then(onClose);

    const inside = document.querySelector('[data-testid="inside"]');
    if (!inside) throw new Error("content not rendered");
    await click(inside);

    expect(onClose).not.toHaveBeenCalled();
    expect(modals$.value).toHaveLength(1);
  });

  it("backdropDismiss: false keeps the modal open", async () => {
    renderContainer();
    createModal(<p>hello</p>, { backdropDismiss: false });
    await flush();

    await click(backdrop());

    expect(modals$.value).toHaveLength(1);
  });

  it("closes on Escape with role escape", async () => {
    renderContainer();
    const modal = createModal(<p>hello</p>);
    await flush();

    await pressKey("Escape");

    await expect(modal.afterClose).resolves.toEqual({ data: undefined, role: "escape" });
    expect(modals$.value).toHaveLength(0);
  });

  it("keyboardClose: false ignores Escape", async () => {
    renderContainer();
    createModal(<p>hello</p>, { keyboardClose: false });
    await flush();

    await pressKey("Escape");

    expect(modals$.value).toHaveLength(1);
  });

  it("Escape only reaches the topmost modal", async () => {
    renderContainer();
    createModal(<p>bottom</p>);
    const top = createModal(<p>top</p>);
    await flush();

    await pressKey("Escape");

    await expect(top.afterClose).resolves.toEqual({ data: undefined, role: "escape" });
    expect(modals$.value).toHaveLength(1);
    expect(modalRoots()[0]?.textContent).toBe("bottom");
  });

  it("a keyboardClose: false modal on top swallows Escape rather than passing it down", async () => {
    renderContainer();
    createModal(<p>bottom</p>);
    createModal(<p>top</p>, { keyboardClose: false });
    await flush();

    await pressKey("Escape");

    expect(modals$.value).toHaveLength(2);
  });

  it("stops listening for Escape once the stack is empty", async () => {
    renderContainer();
    const modal = createModal(<p>hello</p>);
    await flush();
    await modal.close();
    await flush();

    // Nothing to close, and nothing should throw.
    await pressKey("Escape");
    expect(modals$.value).toHaveLength(0);
  });

  it("showBackdrop: false hides the backdrop but keeps the modal", async () => {
    renderContainer();
    createModal(<p>hello</p>, { showBackdrop: false });
    await flush();

    expect(backdrop().classList.contains("psm-backdrop--hidden")).toBe(true);
    expect(modalRoots()[0]?.querySelector(".psm-wrapper")).not.toBeNull();
  });
});
