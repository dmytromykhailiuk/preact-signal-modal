import { type RenderResult, act, render } from "@testing-library/preact";
import { ModalContainer } from "../src/container";

/**
 * Mount the container every modal needs. Tests that skip this are testing what
 * happens without one, which is a legitimate thing to test.
 */
export const renderContainer = (): RenderResult => render(<ModalContainer />);

/**
 * Let queued timers and promises run. The Web Animations stub finishes on the
 * next macrotask, and a present or dismiss chains a couple of continuations
 * after that, so a single round is rarely enough.
 */
export const flush = async (rounds = 3): Promise<void> => {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
};

/** The `.psm-root` elements currently in the document, bottom of the stack first. */
export const modalRoots = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(".psm-root"));

export const modalWrappers = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(".psm-wrapper"));

/** Click an element the way a user would, inside `act`. */
export const click = async (el: Element): Promise<void> => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
};

/** Press a key on `document`. */
export const pressKey = async (key: string, init: KeyboardEventInit = {}): Promise<void> => {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
  await flush();
};

/** Dispatch a pointer sequence on `el`, in viewport coordinates. */
export const drag = async (
  el: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { steps?: number; duration?: number } = {},
): Promise<void> => {
  const steps = options.steps ?? 4;
  const duration = options.duration ?? 100;

  const pointer = (type: string, x: number, y: number, timeStamp: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      isPrimary: { value: true },
      timeStamp: { value: timeStamp },
    });
    return event;
  };

  await act(async () => {
    el.dispatchEvent(pointer("pointerdown", from.x, from.y, 0));
    for (let i = 1; i <= steps; i++) {
      const ratio = i / steps;
      window.dispatchEvent(
        pointer(
          "pointermove",
          from.x + (to.x - from.x) * ratio,
          from.y + (to.y - from.y) * ratio,
          (duration / steps) * i,
        ),
      );
    }
    window.dispatchEvent(pointer("pointerup", to.x, to.y, duration));
  });
  await flush();
};
