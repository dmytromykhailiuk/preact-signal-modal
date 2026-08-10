import { render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { createModal, useModal } from "../src";
import { modals$ } from "../src/store";
import { click, flush, renderContainer } from "./helpers";

const Confirm = () => {
  const modal = useModal<string>();
  return (
    <>
      <button type="button" data-testid="ok" onClick={() => void modal.close("ok", "confirm")}>
        ok
      </button>
      <button type="button" data-testid="cancel" onClick={() => void modal.close()}>
        cancel
      </button>
      <span data-testid="id">{modal.id}</span>
    </>
  );
};

describe("useModal", () => {
  it("closes its own modal with a result", async () => {
    renderContainer();
    const modal = createModal<string>(<Confirm />);
    await flush();

    const ok = document.querySelector('[data-testid="ok"]');
    if (!ok) throw new Error("content not rendered");
    await click(ok);

    await expect(modal.afterClose).resolves.toEqual({ data: "ok", role: "confirm" });
    expect(modals$.value).toHaveLength(0);
  });

  it("exposes the id of the modal it is rendered in", async () => {
    renderContainer();
    const modal = createModal(<Confirm />);
    await flush();

    expect(document.querySelector('[data-testid="id"]')?.textContent).toBe(modal.id);
  });

  it("reaches the nearest modal when modals are stacked", async () => {
    renderContainer();
    createModal(<Confirm />);
    const top = createModal<string>(<Confirm />);
    await flush();

    const buttons = document.querySelectorAll('[data-testid="ok"]');
    const topButton = buttons[buttons.length - 1];
    if (!topButton) throw new Error("no buttons");
    await click(topButton);

    await expect(top.afterClose).resolves.toEqual({ data: "ok", role: "confirm" });
    expect(modals$.value).toHaveLength(1);
  });

  it("reports undefined breakpoints for a regular modal", async () => {
    renderContainer();
    let seen: number | undefined | "unset" = "unset";

    const Probe = () => {
      const modal = useModal();
      seen = modal.breakpoint$.value;
      return null;
    };

    createModal(<Probe />);
    await flush();

    expect(seen).toBeUndefined();
  });

  it("throws when used outside a modal", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const Orphan = () => {
      useModal();
      return null;
    };

    expect(() => render(<Orphan />)).toThrow(/outside a modal/);
    error.mockRestore();
  });
});
