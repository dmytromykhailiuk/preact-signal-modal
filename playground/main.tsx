import { type Signal, computed, signal, useComputed, useSignal } from "@preact/signals";
import { For } from "@preact/signals/utils";
import { render } from "preact";
import {
  Modal,
  ModalContainer,
  closeAllModals,
  configureModal,
  createAnimation,
  createModal,
  getTopModal,
  hasModals$,
  useModal,
} from "../src";
import type { AnimationBuilder, ModalMode } from "../src";

/* ---- event log ---- */

const log$ = signal<string[]>([]);
const note = (message: string) => {
  log$.value = [`${new Date().toISOString().slice(11, 23)}  ${message}`, ...log$.value].slice(
    0,
    60,
  );
};

/* ---- platform switch ---- */

const mode$ = signal<ModalMode>("md");
const isIos$ = computed(() => (mode$.value === "ios" ? "true" : "false"));
const isMd$ = computed(() => (mode$.value === "md" ? "true" : "false"));

const setMode = (mode: ModalMode) => {
  mode$.value = mode;
  configureModal({ mode });
  note(`mode → ${mode}`);
};
setMode("md");

/* ---- modal contents ---- */

const Confirm = ({ question }: { question: string }) => {
  const modal = useModal<boolean>();
  return (
    <div>
      <h3 style="margin-top:0">{question}</h3>
      <div class="row">
        <button type="button" onClick={() => void modal.close(true, "confirm")}>
          Yes
        </button>
        <button type="button" onClick={() => void modal.close(false, "cancel")}>
          No
        </button>
      </div>
    </div>
  );
};

const NestedDemo = () => {
  const modal = useModal();
  return (
    <div>
      <h3 style="margin-top:0">First modal</h3>
      <p>Open another one on top, then press Escape and watch only the top one close.</p>
      <div class="row">
        <button
          type="button"
          onClick={() => {
            void createModal(<Confirm question="Second modal — sure?" />);
          }}
        >
          Open another
        </button>
        <button type="button" onClick={() => void modal.close()}>
          Close
        </button>
      </div>
    </div>
  );
};

/** A form that refuses to be dismissed once it has unsaved changes. */
const DirtyForm = ({ draft$ }: { draft$: Signal<string> }) => {
  const modal = useModal<string>();
  const hint$ = useComputed(() =>
    draft$.value ? "Unsaved — Escape and the backdrop are blocked" : "Clean — dismiss freely",
  );

  return (
    <div>
      <h3 style="margin-top:0">Edit note</h3>
      <input
        style="width:100%;padding:.5rem;font:inherit"
        placeholder="Type something…"
        onInput={(event) => {
          draft$.value = (event.currentTarget as HTMLInputElement).value;
        }}
      />
      <p style="color:#6b7181;font-size:.85rem">{hint$}</p>
      <div class="row">
        <button type="button" onClick={() => void modal.close(draft$.peek(), "save")}>
          Save
        </button>
      </div>
    </div>
  );
};

const openDirtyForm = () => {
  // The draft lives outside the modal so the guard and the form read the very
  // same signal — no polling, no duplicated state.
  const draft$ = signal("");

  const modal = createModal<string>(<DirtyForm draft$={draft$} />, {
    canDismiss: ({ role }) => role === "save" || draft$.peek().length === 0,
    ariaLabel: "Edit note",
  });

  void modal.afterClose.then((dismissal) => {
    note(`dirty form closed — role: ${dismissal.role}, data: ${JSON.stringify(dismissal.data)}`);
  });
};

const SheetContent = () => {
  const modal = useModal();
  const breakpoint$ = useComputed(() => `breakpoint: ${modal.breakpoint$.value}`);

  return (
    <div>
      <h3 style="margin-top:0">Sheet modal</h3>
      <p style="color:#6b7181">{breakpoint$}</p>
      <p class="filler">
        Drag the handle, or the sheet itself, to move between breakpoints. Flick it downwards to
        dismiss. The content scrolls once the sheet is at its tallest.
      </p>
      <div class="row">
        <button type="button" onClick={() => void modal.setBreakpoint(1)}>
          Full screen
        </button>
        <button type="button" onClick={() => void modal.setBreakpoint(0.25)}>
          Peek
        </button>
        <button type="button" onClick={() => void modal.close()}>
          Close
        </button>
      </div>
      <p class="filler">{"Scroll me. ".repeat(120)}</p>
    </div>
  );
};

/* ---- a custom animation ---- */

const flipEnter: AnimationBuilder = (baseEl) => {
  const backdrop = createAnimation()
    .addElement(baseEl.querySelector(".psm-backdrop"))
    .fromTo("opacity", 0, "var(--psm-backdrop-opacity, 0.32)");
  const wrapper = createAnimation()
    .addElement(baseEl.querySelector(".psm-wrapper"))
    .keyframes([
      {
        offset: 0,
        opacity: 0,
        transform: "perspective(600px) rotateX(-70deg) scale(0.9)",
      },
      {
        offset: 1,
        opacity: 1,
        transform: "perspective(600px) rotateX(0deg) scale(1)",
      },
    ]);

  return createAnimation()
    .addElement(baseEl)
    .duration(420)
    .easing("cubic-bezier(0.2, 0.9, 0.2, 1)")
    .addAnimation([backdrop, wrapper]);
};

