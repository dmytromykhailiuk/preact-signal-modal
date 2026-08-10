import { computed } from "@preact/signals";
import { describe, expect, it } from "vitest";
import {
  closeAllModals,
  closeModal,
  createModal,
  getTopModal,
  hasModals,
  hasModals$,
} from "../src";
import { modals$ } from "../src/store";
import { flush, modalRoots, renderContainer } from "./helpers";

describe("createModal", () => {
  it("renders the content inside the container and tracks it in modals$", async () => {
    renderContainer();

    createModal(<p data-testid="body">hello</p>);
    await flush();

    expect(document.querySelector('[data-testid="body"]')?.textContent).toBe("hello");
    expect(modals$.value).toHaveLength(1);
    expect(modalRoots()).toHaveLength(1);
  });

  it("renders nothing at all without a container", async () => {
    createModal(<p data-testid="body">hello</p>);
    await flush();

    expect(document.querySelector('[data-testid="body"]')).toBeNull();
    // The modal is still in the stack — it simply has nowhere to be drawn.
    expect(modals$.value).toHaveLength(1);
  });

  it("resolves afterClose with the data and the role", async () => {
    renderContainer();

    const modal = createModal<{ picked: string }>(<p>pick one</p>);
    await flush();

    void modal.close({ picked: "b" });
    const result = await modal.afterClose;

    expect(result).toEqual({ data: { picked: "b" }, role: "handler" });
  });

  it("destroys the content on close instead of leaving it in the DOM", async () => {
    renderContainer();

    const modal = createModal(<p data-testid="body">hello</p>);
    await flush();
    expect(document.querySelector('[data-testid="body"]')).not.toBeNull();

    void modal.close();
    await modal.afterClose;
    await flush();

    expect(document.querySelector('[data-testid="body"]')).toBeNull();
    expect(modalRoots()).toHaveLength(0);
    expect(modals$.value).toHaveLength(0);
  });

  it("close() resolves true once and stays harmless when called again", async () => {
    renderContainer();

    const modal = createModal(<p>hello</p>);
    await flush();

    const first = await modal.close();
    const second = await modal.close();

    expect(first).toBe(true);
    // The second call rides the same dismissal rather than starting another.
    expect(second).toBe(true);
    expect(modals$.value).toHaveLength(0);
  });

  it("closeModal() closes by id and reports an unknown id", async () => {
    renderContainer();

    const modal = createModal<string>(<p>hello</p>);
    await flush();

    await expect(closeModal(modal.id, "done", "custom-role")).resolves.toBe(true);
    await expect(modal.afterClose).resolves.toEqual({ data: "done", role: "custom-role" });
    await expect(closeModal("does-not-exist")).resolves.toBe(false);
  });

  it("closeAllModals() empties the stack", async () => {
    renderContainer();

    const a = createModal(<p>a</p>);
    const b = createModal(<p>b</p>);
    const c = createModal(<p>c</p>);
    await flush();
    expect(modals$.value).toHaveLength(3);

    await closeAllModals("navigation");
    await flush();

    expect(modals$.value).toHaveLength(0);
    await expect(a.afterClose).resolves.toEqual({ data: undefined, role: "navigation" });
    await expect(b.afterClose).resolves.toEqual({ data: undefined, role: "navigation" });
    await expect(c.afterClose).resolves.toEqual({ data: undefined, role: "navigation" });
  });

  it("reports whether anything is open, and what is on top", async () => {
    renderContainer();
    expect(hasModals()).toBe(false);
    expect(getTopModal()).toBeUndefined();

    const bottom = createModal(<p>bottom</p>);
    await flush();
    expect(hasModals()).toBe(true);
    expect(getTopModal()?.id).toBe(bottom.id);

    const top = createModal(<p>top</p>);
    await flush();
    expect(getTopModal()?.id).toBe(top.id);

    await getTopModal()?.close(undefined, "from-the-top");
    await flush();
    expect(getTopModal()?.id).toBe(bottom.id);
    await expect(top.afterClose).resolves.toEqual({ data: undefined, role: "from-the-top" });

    await bottom.close();
    await flush();
    expect(hasModals()).toBe(false);
  });

  it("hasModals$ is the reactive one", async () => {
    renderContainer();
    const label = computed(() => (hasModals$.value ? "busy" : "idle"));
    expect(label.value).toBe("idle");

    const modal = createModal(<p>hello</p>);
    await flush();
    expect(label.value).toBe("busy");

    await modal.close();
    await flush();
    expect(label.value).toBe("idle");
  });

  it("the functions subscribe to nothing, whatever context they are called from", async () => {
    renderContainer();

    // The whole point of `hasModals()` being a function and `hasModals$` being
    // a signal: a function named `get…`/`has…` must not quietly register a
    // dependency, or no call site can be read at face value.
    let runs = 0;
    const derived = computed(() => {
      runs++;
      return hasModals() || getTopModal() !== undefined;
    });

    expect(derived.value).toBe(false);
    expect(runs).toBe(1);

    createModal(<p>hello</p>);
    await flush();

    // Still 1: nothing was tracked, so nothing invalidated the computed.
    expect(derived.value).toBe(false);
    expect(runs).toBe(1);

    // Called directly, they report the truth.
    expect(hasModals()).toBe(true);
    expect(getTopModal()).toBeDefined();
  });

  it("exposes the top modal's resolved options and state", async () => {
    renderContainer();
    createModal(<p>hello</p>, { backdropDismiss: false, mode: "ios" });
    await flush();

    const top = getTopModal();
    expect(top?.options.backdropDismiss).toBe(false);
    expect(top?.options.mode).toBe("ios");
    expect(top?.state$.value).toBe("presented");
  });

  it("gives every modal its own id", async () => {
    renderContainer();
    const a = createModal(<p>a</p>);
    const b = createModal(<p>b</p>);
    await flush();

    expect(a.id).not.toBe(b.id);
    expect(modals$.value.map((modal) => modal.id)).toEqual([a.id, b.id]);
  });
});
