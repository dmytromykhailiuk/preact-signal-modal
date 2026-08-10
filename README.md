# @dmytromykhailiuk/preact-signal-modal

Signal-driven modals for Preact: an awaitable `createModal()`, a declarative `<Modal isOpen>`, Ionic-identical transitions on the Web Animations API, sheet modals with breakpoints, a real focus trap — and not one re-render.

> **Full documentation: [Docs](https://dmytromykhailiuk.github.io/preact-signal-modal/)** — every option, every animation hook, with examples.

> **The one rule:** a modal is a value you are waiting for, not a piece of state you are babysitting. `const { data, role } = await modal.afterClose` is the whole API most of the time.

Modals are where component state goes to rot. You add an `isModalOpen` boolean, then a second one for the nested confirmation, then a `pendingDeleteId` to remember what the confirmation was about, then a `useEffect` to lock body scroll, then a `keydown` listener for Escape, then a `ref` to give focus back to the button that opened it. None of that is your feature. All of it re-renders the component that owns it, several levels above the thing that actually changed.

This package moves the whole lot into one signal-backed stack. Modals live outside your component tree, so opening one re-renders nothing; the answer comes back as a promise, so the state that only existed to remember the question can go. Scroll lock, Escape, the focus trap and `inert` on the rest of the page are handled once, for the stack, not once per modal you write.

The transitions are Ionic's, ported keyframe for keyframe: `ios` slides a full viewport up on `cubic-bezier(0.32,0.72,0,1)` over 500ms, `md` fades and rises 40px over 280ms. Swap either for your own with the same `createAnimation()` builder Ionic uses.

## Install

```bash
npm i @dmytromykhailiuk/preact-signal-modal
```

`preact >= 10.25` and `@preact/signals ^2` are peer dependencies. There are no others.

## Quick start

Mount the container once, near the root of your app:

```tsx
import { ModalContainer } from "@dmytromykhailiuk/preact-signal-modal";

const App = () => (
  <>
    <Routes />
    <ModalContainer />
  </>
);
```

Then open a modal from anywhere and wait for the answer:

```tsx
import { createModal, useModal } from "@dmytromykhailiuk/preact-signal-modal";

const Confirm = ({ question }: { question: string }) => {
  const modal = useModal<boolean>();
  return (
    <>
      <p>{question}</p>
      <button type="button" onClick={() => modal.close(true, "confirm")}>Yes</button>
      <button type="button" onClick={() => modal.close(false, "cancel")}>No</button>
    </>
  );
};

const deleteFile = async (id: string) => {
  const modal = createModal<boolean>(<Confirm question="Delete this file?" />);
  const { data, role } = await modal.afterClose;

  if (role === "backdrop" || role === "escape") return; // dismissed, not answered
  if (data) await api.delete(id);
};
```

`afterClose` resolves once the leave animation has finished and the content has been unmounted — the modal is genuinely gone by then, not merely hidden. `role` tells you *how* it closed: `backdrop`, `escape`, `gesture`, `handler`, or any string you pass yourself.

## Two ways to open a modal

Use `createModal()` when the modal is the result of something that happened — a click, a failed request, a route guard. Use `<Modal>` when it belongs in the markup.

`<Modal>` takes exactly one of `trigger` and `isOpen`, because they are two answers to the same question: who owns the open state. Let the component own it and there is nothing to wire up at all:

```tsx
import { Modal } from "@dmytromykhailiuk/preact-signal-modal";

const Settings = () => (
  <>
    <button type="button" id="settings-button">Settings</button>

    <Modal trigger="settings-button" ariaLabel="Settings">
      <SettingsForm />
    </Modal>
  </>
);
```

Or own it yourself, as a signal:

```tsx
const isOpen = useSignal(false);

<Modal isOpen={isOpen} onDidDismiss={() => (isOpen.value = false)} ariaLabel="Settings">
  <SettingsForm />
</Modal>
```

`isOpen` is a signal — a plain boolean would re-render the owning component on every open and close — and a **read-only** one, because the modal does not write to state it does not own. So a `computed`, or a selector from your store, works as well as a `useSignal`. The other half of that bargain is yours: the modal still closes on the backdrop, on Escape and on a swipe, and `onDidDismiss` is where you set your signal back to `false`.

Both routes go through the same stack, so a declarative modal and an imperative one share one stacking order, one scroll lock and one focus trap.

## Refusing to close

A form with unsaved changes should not vanish because someone missed the modal by ten pixels:

```tsx
const draft = signal("");

createModal(<EditNote draft={draft} />, {
  canDismiss: ({ role }) => role === "save" || draft.peek().length === 0,
});
```

`canDismiss` may be async — the modal stays open until it resolves, and stays open for good if it resolves `false`. `close()` returns `Promise<boolean>` so the caller can tell a refusal from a dismissal.

## Animations

Every modal takes an `enterAnimation` and a `leaveAnimation`, each an `AnimationBuilder` handed the modal's root element:

```tsx
import { createAnimation } from "@dmytromykhailiuk/preact-signal-modal";
import type { AnimationBuilder } from "@dmytromykhailiuk/preact-signal-modal";

const zoomEnter: AnimationBuilder = (baseEl) =>
  createAnimation()
    .addElement(baseEl)
    .duration(300)
    .easing("cubic-bezier(0.32,0.72,0,1)")
    .addAnimation([
      createAnimation()
        .addElement(baseEl.querySelector(".psm-backdrop"))
        .fromTo("opacity", 0, "var(--psm-backdrop-opacity, 0.32)"),
      createAnimation()
        .addElement(baseEl.querySelector(".psm-wrapper"))
        .fromTo("transform", "scale(0.8)", "scale(1)")
        .fromTo("opacity", 0, 1),
    ]);
```

Timing set on the parent is inherited by children that do not define their own — that is how one `duration(300)` drives the backdrop and the modal together. Pass `configureModal({ enterAnimation, leaveAnimation })` to change it everywhere at once, `animated: false` to skip motion for one modal, and nothing at all to respect `prefers-reduced-motion` — that is already handled.

## Styling

The stylesheet is injected on first use; customisation is CSS custom properties, no `!important` anywhere:

```css
:root {
  --psm-background: #fff;
  --psm-border-radius: 14px;
  --psm-max-width: 32rem;
  --psm-backdrop-opacity: 0.45;
  --psm-z-index: 4000;
}
```

Under a strict CSP, or when server-rendering, turn injection off and import the identical stylesheet yourself:

```ts
configureModal({ injectStyles: false });
import "@dmytromykhailiuk/preact-signal-modal/styles.css";
```

## Sheet modals

Give a modal `breakpoints` and it becomes a sheet you can drag, flick and swipe away:

```tsx
createModal(<Filters />, {
  breakpoints: [0, 0.25, 0.5, 1],
  initialBreakpoint: 0.25,
  handleBehavior: "cycle",
});
```

A slow drag snaps to the nearest breakpoint, a flick carries on to the next one in that direction, and landing on `0` dismisses with role `gesture`. From inside, `useModal().setBreakpoint(1)` moves it and `breakpoint$` reports where it is.

## And the rest

- **Focus** — the first focusable element is focused on open, Tab is trapped, and focus returns to whatever had it before. Everything outside the modal gets `inert` and `aria-hidden`, worked out by walking up from the modal rather than by assuming it was portalled to `<body>`.
- **Escape and the backdrop** — on by default, `keyboardClose` and `backdropDismiss` turn them off. Escape only ever reaches the topmost modal.
- **Body scroll** — locked while anything is open, reference counted, with scrollbar-width compensation so the page does not jump.
- **`hasModals()`, `getTopModal()`, `hasModals$`** — for driving something else from the stack. The two functions are plain reads that subscribe to nothing, safe in a handler or a guard; `hasModals$` is the signal to derive from. The stack itself is not exported, because reading it in a render body would subscribe the component to every open and close.
- **`closeAllModals()`** — for navigation, where a modal left behind is always a bug.

## TypeScript

`createModal<T>()` types both ends: `close(data)` only accepts a `T`, and `afterClose` resolves to `ModalDismissal<T>`. `useModal<T>()` inside the content agrees with it.

```ts
const modal = createModal<{ id: string }>(<Picker />);
const { data } = await modal.afterClose; // { id: string } | undefined
```

`data` is optional because a modal can always be dismissed without answering — that is the type system telling you to check `role`.

## License

MIT
