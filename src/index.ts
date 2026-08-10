/**
 * Signal-driven modals for Preact.
 *
 * Two ways in — `createModal()` when the modal is the result of something that
 * happened, `<Modal isOpen={signal}>` when it belongs in the markup — and one
 * stack behind both. Transitions are the Ionic ones, played through the Web
 * Animations API and swappable for your own.
 *
 * What is deliberately not here: the modal stack itself, the stylesheet source,
 * and the internals of the presets. Everything an app needs to read about the
 * stack goes through `hasModals()` and `getTopModal()`.
 */

/* ---- Container ---- */
export { ModalContainer } from "./container";

/* ---- Declarative ---- */
export { Modal } from "./modal";

/* ---- Imperative ---- */
export {
  closeAllModals,
  closeModal,
  createModal,
  getTopModal,
  hasModals,
  hasModals$,
} from "./store";

/* ---- From inside a modal ---- */
export { useModal } from "./context";

/* ---- Configuration ---- */
export { configureModal, getModalConfig } from "./config";
export { ensureModalStyles } from "./styles";

/* ---- Animation ---- */
export { createAnimation } from "./core/animation";
export {
  iosEnterAnimation,
  iosLeaveAnimation,
  mdEnterAnimation,
  mdLeaveAnimation,
} from "./core/presets";

/* ---- Types ---- */
export type {
  Animation,
  AnimationBuilder,
  AnimationKeyFrame,
  AnimationKeyFrames,
  CanDismiss,
  ModalAnimationOptions,
  ModalConfig,
  ModalDismissal,
  ModalHandle,
  ModalMode,
  ModalOptions,
  ModalProps,
  ModalRef,
  ModalRole,
  ModalState,
  ModalStyle,
  OpenModal,
} from "./types";
