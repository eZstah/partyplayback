export function bindFullscreenControls({ shell, document, setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout }) {
  let eligible = false, load = null, timer = null;
  let hovering = false, pressed = false, keyboard = false;
  const listeners = [];
  const active = () => document.fullscreenElement === shell;
  const inControls = target => !!target?.closest?.(".room-nav,.player-bottom");
  function show() { shell.dataset.controlsHidden = "false"; }
  function cancel() { clearTimeout(timer); timer = null; }
  function schedule() {
    cancel();
    if (!active() || !eligible || hovering || pressed || (keyboard && inControls(document.activeElement))) return;
    timer = setTimeout(() => {
      timer = null;
      // The cross-origin iframe cannot forward keys to our fullscreen controls.
      if (document.activeElement?.tagName === "IFRAME" && shell.contains(document.activeElement)) {
        shell.focus({ preventScroll: true });
        cancel();
      }
      shell.dataset.controlsHidden = "true";
    }, 3000);
  }
  function wake() { show(); schedule(); }
  function listen(target, type, callback) {
    target.addEventListener(type, callback);
    listeners.push(() => target.removeEventListener(type, callback));
  }
  listen(document, "fullscreenchange", () => { hovering = pressed = keyboard = false; wake(); });
  listen(shell, "pointermove", event => { if (event.buttons === 0) pressed = false; hovering = inControls(event.target); wake(); });
  listen(shell, "pointerdown", event => {
    keyboard = false;
    pressed = true;
    // A touch that wakes the UI must release here even after its surface fades.
    if (event.target?.classList?.contains("fullscreen-wake")) {
      try { shell.setPointerCapture(event.pointerId); } catch {}
    }
    wake();
  });
  for (const event of ["pointerup", "pointercancel"]) listen(document, event, () => { pressed = false; if (active()) wake(); });
  for (const controls of shell.querySelectorAll(".room-nav,.player-bottom")) {
    listen(controls, "pointerenter", () => { hovering = true; wake(); });
    listen(controls, "pointerleave", () => { hovering = false; wake(); });
  }
  listen(document, "keydown", event => {
    if (!active()) return;
    if (event.key === "Tab") keyboard = true;
    wake();
  });
  listen(shell, "focusin", () => { if (active()) wake(); });
  listen(shell, "focusout", () => { if (active()) wake(); });
  show();
  return {
    update(canHide, playbackId) {
      if (canHide === eligible && playbackId === load) return;
      eligible = canHide;
      load = playbackId;
      wake();
    },
    destroy() { cancel(); show(); for (const remove of listeners) remove(); },
  };
}
