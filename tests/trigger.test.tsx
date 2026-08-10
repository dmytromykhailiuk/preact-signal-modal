import { render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { Modal, ModalContainer, hasModals } from "../src";
import { click, flush, modalRoots } from "./helpers";

describe("trigger", () => {
  it("opens the modal when the trigger element is clicked", async () => {
    render(
      <>
        <button type="button" id="open-it">
          open
        </button>
        <ModalContainer />
        <Modal trigger="open-it">
          <p data-testid="body">triggered</p>
        </Modal>
      </>,
    );
    await flush();
    expect(hasModals()).toBe(false);

    const button = document.getElementById("open-it");
    if (!button) throw new Error("trigger not rendered");
    await click(button);

    expect(document.querySelector('[data-testid="body"]')).not.toBeNull();
  });

  it("opens again after the modal was dismissed", async () => {
    render(
      <>
        <button type="button" id="open-it">
          open
        </button>
        <ModalContainer />
        <Modal trigger="open-it">
          <p data-testid="body">triggered</p>
        </Modal>
      </>,
    );
    await flush();

    const button = document.getElementById("open-it");
    if (!button) throw new Error("trigger not rendered");

    await click(button);
    expect(hasModals()).toBe(true);

    const backdrop = modalRoots()[0]?.querySelector(".psm-backdrop");
    if (!backdrop) throw new Error("no backdrop");
    await click(backdrop);
    expect(hasModals()).toBe(false);

    // The component owns this state, so it has to have reset it — otherwise a
    // trigger modal could only ever be opened once.
    await click(button);
    expect(hasModals()).toBe(true);
  });

  it("follows the trigger when the id changes", async () => {
    const view = (trigger: string) => (
      <>
        <button type="button" id="first">
          first
        </button>
        <button type="button" id="second">
          second
        </button>
        <ModalContainer />
        <Modal trigger={trigger}>
          <p>hello</p>
        </Modal>
      </>
    );

    const { rerender } = render(view("first"));
    await flush();

    rerender(view("second"));
    await flush();

    const first = document.getElementById("first");
    if (first) await click(first);
    expect(hasModals()).toBe(false);

    const second = document.getElementById("second");
    if (second) await click(second);
    expect(hasModals()).toBe(true);
  });

  it("stops listening once the modal component unmounts", async () => {
    const { unmount } = render(
      <>
        <button type="button" id="open-it">
          open
        </button>
        <ModalContainer />
        <Modal trigger="open-it">
          <p>hello</p>
        </Modal>
      </>,
    );
    await flush();

    const button = document.getElementById("open-it");
    unmount();
    // The button is gone from the tree, but hold on to the node and click it
    // anyway — a listener left behind would still fire.
    if (button) await click(button);

    expect(hasModals()).toBe(false);
  });

  it("warns instead of failing silently when the trigger id matches nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <>
        <ModalContainer />
        <Modal trigger="nowhere">
          <p>hello</p>
        </Modal>
      </>,
    );
    await flush();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('id "nowhere"'));
    warn.mockRestore();
  });
});
