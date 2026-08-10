import { useEffect, useRef } from "preact/hooks";

/**
 * Runs `fn` once, when the component unmounts. The `fn` from the most recent
 * render is the one that runs, so an inline closure never goes stale.
 *
 * A local copy of the hook from `@dmytromykhailiuk/preact-signal-utils` —
 * eight lines are not worth a peer dependency on the whole toolkit.
 */
export const useDestroy = (fn: () => void): void => {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => () => fnRef.current(), []);
};