const flipLeave: AnimationBuilder = (baseEl) => {
  const backdrop = createAnimation()
    .addElement(baseEl.querySelector(".psm-backdrop"))
    .fromTo("opacity", "var(--psm-backdrop-opacity, 0.32)", 0);
  const wrapper = createAnimation()
    .addElement(baseEl.querySelector(".psm-wrapper"))
    .keyframes([
      {
        offset: 0,
        opacity: 1,
        transform: "perspective(600px) rotateX(0deg) scale(1)",
      },
      {
        offset: 1,
        opacity: 0,
        transform: "perspective(600px) rotateX(70deg) scale(0.9)",
      },
    ]);

  return createAnimation()
    .addElement(baseEl)
    .duration(280)
    .easing("cubic-bezier(0.4, 0, 1, 1)")
    .addAnimation([backdrop, wrapper]);
};

/* ---- the page ---- */

/** Closing from inside works the same whoever owns the open state. */
const CloseButton = () => {
  const modal = useModal();
  return (
    <button type="button" onClick={() => void modal.close()}>
      Close
    </button>
  );
};

const App = () => {
  const controlled$ = useSignal(false);
  // The signal is the reactive one, so this stays live while the component
  // itself never re-renders. `hasModals()` and `getTopModal()` are plain reads
  // for handlers — see the "Close the top one" button below.
  const stack$ = useComputed(() => (hasModals$.value ? "a modal is open" : "nothing open"));

  return (
    <div>
      <h1>preact-signal-modal</h1>
      <p class="lede">
        Every button below opens a real modal. Nothing on this page re-renders when they do.
      </p>

      <h2>Platform</h2>
      <div class="row">
        <button type="button" aria-pressed={isIos$} onClick={() => setMode("ios")}>
          ios
        </button>
        <button type="button" aria-pressed={isMd$} onClick={() => setMode("md")}>
          md
        </button>
        <span style="align-self:center;color:#6b7181">{stack$}</span>
      </div>

      <h2>Imperative</h2>
      <div class="row">
        <button
          type="button"
          onClick={() => {
            const modal = createModal<boolean>(<Confirm question="Delete this file?" />, {
              ariaLabel: "Delete file",
            });
            void modal.afterClose.then((dismissal) =>
              note(`confirm closed — role: ${dismissal.role}, data: ${dismissal.data}`),
            );
          }}
        >
          Confirm dialog
        </button>
        <button type="button" onClick={() => void createModal(<NestedDemo />)}>
          Nested modals
        </button>
        <button type="button" onClick={openDirtyForm}>
          canDismiss guard
        </button>
        <button
          type="button"
          onClick={() =>
            void createModal(<Confirm question="No backdrop, no scroll lock" />, {
              showBackdrop: false,
              scrollLock: false,
            })
          }
        >
          No backdrop
        </button>
        <button
          type="button"
          onClick={() =>
            void createModal(<Confirm question="Custom animation" />, {
              enterAnimation: flipEnter,
              leaveAnimation: flipLeave,
            })
          }
        >
          Custom animation
        </button>
      </div>

      <h2>Sheet</h2>
      <div class="row">
        <button
          type="button"
          onClick={() =>
            void createModal(<SheetContent />, {
              breakpoints: [0, 0.25, 0.5, 1],
              initialBreakpoint: 0.25,
              handleBehavior: "cycle",
              expandToScroll: false,
              ariaLabel: "Sheet",
            })
          }
        >
          Sheet with breakpoints
        </button>
        <button
          type="button"
          onClick={() =>
            void createModal(<SheetContent />, {
              breakpoints: [0, 0.75],
              initialBreakpoint: 0.75,
              backdropBreakpoint: 0.5,
            })
          }
        >
          Backdrop after 0.5
        </button>
      </div>

      <h2>Declarative</h2>
      <div class="row">
        <button type="button" id="open-declarative">
          Open via trigger
        </button>
        <button type="button" onClick={() => (controlled$.value = true)}>
          Open via signal
        </button>
        <button
          type="button"
          onClick={() => {
            const top = getTopModal();
            note(top ? `closing the top modal (${top.id})` : "nothing to close");
            void top?.close(undefined, "from-the-top");
          }}
        >
          Close the top one
        </button>
        <button type="button" onClick={() => void closeAllModals("navigation")}>
          Close everything
        </button>
      </div>

      {/* The component owns the state: the trigger opens it, anything closes
          it, and there is nothing to keep in step. */}
      <Modal
        trigger="open-declarative"
        ariaLabel="Trigger modal"
        onDidPresent={() => note("trigger modal presented")}
        onDidDismiss={(dismissal) => note(`trigger modal dismissed — role: ${dismissal.role}`)}
      >
        <h3 style="margin-top:0">Opened by a trigger</h3>
        <p>
          No signal anywhere. <code>trigger</code> names the id of the button, and the backdrop,
          Escape or the button below close it again.
        </p>
        <CloseButton />
      </Modal>

      {/* We own the state, so the signal is ours to reset — the modal never
          writes to it, it just tells us it closed. */}
      <Modal
        isOpen={controlled$}
        ariaLabel="Controlled modal"
        onDidDismiss={(dismissal) => {
          controlled$.value = false;
          note(`controlled modal dismissed — role: ${dismissal.role}`);
        }}
      >
        <h3 style="margin-top:0">Driven by a signal</h3>
        <p>
          Read-only from the modal's side. When it closes by any other route,{" "}
          <code>onDidDismiss</code> fires and we set the signal back to <code>false</code>.
        </p>
        <CloseButton />
      </Modal>

      <h2>Log</h2>
      <pre>
        <For each={log$} fallback={<div>nothing yet</div>}>
          {(line) => <div>{line}</div>}
        </For>
      </pre>

      <p class="filler">{"Scroll me to check the body lock. ".repeat(80)}</p>

      <ModalContainer />
    </div>
  );
};

const root = document.getElementById("app");
if (root) render(<App />, root);
