import { describe, expect, it } from "vitest";
import { createModal } from "../src";
import { flush, renderContainer } from "./helpers";

describe("scroll lock", () => {
  it("locks the body while a modal is open and restores it after", async () => {
    renderContainer();
    expect(document.body.style.overflow).toBe("");

    const modal = createModal(<p>hello</p>);
    await flush();
    expect(document.body.style.overflow).toBe("hidden");

    await modal.close();
    await flush();
    expect(document.body.style.overflow).toBe("");
  });

  it("counts open modals so closing one of two keeps the lock", async () => {
    renderContainer();

    const first = createModal(<p>a</p>);
    const second = createModal(<p>b</p>);
    await flush();
    expect(document.body.style.overflow).toBe("hidden");

    await second.close();
    await flush();
    expect(document.body.style.overflow).toBe("hidden");

    await first.close();
    await flush();
    expect(document.body.style.overflow).toBe("");
  });

  it("puts back the overflow the page already had", async () => {
    document.body.style.overflow = "scroll";
    renderContainer();

    const modal = createModal(<p>hello</p>);
    await flush();
    expect(document.body.style.overflow).toBe("hidden");

    await modal.close();
    await flush();
    expect(document.body.style.overflow).toBe("scroll");

    document.body.style.overflow = "";
  });

  it("scrollLock: false leaves the page scrollable", async () => {
    renderContainer();

    createModal(<p>hello</p>, { scrollLock: false });
    await flush();

    expect(document.body.style.overflow).toBe("");
  });

  it("releases the lock when the container unmounts with a modal open", async () => {
    const container = renderContainer();
    createModal(<p>hello</p>);
    await flush();
    expect(document.body.style.overflow).toBe("hidden");

    container.unmount();
    await flush();

    expect(document.body.style.overflow).toBe("");
  });
});
