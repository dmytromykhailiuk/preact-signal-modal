import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { ModalContainer, createModal } from "../src";
import { flush, modalRoots, renderContainer } from "./helpers";

describe("<ModalContainer>", () => {
  it("renders modals created after it mounted", async () => {
    renderContainer();
    createModal(<p>later</p>);
    await flush();

    expect(modalRoots()).toHaveLength(1);
  });

  it("renders modals that were created before it mounted", async () => {
    createModal(<p>earlier</p>);
    renderContainer();
    await flush();

    expect(modalRoots()).toHaveLength(1);
    expect(modalRoots()[0]?.textContent).toBe("earlier");
  });

  it("only the first container renders — a second one stays empty", async () => {
    render(
      <>
        <ModalContainer />
        <ModalContainer />
      </>,
    );
    createModal(<p>once</p>);
    await flush();

    expect(modalRoots()).toHaveLength(1);
  });

  it("hands the role over when the first container unmounts", async () => {
    const first = renderContainer();
    await flush();
    first.unmount();

    renderContainer();
    createModal(<p>second container</p>);
    await flush();

    expect(modalRoots()).toHaveLength(1);
    expect(modalRoots()[0]?.textContent).toBe("second container");
  });

  it("builds the documented element structure", async () => {
    renderContainer();
    createModal(<p data-testid="body">structure</p>);
    await flush();

    const root = modalRoots()[0];
    if (!root) throw new Error("no modal root");

    expect(root.classList.contains("psm-root")).toBe(true);
    expect(root.getAttribute("data-modal-id")).toMatch(/^psm_/);

    const backdrop = root.querySelector(".psm-backdrop");
    const wrapper = root.querySelector(".psm-wrapper");
    const content = wrapper?.querySelector(".psm-content");

    expect(backdrop).not.toBeNull();
    expect(wrapper?.getAttribute("role")).toBe("dialog");
    expect(wrapper?.getAttribute("aria-modal")).toBe("true");
    expect(content?.querySelector('[data-testid="body"]')).not.toBeNull();
  });

  it("applies class and style options to the right elements", async () => {
    renderContainer();
    createModal(<p>styled</p>, {
      modalClass: "wide",
      backdropClass: "dim",
      modalStyle: { borderRadius: "4px", "--psm-width": "500px" },
      backdropStyle: "opacity: 0.9;",
    });
    await flush();

    const root = modalRoots()[0];
    const wrapper = root?.querySelector<HTMLElement>(".psm-wrapper");
    const backdrop = root?.querySelector<HTMLElement>(".psm-backdrop");

    expect(wrapper?.classList.contains("wide")).toBe(true);
    expect(backdrop?.classList.contains("dim")).toBe(true);
    expect(wrapper?.style.borderRadius).toBe("4px");
    expect(wrapper?.style.getPropertyValue("--psm-width")).toBe("500px");
    expect(backdrop?.style.opacity).toBe("0.9");
  });

  it("leaves nothing behind when it unmounts with modals open", async () => {
    const container = renderContainer();
    createModal(<p>open</p>);
    await flush();
    expect(modalRoots()).toHaveLength(1);

    container.unmount();
    await flush();

    expect(modalRoots()).toHaveLength(0);
    expect(document.body.style.overflow).toBe("");
  });
});
