import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { ModalContainer, createModal } from "../src";
import { click, flush, modalRoots, pressKey } from "./helpers";

/**
 * A page with something focusable outside the modal system, so the tests can
 * check what happens to the rest of the document.
 */
const renderPage = () =>
  render(
    <div>
      <main data-testid="page">
        <button type="button" id="page-button">
          behind
        </button>
      </main>
      <ModalContainer />
    </div>,
  );

const Form = () => (
  <>
    <input data-testid="first" />
    <button type="button" data-testid="last">
      submit
    </button>
  </>
);

const wrapper = (index = 0): HTMLElement => {
  const el = modalRoots()[index]?.querySelector<HTMLElement>(".psm-wrapper");
  if (!el) throw new Error(`no wrapper for modal ${index}`);
  return el;
};

describe("accessibility", () => {
  it("marks the modal as a dialog and passes the aria options through", async () => {
    renderPage();
    createModal(<p id="desc">details</p>, {
      ariaLabel: "Settings",
      ariaLabelledBy: "title",
      ariaDescribedBy: "desc",
    });
    await flush();

    const el = wrapper();
    expect(el.getAttribute("role")).toBe("dialog");
    expect(el.getAttribute("aria-modal")).toBe("true");
    expect(el.getAttribute("aria-label")).toBe("Settings");
    expect(el.getAttribute("aria-labelledby")).toBe("title");
    expect(el.getAttribute("aria-describedby")).toBe("desc");
  });

  it("moves focus to the first focusable element inside the modal", async () => {
    renderPage();
    createModal(<Form />);
    await flush();

    expect(document.activeElement).toBe(document.querySelector('[data-testid="first"]'));
  });

  it("focuses the dialog itself when there is nothing focusable in it", async () => {
    renderPage();
    createModal(<p>read only</p>);
    await flush();

    expect(document.activeElement).toBe(wrapper());
  });

  it("wraps Tab from the last element back to the first", async () => {
    renderPage();
    createModal(<Form />);
    await flush();

    const last = document.querySelector<HTMLElement>('[data-testid="last"]');
    last?.focus();
    await pressKey("Tab");

    expect(document.activeElement).toBe(document.querySelector('[data-testid="first"]'));
  });

  it("wraps Shift+Tab from the first element back to the last", async () => {
    renderPage();
    createModal(<Form />);
    await flush();

    await pressKey("Tab", { shiftKey: true });

    expect(document.activeElement).toBe(document.querySelector('[data-testid="last"]'));
  });

  it("hides the rest of the page from assistive tech and gives it back", async () => {
    renderPage();
    const page = document.querySelector('[data-testid="page"]');
    expect(page?.hasAttribute("inert")).toBe(false);

    const modal = createModal(<Form />);
    await flush();

    expect(page?.hasAttribute("inert")).toBe(true);
    expect(page?.getAttribute("aria-hidden")).toBe("true");

    await modal.close();
    await flush();

    expect(page?.hasAttribute("inert")).toBe(false);
    expect(page?.hasAttribute("aria-hidden")).toBe(false);
  });

  it("keeps the page hidden while a modal underneath is still open", async () => {
    renderPage();
    const page = document.querySelector('[data-testid="page"]');

    createModal(<Form />);
    await flush();
    const top = createModal(<Form />);
    await flush();

    const bottomRoot = modalRoots()[0];
    expect(bottomRoot?.hasAttribute("inert")).toBe(true);

    await top.close();
    await flush();

    // The lower modal is usable again, the page behind it still is not.
    expect(bottomRoot?.hasAttribute("inert")).toBe(false);
    expect(page?.hasAttribute("inert")).toBe(true);
  });

  it("returns focus to whatever had it before the modal opened", async () => {
    renderPage();
    const pageButton = document.getElementById("page-button");
    pageButton?.focus();
    expect(document.activeElement).toBe(pageButton);

    const modal = createModal(<Form />);
    await flush();
    expect(document.activeElement).not.toBe(pageButton);

    await modal.close();
    await flush();

    expect(document.activeElement).toBe(pageButton);
  });

  it("focusTrap: false leaves focus and the page alone", async () => {
    renderPage();
    const pageButton = document.getElementById("page-button");
    pageButton?.focus();

    createModal(<Form />, { focusTrap: false });
    await flush();

    expect(document.activeElement).toBe(pageButton);
    expect(document.querySelector('[data-testid="page"]')?.hasAttribute("inert")).toBe(false);
  });

  it("never inerts anything inside the modal layer, the backdrop included", async () => {
    // `inert` swallows pointer events as well as focus. Inerting the backdrop —
    // which is the dialog's sibling, not its child — would make clicking it do
    // nothing, and clicks would fall through the modal layer to the page
    // behind. jsdom implements the attribute but none of its behaviour, so
    // this has to be asserted on the attribute itself.
    renderPage();
    createModal(<Form />, { breakpoints: [0, 1], initialBreakpoint: 1 });
    await flush();

    const root = modalRoots()[0];
    if (!root) throw new Error("no modal root");

    expect(root.hasAttribute("inert")).toBe(false);
    for (const selector of [".psm-backdrop", ".psm-wrapper", ".psm-content", ".psm-handle"]) {
      const el = root.querySelector(selector);
      expect(el, `${selector} is missing`).not.toBeNull();
      expect(el?.hasAttribute("inert"), `${selector} is inert`).toBe(false);
    }

    // The trap must not hide any of these either. The drag handle is the one
    // exception, and that aria-hidden is ours: it is decorative, and a screen
    // reader has `setBreakpoint` rather than a grab bar.
    for (const selector of [".psm-backdrop", ".psm-wrapper", ".psm-content"]) {
      expect(
        root.querySelector(selector)?.hasAttribute("aria-hidden"),
        `${selector} is aria-hidden`,
      ).toBe(false);
    }
  });

  it("keeps the backdrop clickable while the page around it is hidden", async () => {
    renderPage();
    const modal = createModal(<Form />);
    await flush();

    const backdrop = modalRoots()[0]?.querySelector(".psm-backdrop");
    if (!backdrop) throw new Error("no backdrop");
    expect(backdrop.hasAttribute("inert")).toBe(false);
    expect(document.querySelector('[data-testid="page"]')?.hasAttribute("inert")).toBe(true);

    await click(backdrop);

    await expect(modal.afterClose).resolves.toEqual({ data: undefined, role: "backdrop" });
  });

  it("does not hide stylesheets and scripts along with the page", async () => {
    const style = document.createElement("style");
    document.body.appendChild(style);

    renderPage();
    createModal(<Form />);
    await flush();

    expect(style.hasAttribute("inert")).toBe(false);
    style.remove();
  });
});
