import { burst, centerOf, hop, lookVector, pointIn, setLook, setMood, wave } from "./mascot-fx.js";

const DOZE_AFTER = 60000;

export function bootRoomMascots() {
  const pals = [...document.querySelectorAll(".room-pal")];
  const hovering = matchMedia("(hover: hover) and (pointer: fine)");
  const returns = new Map();
  let pointer = null, frame = 0, seen = null, dozeTimer = 0, snoreTimer = 0, dozing = false;
  const peek = pal => pal.querySelector(".pal-peek");
  const mascotOf = pal => pal.querySelector(".mascot");
  const [playerPal, playlistPal] = [document.querySelector(".player-pal"), document.querySelector(".playlist-pal")];

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
      const active = hovering.matches && pointer && rect.width && rect.height;
      const near = active &&
        pointer.x >= rect.left - margin && pointer.x <= rect.right + margin &&
        pointer.y >= rect.top - margin && pointer.y <= rect.bottom + margin;
      if (near) {
        clearTimeout(returns.get(pal));
        returns.delete(pal);
        pal.classList.add("is-shy");
      } else showLater(pal);
      // Curious from a distance, shy up close.
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const curious = active && !near && !dozing && Math.hypot(pointer.x - center.x, pointer.y - center.y) < 300;
      setLook(mascotOf(pal), curious ? lookVector(center, pointer, { maxX: 3.5, maxY: 3, reach: 160 }) : null);
    });
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  function leave() { pointer = null; schedule(); }
  function move(event) {
    if (event.pointerType !== "mouse" || !hovering.matches) return;
    pointer = { x: event.clientX, y: event.clientY };
    schedule();
  }

  // Pals doze off when nothing has played for a while, and perk up when it does.
  function doze() {
    if (dozing || document.body.dataset.playback === "playing") return;
    dozing = true;
    pals.forEach(pal => setMood(mascotOf(pal), "sleepy"));
    snoreTimer = setInterval(() => {
      const visible = pals.filter(p => p.offsetParent && !p.classList.contains("is-shy"));
      const pal = visible[Math.floor(Math.random() * visible.length)];
      if (pal) burst(peek(pal), "z", { ...pointIn(peek(pal), mascotOf(pal), .7, .25), count: 1, color: "#E0D4FF", size: 15, spread: 20, rise: 45, duration: 1800 });
    }, 2600);
    schedule();
  }
  function rouse() {
    clearTimeout(dozeTimer);
    if (dozing) {
      dozing = false;
      clearInterval(snoreTimer);
      pals.forEach(pal => setMood(mascotOf(pal), "surprised", 600));
    }
    if (document.body.dataset.playback !== "playing") dozeTimer = setTimeout(doze, DOZE_AFTER);
  }
  const playbackWatch = new MutationObserver(rouse);
  playbackWatch.observe(document.body, { attributes: true, attributeFilter: ["data-playback"] });
  rouse();

  function cheer(type) {
    if (document.hidden) return;
    rouse();
    if (type === "join") pals.forEach((pal, i) => setTimeout(() => {
      const mascot = mascotOf(pal);
      wave(mascot, 2); hop(mascot, 8); setMood(mascot, "happy", 1600);
      burst(peek(pal), "heart", { ...pointIn(peek(pal), mascot, .5, .2), count: 2, color: "#F4ADC0", size: 15, spread: 40, rise: 55 });
    }, i * 160));
    if (type === "added" && playlistPal) {
      const mascot = mascotOf(playlistPal);
      hop(mascot, 12); setMood(mascot, "surprised", 700);
      burst(peek(playlistPal), "note", { ...pointIn(peek(playlistPal), mascot, .5, .15), count: 2, color: "#F5BE70", size: 17, spread: 50, rise: 60 });
      if (playerPal) { const other = mascotOf(playerPal); setLook(other, lookVector(centerOf(other), centerOf(playlistPal))); setTimeout(schedule, 1500); }
    }
    if (type === "next" && playerPal) {
      const mascot = mascotOf(playerPal);
      hop(mascot, 8); setMood(mascot, "happy", 1200);
      burst(peek(playerPal), "spark", { ...pointIn(peek(playerPal), mascot, .6, .2), count: 2, color: "#AADF97", size: 13, spread: 40, rise: 45 });
    }
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
    clearTimeout(dozeTimer);
    clearInterval(snoreTimer);
    playbackWatch.disconnect();
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerleave", leave);
    window.removeEventListener("blur", leave);
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    hovering.removeEventListener("change", leave);
  }, { once: true });

  return {
    /** Feed room changes in; pals react to people joining and new videos. */
    observe({ users, queue, current }) {
      const next = { users: users ?? seen?.users, queue: queue ?? seen?.queue, current: current !== undefined ? current : seen?.current };
      if (seen) {
        if (next.users > seen.users) cheer("join");
        if (next.queue > seen.queue) cheer("added");
        else if (next.current && seen.current && next.current !== seen.current) cheer("next");
      }
      seen = next;
    },
  };
}
