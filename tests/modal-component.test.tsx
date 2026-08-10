import { computed, signal } from "@preact/signals";
import { act, render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { Modal, ModalContainer } from "../src";
import { modals$ } from "../src/store";
import { click, flush, modalRoots, pressKey } from "./helpers";

const setOpen = async (open$: { value: boolean }, value: boolean): Promise<void> => {
  await act(async () => {
    open$.value = value;
  });
  await flush();
};

describe("<Modal>", () => {
  it("opens and closes with the signal", async () => {
    const open$ = signal(false);
    render(
      <>
        <ModalContainer />
        <Modal isOpen={open$}>
          <p data-testid="body">declarative</p>
        </Modal>
      </>,
    );
    await flush();
    expect(modals$.value).toHaveLength(0);

    await setOpen(open$, true);
    expect(document.querySelector('[data-testid="body"]')?.textContent).toBe("declarative");

    await setOpen(open$, false);
    expect(document.querySelector('[data-testid="body"]')).toBeNull();
    expect(modals$.value).toHaveLength(0);
  });

  it("opens straight away when the signal starts out true", async () => {
    const open$ = signal(true);
    render(
      <>
        <ModalContainer />
        <Modal isOpen={open$}>
          <p data-testid="body">open on mount</p>
        </Modal>
      </>,
    );
    await flush();

    expect(document.querySelector('[data-testid="body"]')).not.toBeNull();
  });

  it("closes on the backdrop without writing to the caller's signal", async () => {
    const open$ = signal(true);
    const onDidDismiss = vi.fn();
    render(
      <>
        <ModalContainer />
        <Modal isOpen={open$} onDidDismiss={onDidDismiss}>
          <p>hello</p>
        </Modal>
      </>,
    );
    await flush();

    const backdrop = modalRoots()[0]?.querySelector(".psm-backdrop");
    if (!backdrop) throw new Error("no backdrop");
    await click(backdrop);

    // The modal is gone, and the signal is untouched: it belongs to the caller,
    // who hears about the dismissal and syncs it.
    expect(modals$.value).toHaveLength(0);
    expect(open$.value).toBe(true);
    expect(onDidDismiss).toHaveBeenCalledWith({ data: undefined, role: "backdrop" });
  });

  it("closes on Escape without writing to the caller's signal", async () => {
    const open$ = signal(true);
    const onDidDismiss = vi.fn();
    render(
      <>
        <ModalContainer />
        <Modal isOpen={open$} onDidDismiss={onDidDismiss}>
          <p>hello</p>
        </Modal>
      </>,
    );
    await flush();

    await pressKey("Escape");

    expect(modals$.value).toHaveLength(0);
    expect(open$.value).toBe(true);
    expect(onDidDismiss).toHaveBeenCalledWith({ data: undefined, role: "escape" });
  });

  it("does not reopen while the caller's signal is still true", async () => {
    // The controlled contract's one hazard: a signal left at `true` for a modal
    // that has been dismissed must not spring it back open.
    const open$ = signal(true);
    render(
      <>
        <ModalContainer />
        <Modal isOpen={open$}>
          <p>hello</p>
        </Modal>
      </>,
    );
    await flush();

    await pressKey("Escape");
    await flush();
    await flush();

    expect(modals$.value).toHaveLength(0);
  });

  it("takes a computed, not just a writable signal", async () => {
    const step$ = signal(0);
    const open$ = computed(() => step$.value === 2);

    render(
      <>
        <ModalContainer />
        <Modal isOpen={open$}>
          <p data-testid="body">step two</p>
        </Modal>
      </>,
    );
    await flush();
    expect(modals$.value).toHaveLength(0);

    await act(async () => {
      step$.value = 2;
    });
    await flush();
    expect(document.querySelector('[data-testid="body"]')).not.toBeNull();

    await act(async () => {
      step$.value = 3;
    });
    await flush();
    expect(modals$.value).toHaveLength(0);
  });

  it("leaves the signal alone when canDismiss refuses", async () => {
    const open$ = signal(true);
    render(
      <>
        <ModalContainer />
        <Modal isOpen={open$} canDismiss={false}>
          <p>hello</p>
        </Modal>
      </>,
    );
    await flush();

    await pressKey("Escape");

    expect(open$.value).toBe(true);
    expect(modals$.value).toHaveLength(1);
  });

  it("passes its options through to the modal", async () => {
    const open$ = signal(true);
    const onDidPresent = vi.fn();
    render(
      <>
        <ModalContainer />
        <Modal
          isOpen={open$}
          modalClass="my-modal"
          backdropDismiss={false}
          onDidPresent={onDidPresent}
        >
          <p>hello</p>
        </Modal>
      </>,
    );
    await flush();

    expect(document.querySelector(".psm-wrapper")?.classList.contains("my-modal")).toBe(true);
    expect(onDidPresent).toHaveBeenCalledTimes(1);

    const backdrop = modalRoots()[0]?.querySelector(".psm-backdrop");
    if (backdrop) await click(backdrop);
    expect(modals$.value).toHaveLength(1);
  });

  it("takes its modal with it when it unmounts", async () => {
    const open$ = signal(true);
    const { unmount } = render(
      <>
        <ModalContainer />
        <Modal isOpen={open$}>
          <p>hello</p>
        </Modal>
      </>,
    );
    await flush();
    expect(modals$.value).toHaveLength(1);

    unmount();
    await flush();

    expect(modals$.value).toHaveLength(0);
  });

  it("does not open a second modal when the signal is set to true twice", async () => {
    const open$ = signal(false);
    render(
      <>
        <ModalContainer />
        <Modal isOpen={open$}>
          <p>hello</p>
        </Modal>
      </>,
    );

    await setOpen(open$, true);
    await act(async () => {
      open$.value = true;
    });
    await flush();

    expect(modals$.value).toHaveLength(1);
  });

  it("can be reopened after closing", async () => {
    const open$ = signal(false);
    render(
      <>
        <ModalContainer />
        <Modal isOpen={open$}>
          <p data-testid="body">again</p>
        </Modal>
      </>,
    );

    await setOpen(open$, true);
    await setOpen(open$, false);
    await setOpen(open$, true);

    expect(modals$.value).toHaveLength(1);
    expect(document.querySelector('[data-testid="body"]')).not.toBeNull();
  });

  it("shares one stack with imperative modals", async () => {
    const { createModal } = await import("../src");
    const open$ = signal(true);
    render(
      <>
        <ModalContainer />
        <Modal isOpen={open$}>
          <p>declarative</p>
        </Modal>
      </>,
    );
    await flush();

    createModal(<p>imperative</p>);
    await flush();

    expect(modalRoots().map((root) => root.textContent)).toEqual(["declarative", "imperative"]);
  });
});
