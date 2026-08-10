import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { ModalHandle } from "./types";

/**
 * Carries the handle for the modal a component is rendered inside. Kept in its
 * own module so `useModal` can be imported without dragging the container —
 * and its dependency on the animation engine — along with it.
 */
export const ModalContext = createContext<ModalHandle<any> | null>(null);

/**
 * The modal the calling component lives in: its id, how to close it with a
 * result, and — for a sheet — where it currently sits.
 *
 * Throws outside a modal, because the alternative is a `close()` that silently
 * does nothing.
 */
export const useModal = <T = unknown>(): ModalHandle<T> => {
  const handle = useContext(ModalContext);
  if (!handle) {
    throw new Error(
      "[preact-signal-modal] `useModal()` was called outside a modal. It only works inside content passed to `createModal()` or `<Modal>`.",
    );
  }
  return handle as ModalHandle<T>;
};
