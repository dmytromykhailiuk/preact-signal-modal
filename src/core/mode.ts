import type { ModalMode } from "../types";

/**
 * Which platform look to use, decided the way Ionic decides it: iOS and
 * iPadOS get the sliding sheet, everything else gets Material's fade-and-rise.
 *
 * iPadOS 13+ reports itself as a Mac, so the touch-point count is the only
 * thing that separates an iPad from a desktop Safari.
 */
export const detectMode = (): ModalMode => {
  if (typeof navigator === "undefined") return "md";

  const ua = navigator.userAgent ?? "";
  const isIphone = /iPhone|iPod/.test(ua);
  const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);

  return isIphone || isIpad ? "ios" : "md";
};

/** Whether the user asked the OS to keep motion to a minimum. */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};
