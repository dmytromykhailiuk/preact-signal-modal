/**
 * The `trigger` prop: name the id of an element and clicking it opens the
 * modal, no handler to wire up. Straight out of `<ion-modal trigger="…">`.
 */

export const bindTrigger = (id: string, onTrigger: () => void): (() => void) => {
  if (typeof document === "undefined") return () => {};

  const el = document.getElementById(id);
  if (!el) {
    // The element has to exist by the time the modal mounts. Saying so beats
    // a trigger that quietly never fires.
    console.warn(
      `[preact-signal-modal] No element with id "${id}" was found for \`trigger\`. The modal will only open programmatically.`,
    );
    return () => {};
  }

  el.addEventListener("click", onTrigger);
  return () => el.removeEventListener("click", onTrigger);
};
