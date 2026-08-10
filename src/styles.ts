/**
 * The one stylesheet the package needs, and the function that puts it in the
 * page. Kept free of imports on purpose: `tsup.config.ts` reads `MODAL_CSS`
 * from here to emit `dist/styles.css`, so the injected bytes and the shipped
 * file can never drift apart.
 *
 * Nothing here is meant to be overridden with `!important` — every visual
 * decision is a `--psm-*` custom property with an inline fallback, so setting
 * one on `:root`, on an ancestor, or on the modal itself is enough.
 */

export const STYLE_ELEMENT_ID = "psm-styles";

export const MODAL_CSS = `.psm-root {
  position: fixed;
  inset: 0;
  z-index: calc(var(--psm-z-index, 1000) + var(--psm-index, 0));
  display: flex;
  align-items: center;
  justify-content: center;
  /* The layer itself never swallows clicks — only the backdrop and the modal
     do. That is what makes \`showBackdrop: false\` leave the page usable. */
  pointer-events: none;
}

.psm-backdrop {
  position: absolute;
  inset: 0;
  background: var(--psm-backdrop-color, #000);
  opacity: var(--psm-backdrop-opacity, 0.32);
  pointer-events: auto;
  will-change: opacity;
}

.psm-backdrop--hidden {
  display: none;
}

.psm-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  pointer-events: auto;
  outline: none;
  overflow: hidden;
  background: var(--psm-background, #fff);
  color: var(--psm-color, inherit);
  width: var(--psm-width, auto);
  min-width: var(--psm-min-width, 300px);
  max-width: var(--psm-max-width, calc(100vw - 2rem));
  height: var(--psm-height, auto);
  max-height: var(--psm-max-height, calc(100vh - 2rem));
  border-radius: var(--psm-border-radius, 12px);
  box-shadow: var(--psm-box-shadow, 0 10px 40px -8px rgba(0, 0, 0, 0.35));
  will-change: transform, opacity;
}

.psm-content {
  flex: 1 1 auto;
  overflow: auto;
  padding: var(--psm-padding, 1.25rem);
  -webkit-overflow-scrolling: touch;
}

/* ---- sheet modal ---- */

.psm-root--sheet .psm-wrapper {
  position: absolute;
  inset: 0;
  width: auto;
  min-width: 0;
  max-width: none;
  height: auto;
  max-height: none;
  border-radius: var(--psm-sheet-border-radius, 16px) var(--psm-sheet-border-radius, 16px) 0 0;
  transform: translateY(100%);
  transition: border-radius 200ms ease;
}

/* At breakpoint 1 the sheet covers the viewport, so rounded top corners have
   nothing but backdrop behind them and read as a rendering fault. Square them
   off — and leave a token for designs that would rather keep the curve. */
.psm-root--sheet[data-fullscreen="true"] .psm-wrapper {
  border-radius: var(--psm-sheet-expanded-border-radius, 0);
}

.psm-root--sheet .psm-content {
  padding: var(--psm-sheet-padding, 0 1.25rem 1.25rem);
}

.psm-handle {
  flex: none;
  align-self: center;
  width: 36px;
  height: 5px;
  margin: 8px 0 4px;
  border: none;
  padding: 0;
  border-radius: 8px;
  background: var(--psm-handle-color, rgba(0, 0, 0, 0.24));
  cursor: grab;
  touch-action: none;
}

.psm-handle:active {
  cursor: grabbing;
}

/* A finger owns the sheet outright — nothing may lag behind it. */
.psm-root--dragging .psm-wrapper {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .psm-root--sheet .psm-wrapper {
    transition: none;
  }
}
`;

/**
 * Put the stylesheet in `<head>`, once per document. A no-op on the server and
 * whenever the element is already there, so calling it on every present is
 * fine.
 */
export const ensureModalStyles = (): void => {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = MODAL_CSS;
  document.head.appendChild(style);
};
