export function bootRoomMascots() {
  const pals = [...document.querySelectorAll(".room-pal")];
  const hovering = matchMedia("(hover: hover) and (pointer: fine)");
  const returns = new Map();
  let pointer = null, frame = 0;

  function showLater(pal) {
    if (!pal.classList.contains("is-shy") || returns.has(pal)) return;
    returns.set(pal, setTimeout(() => {
      returns.delete(pal);
      pal.classList.remove("is-shy");
    }, 450));
  }
  function update() {
    frame = 0;
    // The outer peeker stays still; only its artwork retreats. Its proximity
    // area therefore never moves away and immediately triggers a reappearance.
    const bounds = pals.map(pal => pal.getBoundingClientRect());
    pals.forEach((pal, i) => {
      const rect = bounds[i];
      const margin = pal.classList.contains("is-shy") ? 44 : 22;
      const near = hovering.matches && pointer && rect.width && rect.height &&
        pointer.x >= rect.left - margin && pointer.x <= rect.right + margin &&
        pointer.y >= rect.top - margin && pointer.y <= rect.bottom + margin;
      if (near) {
        clearTimeout(returns.get(pal));
        returns.delete(pal);
        pal.classList.add("is-shy");
      } else showLater(pal);
    });
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  function leave() { pointer = null; schedule(); }
  function move(event) {
    if (event.pointerType !== "mouse" || !hovering.matches) return;
    pointer = { x: event.clientX, y: event.clientY };
    schedule();
  }
  document.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerleave", leave);
  window.addEventListener("blur", leave);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  hovering.addEventListener("change", leave);
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(frame);
    returns.forEach(clearTimeout);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerleave", leave);
    window.removeEventListener("blur", leave);
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    hovering.removeEventListener("change", leave);
  }, { once: true });
}
