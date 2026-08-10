/**
 * A port of the `@ionic/core` Animation builder, trimmed to what modal
 * transitions need and rebuilt on the Web Animations API alone.
 *
 * Two things it keeps from Ionic, because the presets depend on both:
 *
 * 1. **Inherited timing.** A child animation that sets no duration/easing asks
 *    its parent. That is how one `createAnimation().duration(500)` drives the
 *    backdrop and the wrapper together.
 * 2. **The progress API.** `progressStart` / `progressStep` / `progressEnd`
 *    turn an animation into something a finger can scrub, which is what makes
 *    swipe-to-close on a sheet modal feel like the real thing.
 *
 * The one thing it drops is Ionic's CSS-animation fallback for browsers
 * without Web Animations. Instead, when `Element.prototype.animate` is missing
 * — jsdom, SSR — an animation still runs its before/after hooks and finishes
 * synchronously, so the modal lifecycle completes and only the motion is lost.
 */

import type {
  Animation,
  AnimationCallbackOptions,
  AnimationDirection,
  AnimationFill,
  AnimationKeyFrames,
  AnimationLifecycle,
  AnimationPlayOptions,
} from "../types";

interface CallbackEntry {
  c: AnimationLifecycle;
  o?: AnimationCallbackOptions;
}

/**
 * Checked at play time rather than at creation time so a test that installs an
 * `Element.prototype.animate` stub after import is still taken seriously.
 */
const supportsWebAnimations = (): boolean =>
  typeof Element === "function" && typeof Element.prototype.animate === "function";

const setStyleProperty = (el: HTMLElement, property: string, value: string | number): void => {
  el.style.setProperty(property, value === "" ? "" : String(value));
};

const toClassArray = (className: string | string[]): string[] =>
  Array.isArray(className) ? className : [className];

