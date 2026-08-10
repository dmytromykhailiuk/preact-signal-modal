/**
 * Breakpoint arithmetic for sheet modals. A breakpoint is the fraction of the
 * viewport the sheet covers: `0` is dismissed, `1` is full screen.
 */

/**
 * Sort, de-duplicate and sanity-check a `breakpoints` array.
 *
 * Throws rather than silently correcting: a sheet whose `initialBreakpoint` is
 * not in its `breakpoints` opens at a position it can never return to, and
 * that is far harder to notice later than an error at the call site.
 */
export const normalizeBreakpoints = (
  breakpoints: number[],
  initialBreakpoint: number | undefined,
): { breakpoints: number[]; initialBreakpoint: number } => {
  if (breakpoints.length === 0) {
    throw new Error("[preact-signal-modal] `breakpoints` must not be empty.");
  }

  for (const breakpoint of breakpoints) {
    if (!Number.isFinite(breakpoint) || breakpoint < 0 || breakpoint > 1) {
      throw new Error(
        `[preact-signal-modal] Breakpoints must be between 0 and 1, received ${breakpoint}.`,
      );
    }
  }

  const sorted = [...new Set(breakpoints)].sort((a, b) => a - b);

  if (initialBreakpoint === undefined) {
    throw new Error(
      "[preact-signal-modal] `initialBreakpoint` is required when `breakpoints` is set.",
    );
  }
  if (!sorted.includes(initialBreakpoint)) {
    throw new Error(
      `[preact-signal-modal] \`initialBreakpoint\` ${initialBreakpoint} is not one of the breakpoints [${sorted.join(", ")}].`,
    );
  }

  return { breakpoints: sorted, initialBreakpoint };
};

/** The breakpoint nearest to `value`. */
export const snapToBreakpoint = (value: number, breakpoints: number[]): number => {
  let closest = breakpoints[0] ?? 0;
  let smallestDelta = Math.abs(value - closest);

  for (const breakpoint of breakpoints) {
    const delta = Math.abs(value - breakpoint);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      closest = breakpoint;
    }
  }

  return closest;
};

/**
 * Where a flick should land: the next breakpoint in the direction of travel
 * when the gesture was fast, the nearest one when it was a slow drag.
 *
 * `velocity` is in fractions of the viewport per millisecond, positive when
 * the sheet is moving up.
 */
export const resolveGestureBreakpoint = (
  value: number,
  velocity: number,
  breakpoints: number[],
): number => {
  const FLICK_THRESHOLD = 0.0008;

  if (Math.abs(velocity) < FLICK_THRESHOLD) {
    return snapToBreakpoint(value, breakpoints);
  }

  return velocity > 0
    ? (breakpoints.find((breakpoint) => breakpoint > value) ??
        (breakpoints[breakpoints.length - 1] as number))
    : ([...breakpoints].reverse().find((breakpoint) => breakpoint < value) ??
        (breakpoints[0] as number));
};

/**
 * The breakpoint a tap on the handle should move to — the next one up,
 * wrapping around to the smallest breakpoint that is not a dismissal.
 */
export const getNextBreakpoint = (current: number, breakpoints: number[]): number => {
  const above = breakpoints.find((breakpoint) => breakpoint > current);
  if (above !== undefined) return above;

  const lowestOpen = breakpoints.find((breakpoint) => breakpoint > 0);
  return lowestOpen ?? current;
};
