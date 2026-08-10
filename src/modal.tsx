/**
 * `<Modal>` — the declarative half of the package.
 *
 * The component renders nothing. It is a bridge: an open/closed state on one
 * side, the modal stack on the other. Content still goes through
 * `createModal`, so a declarative modal and an imperative one share one
 * stacking order, one scroll lock and one focus trap.
 *
 * There are two ways to drive it, and you pick exactly one:
 *
 * - **`trigger`** — the component owns the state. An element's click opens the
 *   modal, everything else closes it, and there is nothing to keep in step.
 * - **`isOpen`** — you own the state, as a read-only signal. The modal reads
 *   it and never writes to it; when it closes by any other route it tells you
 *   through `onDidDismiss`, and setting your own signal back to `false` is
 *   your side of the bargain.
 *
 * Accepting both would mean two owners for one boolean, which is why the props
 * are a union rather than two optionals.
 */

import { useSignal, useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { bindTrigger } from "./core/trigger";
import { useDestroy } from "./core/use-destroy";
import { createModal } from "./store";
import type { ModalDismissal, ModalProps, ModalRef } from "./types";

export function Modal<T = unknown>(props: ModalProps<T>) {
  const { isOpen, trigger, children, ...options } = props;

  // `trigger` mode keeps its own state; `isOpen` mode reads yours. Either way
  // the rest of the component works against one signal.
  const ownState$ = useSignal(false);
  const isControlled = isOpen !== undefined;
  const open$ = isOpen ?? ownState$;

  const openModal = useRef<ModalRef<T> | null>(null);

  useSignalEffect(() => {
    if (open$.value) {
      if (openModal.current) return;

      openModal.current = createModal<T>(children, {
        ...options,
        onDidDismiss: (dismissal: ModalDismissal<T>) => {
          openModal.current = null;
          // Ours to reset, so that the next trigger click opens a fresh modal.
          // A caller's signal is not ours to touch — `onDidDismiss` is how they
          // hear about it.
          if (!isControlled) ownState$.value = false;
          options.onDidDismiss?.(dismissal);
        },
      });
      return;
    }

    const ref = openModal.current;
    if (!ref) return;
    openModal.current = null;
    void ref.close(undefined, "handler");
  });

  useEffect(() => {
    if (!trigger) return;
    return bindTrigger(trigger, () => {
      ownState$.value = true;
    });
  }, [trigger]);

  // A `<Modal>` that unmounts takes its modal with it — leaving an orphan on
  // screen with no way to reach it would be worse.
  useDestroy(() => {
    const ref = openModal.current;
    openModal.current = null;
    void ref?.close(undefined, "handler");
  });

  return null;
}