export const createAnimation = (animationId?: string): Animation => {
  let _delay: number | undefined;
  let _duration: number | undefined;
  let _easing: string | undefined;
  let _iterations: number | undefined;
  let _fill: AnimationFill | undefined;
  let _direction: AnimationDirection | undefined;
  let _keyframes: AnimationKeyFrames = [];

  let parentAnimation: Animation | undefined;
  let initialized = false;
  let paused = false;
  let finished = false;
  let willComplete = true;
  let shouldCalculateNumAnimations = true;
  let shouldForceLinearEasing = false;
  let shouldForceSyncPlayback = false;
  let numAnimationsRunning = 0;

  let forceDirectionValue: AnimationDirection | undefined;
  let forceDurationValue: number | undefined;

  let beforeAddClasses: string[] = [];
  let beforeRemoveClasses: string[] = [];
  let beforeStylesValue: Record<string, string | number> = {};
  let afterAddClasses: string[] = [];
  let afterRemoveClasses: string[] = [];
  let afterStylesValue: Record<string, string | number> = {};

  const elements: HTMLElement[] = [];
  const childAnimations: Animation[] = [];
  const webAnimations: globalThis.Animation[] = [];

  const onFinishCallbacks: CallbackEntry[] = [];
  const onFinishOneTimeCallbacks: CallbackEntry[] = [];
  const onStopOneTimeCallbacks: CallbackEntry[] = [];

  const beforeReadFunctions: Array<() => void> = [];
  const beforeWriteFunctions: Array<() => void> = [];
  const afterReadFunctions: Array<() => void> = [];
  const afterWriteFunctions: Array<() => void> = [];

  /* ---- resolved timing: own value, else the parent's, else the default ---- */

  const getDuration = (): number => {
    if (shouldForceSyncPlayback) return 0;
    if (forceDurationValue !== undefined) return forceDurationValue;
    if (_duration !== undefined) return _duration;
    if (parentAnimation) return parentAnimation.getDuration();
    return 0;
  };

  const getEasing = (): string => {
    if (shouldForceLinearEasing) return "linear";
    if (_easing !== undefined) return _easing;
    if (parentAnimation) return parentAnimation.getEasing();
    return "linear";
  };

  const getDelay = (): number => {
    if (_delay !== undefined) return _delay;
    if (parentAnimation) return parentAnimation.getDelay();
    return 0;
  };

  const getFill = (): AnimationFill => {
    if (_fill !== undefined) return _fill;
    if (parentAnimation) return parentAnimation.getFill();
    return "both";
  };

  const getDirection = (): AnimationDirection => {
    if (forceDirectionValue !== undefined) return forceDirectionValue;
    if (_direction !== undefined) return _direction;
    if (parentAnimation) return parentAnimation.getDirection();
    return "normal";
  };

  const getIterations = (): number => {
    if (_iterations !== undefined) return _iterations;
    if (parentAnimation) return parentAnimation.getIterations();
    return 1;
  };

  const getKeyframes = (): AnimationKeyFrames => _keyframes;

  /* ---- hooks ---- */

  const beforeAnimation = (): void => {
    for (const fn of beforeReadFunctions) fn();
    for (const fn of beforeWriteFunctions) fn();
    for (const el of elements) {
      for (const c of beforeAddClasses) el.classList.add(c);
      for (const c of beforeRemoveClasses) el.classList.remove(c);
      for (const property of Object.keys(beforeStylesValue)) {
        setStyleProperty(el, property, beforeStylesValue[property] as string | number);
      }
    }
  };

  const afterAnimation = (): void => {
    for (const fn of afterReadFunctions) fn();
    for (const fn of afterWriteFunctions) fn();

    const currentStep: 0 | 1 = willComplete ? 1 : 0;

    for (const el of elements) {
      for (const c of afterAddClasses) el.classList.add(c);
      for (const c of afterRemoveClasses) el.classList.remove(c);
      for (const property of Object.keys(afterStylesValue)) {
        setStyleProperty(el, property, afterStylesValue[property] as string | number);
      }
    }

    // Undo any coercion before user callbacks run, so they never read a value
    // that only existed for the sake of a gesture.
    forceDurationValue = undefined;
    forceDirectionValue = undefined;

    for (const entry of onFinishCallbacks) entry.c(currentStep, ani);
    for (const entry of onFinishOneTimeCallbacks) entry.c(currentStep, ani);
    onFinishOneTimeCallbacks.length = 0;

    shouldCalculateNumAnimations = true;
    if (willComplete) finished = true;
    willComplete = true;
  };

  const animationFinish = (): void => {
    if (numAnimationsRunning === 0) return;
    numAnimationsRunning--;
    if (numAnimationsRunning === 0) {
      afterAnimation();
      if (parentAnimation) parentAnimation.animationFinish();
    }
  };

  /* ---- Web Animations plumbing ---- */

  const initializeWebAnimation = (): void => {
    for (const el of elements) {
      const animation = el.animate(_keyframes as Keyframe[], {
        id: animationId,
        delay: getDelay(),
        duration: getDuration(),
        easing: getEasing(),
        iterations: getIterations(),
        fill: getFill(),
        direction: getDirection(),
      });
      animation.pause();
      webAnimations.push(animation);
    }
    const first = webAnimations[0];
    if (first) {
      first.onfinish = () => animationFinish();
    }
  };

  const initializeAnimation = (): void => {
    beforeAnimation();
    if (_keyframes.length > 0 && supportsWebAnimations()) {
      initializeWebAnimation();
    }
    initialized = true;
  };

  const setAnimationStep = (step: number): void => {
    const clamped = Math.min(Math.max(step, 0), 0.9999);
    for (const animation of webAnimations) {
      const delay = animation.effect?.getComputedTiming().delay ?? 0;
      animation.currentTime = Number(delay) + getDuration() * clamped;
      animation.pause();
    }
  };

  const updateWebAnimation = (step?: number): void => {
    for (const animation of webAnimations) {
      animation.effect?.updateTiming({
        delay: getDelay(),
        duration: getDuration(),
        easing: getEasing(),
        iterations: getIterations(),
        fill: getFill(),
        direction: getDirection(),
      });
    }
    if (step !== undefined) setAnimationStep(step);
  };

  const update = (deep = false, step?: number): Animation => {
    if (deep) {
      for (const animation of childAnimations) animation.update(deep, step);
    }
    if (supportsWebAnimations()) updateWebAnimation(step);
    return ani;
  };

  const cleanUpElements = (): void => {
    for (const animation of webAnimations) animation.cancel();
    webAnimations.length = 0;
  };

  const resetFlags = (): void => {
    shouldForceLinearEasing = false;
    shouldForceSyncPlayback = false;
    shouldCalculateNumAnimations = true;
    forceDirectionValue = undefined;
    forceDurationValue = undefined;
    numAnimationsRunning = 0;
    finished = false;
    willComplete = true;
    paused = false;
  };

  const clearCallback = (callback: AnimationLifecycle, entries: CallbackEntry[]): void => {
    const index = entries.findIndex((entry) => entry.c === callback);
    if (index > -1) entries.splice(index, 1);
  };

  /* ---- public surface ---- */

  const onFinish = (callback: AnimationLifecycle, opts?: AnimationCallbackOptions): Animation => {
    (opts?.oneTimeCallback ? onFinishOneTimeCallbacks : onFinishCallbacks).push({
      c: callback,
      o: opts,
    });
    return ani;
  };

  const onStop = (callback: AnimationLifecycle, opts?: AnimationCallbackOptions): Animation => {
    onStopOneTimeCallbacks.push({ c: callback, o: opts });
    return ani;
  };

  const play = (opts?: AnimationPlayOptions): Promise<void> =>
    new Promise<void>((resolve) => {
      if (opts?.sync) {
        shouldForceSyncPlayback = true;
        onFinish(
          () => {
            shouldForceSyncPlayback = false;
          },
          { oneTimeCallback: true },
        );
      }

      if (!initialized) initializeAnimation();

      if (finished) {
        if (supportsWebAnimations()) {
          setAnimationStep(0);
          updateWebAnimation();
        }
        finished = false;
      }

      if (shouldCalculateNumAnimations) {
        numAnimationsRunning = childAnimations.length + 1;
        shouldCalculateNumAnimations = false;
      }

      // Whichever of the two fires first cancels the other, otherwise a
      // play → stop → play sequence resolves this promise twice.
      const onStopCallback: AnimationLifecycle = () => {
        clearCallback(onFinishCallback, onFinishOneTimeCallbacks);
        resolve();
      };
      const onFinishCallback: AnimationLifecycle = () => {
        clearCallback(onStopCallback, onStopOneTimeCallbacks);
        resolve();
      };
      onFinish(onFinishCallback, { oneTimeCallback: true });
      onStop(onStopCallback, { oneTimeCallback: true });

      for (const animation of childAnimations) animation.play();

      if (supportsWebAnimations()) {
        for (const animation of webAnimations) animation.play();
        if (_keyframes.length === 0 || elements.length === 0) animationFinish();
      } else {
        // No Web Animations: the before/after hooks still ran, so the element
        // simply lands on its final styles and the lifecycle carries on.
        animationFinish();
      }

      paused = false;
    });

  const pauseAnimation = (): void => {
    if (!initialized) return;
    for (const animation of webAnimations) animation.pause();
    paused = true;
  };

  const pause = (): Animation => {
    for (const animation of childAnimations) animation.pause();
    pauseAnimation();
    return ani;
  };

  const stop = (): void => {
    for (const animation of childAnimations) animation.stop();
    if (initialized) {
      cleanUpElements();
      initialized = false;
    }
    resetFlags();
    for (const entry of onStopOneTimeCallbacks) entry.c(0, ani);
    onStopOneTimeCallbacks.length = 0;
  };

  const destroy = (): Animation => {
    for (const animation of childAnimations) animation.destroy();
    cleanUpElements();
    elements.length = 0;
    childAnimations.length = 0;
    _keyframes.length = 0;
    onFinishCallbacks.length = 0;
    onFinishOneTimeCallbacks.length = 0;
    initialized = false;
    shouldCalculateNumAnimations = true;
    return ani;
  };

  const progressStart = (forceLinearEasing = false, step?: number): Animation => {
    for (const animation of childAnimations) animation.progressStart(forceLinearEasing, step);
    pauseAnimation();
    shouldForceLinearEasing = forceLinearEasing;
    if (!initialized) initializeAnimation();
    update(false, step);
    return ani;
  };

  const progressStep = (step: number): Animation => {
    for (const animation of childAnimations) animation.progressStep(step);
    if (supportsWebAnimations()) setAnimationStep(step);
    return ani;
  };

  const progressEnd = (playTo: 0 | 1 | undefined, step: number, dur?: number): Animation => {
    shouldForceLinearEasing = false;
    for (const animation of childAnimations) animation.progressEnd(playTo, step, dur);
    if (dur !== undefined) forceDurationValue = dur;

    finished = false;
    willComplete = true;

    if (playTo === 0) {
      // Rewind: flip the direction and start from the mirrored position.
      forceDirectionValue = getDirection() === "reverse" ? "normal" : "reverse";
      if (forceDirectionValue === "reverse") willComplete = false;
      if (supportsWebAnimations()) {
        update();
        setAnimationStep(1 - step);
      }
    } else if (playTo === 1 && supportsWebAnimations()) {
      update();
      setAnimationStep(step);
    }

    if (playTo !== undefined && !parentAnimation) {
      void play();
    }
    return ani;
  };

  // Every closure above returns `ani` for chaining, and every one of them runs
  // after this literal exists, so the temporal dead zone is never entered.
  const ani: Animation = {
    id: animationId,
    elements,
    childAnimations,

    addElement(el) {
      if (el != null) {
        if ((el as Element).nodeType === 1) {
          elements.push(el as HTMLElement);
        } else if ((el as NodeList).length !== undefined) {
          const list = el as ArrayLike<Element>;
          for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (item) elements.push(item as HTMLElement);
          }
        }
      }
      return ani;
    },
    addAnimation(animationToAdd) {
      if (animationToAdd != null) {
        const list = Array.isArray(animationToAdd) ? animationToAdd : [animationToAdd];
        for (const animation of list) {
          animation.parent(ani);
          childAnimations.push(animation);
        }
      }
      return ani;
    },
    parent(animation) {
      parentAnimation = animation;
      return ani;
    },

    duration(ms) {
      _duration = ms;
      update(true);
      return ani;
    },
    easing(value) {
      _easing = value;
      update(true);
      return ani;
    },
    delay(ms) {
      _delay = ms;
      update(true);
      return ani;
    },
    fill(value) {
      _fill = value;
      update(true);
      return ani;
    },
    direction(value) {
      _direction = value;
      update(true);
      return ani;
    },
    iterations(value) {
      _iterations = value;
      update(true);
      return ani;
    },

    keyframes(keyframeValues) {
      _keyframes = keyframeValues;
      return ani;
    },
    from(property, value) {
      const firstFrame = _keyframes[0];
      if (
        firstFrame !== undefined &&
        (firstFrame.offset === undefined || firstFrame.offset === 0)
      ) {
        firstFrame[property] = value;
      } else {
        _keyframes = [{ offset: 0, [property]: value }, ..._keyframes];
      }
      return ani;
    },
    to(property, value) {
      const lastFrame = _keyframes[_keyframes.length - 1];
      if (lastFrame !== undefined && (lastFrame.offset === undefined || lastFrame.offset === 1)) {
        lastFrame[property] = value;
      } else {
        _keyframes = [..._keyframes, { offset: 1, [property]: value }];
      }
      return ani;
    },
    fromTo(property, fromValue, toValue) {
      return ani.from(property, fromValue).to(property, toValue);
    },

    beforeAddClass(className) {
      beforeAddClasses = [...beforeAddClasses, ...toClassArray(className)];
      return ani;
    },
    beforeRemoveClass(className) {
      beforeRemoveClasses = [...beforeRemoveClasses, ...toClassArray(className)];
      return ani;
    },
    beforeStyles(styles) {
      beforeStylesValue = styles;
      return ani;
    },
    beforeClearStyles(propertyNames) {
      for (const property of propertyNames) beforeStylesValue[property] = "";
      return ani;
    },
    beforeAddRead(readFn) {
      beforeReadFunctions.push(readFn);
      return ani;
    },
    beforeAddWrite(writeFn) {
      beforeWriteFunctions.push(writeFn);
      return ani;
    },

    afterAddClass(className) {
      afterAddClasses = [...afterAddClasses, ...toClassArray(className)];
      return ani;
    },
    afterRemoveClass(className) {
      afterRemoveClasses = [...afterRemoveClasses, ...toClassArray(className)];
      return ani;
    },
    afterStyles(styles) {
      afterStylesValue = styles;
      return ani;
    },
    afterClearStyles(propertyNames) {
      for (const property of propertyNames) afterStylesValue[property] = "";
      return ani;
    },
    afterAddRead(readFn) {
      afterReadFunctions.push(readFn);
      return ani;
    },
    afterAddWrite(writeFn) {
      afterWriteFunctions.push(writeFn);
      return ani;
    },

    play,
    pause,
    stop,
    destroy,
    onFinish,
    isRunning: () => numAnimationsRunning !== 0 && !paused,

    progressStart,
    progressStep,
    progressEnd,

    getDuration,
    getEasing,
    getDelay,
    getFill,
    getDirection,
    getIterations,
    getKeyframes,

    update,
    animationFinish,
  };

  return ani;
};
