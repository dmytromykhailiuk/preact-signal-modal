/**
 * Where modals are rendered. Mount `<ModalContainer/>` once, near the root of
 * the app, and both `createModal()` and `<Modal>` have somewhere to put their
 * content.
 *
 * Every component here mounts once and never re-renders: the stack is drawn
 * with `<For>`, visibility with `<Show>`, and the whole present/dismiss
 * lifecycle happens in effects against real DOM nodes. Nothing reads a
 * `.value` while producing JSX.
 */

import { signal, useComputed, useSignal } from "@preact/signals";
import { For, Show } from "@preact/signals/utils";
import { useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { ModalContext } from "./context";
import { getNextBreakpoint, resolveGestureBreakpoint } from "./core/breakpoints";
import { type SheetGesture, createSheetGesture } from "./core/gesture";
import { useDestroy } from "./core/use-destroy";
import { type ModalInstance, modals$ } from "./store";
import type { ModalHandle, ModalStyle } from "./types";

/** Only the first container mounted is the real one; later ones stay empty. */
const containerClaimed$ = signal(false);

const hyphenate = (property: string): string =>
  property.startsWith("--") ? property : property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const toStyleString = (style: ModalStyle | undefined): string => {
  if (!style) return "";
  if (typeof style === "string") return style.trim().endsWith(";") ? style : `${style};`;
  return Object.entries(style)
    .map(([property, value]) => `${hyphenate(property)}: ${value};`)
    .join(" ");
};

interface ModalHostProps {
  modal: ModalInstance<any>;
  index: number;
}

const ModalHost = ({ modal, index }: ModalHostProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const options = modal.options;
  const breakpoints = options.breakpoints;
  const isSheet = breakpoints !== undefined;

  // `useLayoutEffect`, not `useEffect`, and this is load-bearing. A regular
  // effect runs *after* the browser has painted, so the modal would be painted
  // once sitting at its resting CSS position — centred, opaque, backdrop at
  // full strength — and only then snap back to the animation's first keyframe
  // to slide in. That one stale frame is a visible flash. Running before paint
  // means the first thing drawn is already frame zero of the entrance.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    modal.attach(root);

    let gesture: SheetGesture | undefined;
    if (isSheet && breakpoints) {
      const wrapper = root.querySelector<HTMLElement>(".psm-wrapper");
      if (wrapper) {
        gesture = createSheetGesture({
          root,
          wrapper,
          backdrop: root.querySelector<HTMLElement>(".psm-backdrop"),
          content: root.querySelector<HTMLElement>(".psm-content"),
          handle: root.querySelector<HTMLElement>(".psm-handle"),
          backdropBreakpoint: options.backdropBreakpoint,
          expandToScroll: options.expandToScroll,
          maxBreakpoint: breakpoints[breakpoints.length - 1] ?? 1,
          getBreakpoint: () => modal.breakpoint$.peek() ?? 0,
          onDragEnd: (current, velocity) => {
            // Record where the finger actually left the sheet, so the settle
            // animation starts from there instead of from the last breakpoint.
            modal.breakpoint$.value = current;
            void modal.setBreakpoint(resolveGestureBreakpoint(current, velocity, breakpoints));
          },
          onHandleTap: () => {
            if (options.handleBehavior !== "cycle") return;
            void modal.setBreakpoint(getNextBreakpoint(modal.breakpoint$.peek() ?? 0, breakpoints));
          },
        });
      }
    }

    return () => {
      gesture?.destroy();
      modal.detach();
    };
  }, []);

  const handle = useMemo<ModalHandle<any>>(
    () => ({
      id: modal.id,
      close: modal.close,
      breakpoint$: modal.breakpoint$,
      setBreakpoint: (breakpoint: number) => modal.setBreakpoint(breakpoint),
    }),
    [modal],
  );

  // Derived, then bound straight to the attribute — the host never re-renders
  // for it. `undefined` drops the attribute, which is what a regular modal
  // (no breakpoints, so no `breakpoint$`) always gets.
  const fullscreen$ = useComputed(() => (modal.breakpoint$.value === 1 ? "true" : undefined));

  const onBackdropClick = (event: MouseEvent) => {
    // Only a click on the backdrop itself counts — never one that bubbled up
    // from the modal content.
    if (event.target !== event.currentTarget) return;
    if (!options.backdropDismiss) return;
    void modal.close(undefined, "backdrop");
  };

  const rootClass = `psm-root${isSheet ? " psm-root--sheet" : ""}`;
  const backdropClass = `psm-backdrop${options.showBackdrop ? "" : " psm-backdrop--hidden"}${
    options.backdropClass ? ` ${options.backdropClass}` : ""
  }`;
  const wrapperClass = `psm-wrapper${options.modalClass ? ` ${options.modalClass}` : ""}`;

  return (
    <div
      ref={rootRef}
      class={rootClass}
      style={`--psm-index: ${index};`}
      data-modal-id={modal.id}
      data-state={modal.state$}
      data-fullscreen={fullscreen$}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape is the keyboard
          equivalent and is handled globally; the backdrop is not focusable. */}
      <div
        class={backdropClass}
        style={toStyleString(options.backdropStyle)}
        onClick={onBackdropClick}
      />
      {/* Not a native <dialog>: that can only be opened through showModal(),
          which brings its own top-layer stacking, backdrop and dismissal —
          all of which this package already owns and animates. role="dialog"
          gives the same semantics without fighting the browser for control.
          (This is why a11y/useSemanticElements is off in biome.json.) */}
      <div
        class={wrapperClass}
        style={toStyleString(options.modalStyle)}
        role="dialog"
        aria-modal="true"
        aria-label={options.ariaLabel}
        aria-labelledby={options.ariaLabelledBy}
        aria-describedby={options.ariaDescribedBy}
        tabIndex={-1}
      >
        {isSheet && options.handle ? (
          options.handleBehavior === "cycle" ? (
            <button type="button" class="psm-handle" aria-label="Resize the sheet" />
          ) : (
            <div class="psm-handle" aria-hidden="true" />
          )
        ) : null}
        <div class="psm-content">
          <ModalContext.Provider value={handle}>{modal.content}</ModalContext.Provider>
        </div>
      </div>
    </div>
  );
};

/**
 * Renders every open modal. Mount exactly one — a second container anywhere in
 * the tree renders nothing, so a stray one in a lazily-loaded route cannot
 * duplicate the stack.
 */
export const ModalContainer = () => {
  const isRootContainer$ = useSignal(false);

  useMemo(() => {
    if (!containerClaimed$.peek()) {
      isRootContainer$.value = true;
      containerClaimed$.value = true;
    }
  }, []);

  useDestroy(() => {
    if (isRootContainer$.peek()) containerClaimed$.value = false;
  });

  return (
    <Show when={isRootContainer$}>
      <For each={modals$} getKey={(modal) => modal.id}>
        {(modal, index) => <ModalHost modal={modal} index={index} />}
      </For>
    </Show>
  );
};
