import { describe, expect, it, vi } from "vitest";
import { createModal } from "../src";
import { modals$ } from "../src/store";
import { flush, modalRoots, renderContainer } from "./helpers";

const indexOf = (el: HTMLElement): string => el.style.getPropertyValue("--psm-index").trim();

describe("stacking", () => {
  it("stacks modals in creation order and raises each one above the last", async () => {
    renderContainer();

    createModal(<p data-testid="a">a</p>);
    createModal(<p data-testid="b">b</p>);
    createModal(<p data-testid="c">c</p>);
    await flush();

    const roots = modalRoots();
    expect(roots).toHaveLength(3);
    expect(roots.map(indexOf)).toEqual(["0", "1", "2"]);
    expect(roots.map((root) => root.textContent)).toEqual(["a", "b", "c"]);
  });

  it("putAfter slots a modal directly above a specific one", async () => {
    renderContainer();

    const bottom = createModal(<p>bottom</p>);
    createModal(<p>top</p>);
    await flush();

    createModal(<p>middle</p>, { putAfter: bottom.id });
    await flush();

    expect(modalRoots().map((root) => root.textContent)).toEqual(["bottom", "middle", "top"]);
  });

  it("putAfter with an unknown id falls back to the top of the stack", async () => {
    renderContainer();

    createModal(<p>a</p>);
    await flush();
    createModal(<p>b</p>, { putAfter: "not-a-modal" });
    await flush();

    expect(modalRoots().map((root) => root.textContent)).toEqual(["a", "b"]);
  });

  it("does not re-present the modals already on screen when another opens", async () => {
    // `<For>` caches its vnodes by item identity, so an existing host is
    // re-rendered with a new index rather than remounted. If that ever stopped
    // holding, every open modal would replay its entrance whenever a new one
    // appeared.
    renderContainer();
    const onWillPresent = vi.fn();
    const onDidPresent = vi.fn();

    createModal(<p>first</p>, { onWillPresent, onDidPresent });
    await flush();
    expect(onWillPresent).toHaveBeenCalledTimes(1);

    createModal(<p>second</p>);
    createModal(<p>third</p>);
    await flush();

    expect(onWillPresent).toHaveBeenCalledTimes(1);
    expect(onDidPresent).toHaveBeenCalledTimes(1);
  });

  it("renumbers the remaining modals when one in the middle closes", async () => {
    renderContainer();

    createModal(<p>a</p>);
    const middle = createModal(<p>b</p>);
    createModal(<p>c</p>);
    await flush();

    await middle.close();
    await flush();

    const roots = modalRoots();
    expect(roots.map((root) => root.textContent)).toEqual(["a", "c"]);
    expect(roots.map(indexOf)).toEqual(["0", "1"]);
    expect(modals$.value).toHaveLength(2);
  });
});
