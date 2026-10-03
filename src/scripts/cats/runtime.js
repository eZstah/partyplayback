import { rng } from './mind.js';

// One clock and one owner for a character session. Delayed effects advance
// with the simulation, so hiding the page cannot finish an animation offscreen.
export function createRuntime({
  seed = Date.now(),
  now = () => performance.now(),
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
} = {}) {
  let time = 0, paused = false, disposed = false, started = false;
  let frameId = null, last = null, onFrame;
  const delays = new Set(), cleanups = new Set();
  const noop = () => {};

  function schedule() {
    if (started && !paused && !disposed && frameId === null) frameId = requestFrame(frame);
  }

  function frame() {
    frameId = null;
    if (paused || disposed) return;
    const current = now();
    const dt = last === null ? 0 : Math.max(0, Math.min(.05, (current - last) / 1000));
    last = current;
    time += dt;
    // Snapshot deadlines: effects created by another effect run next frame.
    const due = [...delays].filter(effect => effect.at <= time);
    try {
      for (const effect of due) {
        if (paused || disposed) break;
        if (delays.delete(effect)) effect.callback();
      }
      if (!paused && !disposed) onFrame(dt, time);
    } finally {
      schedule();
    }
  }

  function cancelScheduledFrame() {
    if (frameId === null) return;
    const id = frameId;
    frameId = null;
    cancelFrame(id);
  }

  function own(cleanup) {
    if (disposed) { cleanup(); return noop; }
    const entry = { cleanup };
    cleanups.add(entry);
    return () => cleanups.delete(entry);
  }

  return {
    seed,
    random: rng(seed),
    get time() { return time; },
    get paused() { return paused; },
    get disposed() { return disposed; },
    start(callback) {
      if (started || disposed) return;
      if (typeof callback !== 'function') throw new TypeError('A frame callback is required');
      started = true;
      onFrame = callback;
      last = null;
      schedule();
    },
    pause() {
      if (disposed || paused) return;
      paused = true;
      last = null;
      cancelScheduledFrame();
    },
    resume() {
      if (!started || disposed || !paused) return;
      paused = false;
      last = null;
      schedule();
    },
    delay(callback, milliseconds) {
      if (disposed) return noop;
      if (typeof callback !== 'function') throw new TypeError('A delayed callback is required');
      if (!Number.isFinite(milliseconds)) throw new TypeError('A finite delay is required');
      const effect = { callback, at: time + Math.max(0, milliseconds) / 1000 };
      delays.add(effect);
      return () => delays.delete(effect);
    },
    own,
    listen(target, event, callback, options) {
      if (!target || disposed) return noop;
      const guarded = function (...args) { if (!disposed) return callback.apply(this, args); };
      target.addEventListener(event, guarded, options);
      let listening = true;
      const remove = () => {
        if (!listening) return;
        listening = false;
        target.removeEventListener(event, guarded, options);
      };
      const unregister = own(remove);
      return () => { unregister(); remove(); };
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      delays.clear();
      onFrame = null;
      const errors = [], pending = [...cleanups];
      cleanups.clear();
      try { cancelScheduledFrame(); } catch (error) { errors.push(error); }
      for (const { cleanup } of pending) {
        try { cleanup(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Character runtime cleanup failed');
    },
  };
}
