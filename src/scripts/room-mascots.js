import { burst, centerOf, hop, lookVector, pickLine, pointIn, reducedMotion, setLook, setMood, wave } from "./mascot-fx.js";
import * as moves from "./mascot-moves.js";

const DOZE_AFTER = 60000;
const QUIET_START = 3000;

// What the friends say in a room. Kept short: bubbles only show where they fit.
export const ROOM_LINES = {
  join: ["Hi, new friend!", "Someone's here!", "More the merrier."],
  added: ["Ooh, good pick.", "Added. Nice.", "That one slaps."],
  play: ["Shh, it's starting!", "Here we go!", "Popcorn ready."],
  pause: ["Snack break?", "Wait, rewind?", "Pause! 6-7."],
  next: ["Next one!", "Ooh, what's this?"],
  empty: ["Paste a link?", "Got a good video?", "I'm bored. 6-7?"],
  wake: ["Oh! Is it on?", "Wasn't sleeping."],
  caught: { mint: "Found me!", pink: "Hey, hi!", purple: "6-7!" },
};
// Surfaces a bubble may never cover.
const KEEP_CLEAR = ".stage,.playlist-panel,.room-nav,.playback-overlay,dialog[open],#toast.show";

export function bootRoomMascots() {
  const hovering = matchMedia("(hover: hover) and (pointer: fine)");
  const pals = [...document.querySelectorAll(".room-pal")].map(el => ({
    el, peek: el.querySelector(".pal-peek"), mascot: el.querySelector(".mascot"),
    kind: el.querySelector(".mascot")?.dataset.kind, shy: el.dataset.shy !== "off", braveUntil: 0, bubble: null, bubbleTimer: 0, last: "",
  }));
  const returns = new Map();
  const bootedAt = performance.now();
  let pointer = null, frame = 0, seen = null, dozeTimer = 0, snoreTimer = 0, idleTimer = 0, dozing = false;
  let mood = document.body.dataset.playback, lastSaid = 0;
  const shown = pal => pal.el.getClientRects().length > 0 && pal.el.getBoundingClientRect().width > 0;
  const byKind = kind => pals.find(p => p.kind === kind && shown(p));

  function showLater(pal) {
    if (!pal.el.classList.contains("is-shy") || returns.has(pal)) return;
    returns.set(pal, setTimeout(() => {
      returns.delete(pal);
      pal.el.classList.remove("is-shy");
    }, 450));
  }
  function update() {
    frame = 0;
    const now = performance.now();
    // The outer peeker stays still; only its artwork retreats. Its proximity
    // area therefore never moves away and immediately triggers a reappearance.
    const bounds = pals.map(pal => pal.el.getBoundingClientRect());
    pals.forEach((pal, i) => {
      const rect = bounds[i];
      const margin = pal.el.classList.contains("is-shy") ? 44 : 22;
      const active = hovering.matches && pointer && rect.width && rect.height;
      const near = active && pal.shy && pal.braveUntil < now &&
        pointer.x >= rect.left - margin && pointer.x <= rect.right + margin &&
        pointer.y >= rect.top - margin && pointer.y <= rect.bottom + margin;
      if (near) {
        clearTimeout(returns.get(pal));
        returns.delete(pal);
        pal.el.classList.add("is-shy");
        hideBubble(pal);
      } else showLater(pal);
      // Curious from a distance, shy up close.
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const curious = active && !near && !dozing && Math.hypot(pointer.x - center.x, pointer.y - center.y) < 300;
      setLook(pal.mascot, curious ? lookVector(center, pointer, { maxX: 3.5, maxY: 3, reach: 160 }) : null);
    });
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  function leave() { pointer = null; schedule(); }
  function move(event) {
    if (event.pointerType !== "mouse" || !hovering.matches) return;
    pointer = { x: event.clientX, y: event.clientY };
    schedule();
  }

  // Speech bubbles appear only where they cover nothing.
  function hideBubble(pal) {
    clearTimeout(pal.bubbleTimer);
    pal.bubble?.classList.remove("show");
  }
  function fits(rect) {
    if (rect.left < 8 || rect.top < 8 || rect.right > innerWidth - 8 || rect.bottom > innerHeight - 8) return false;
    return ![...document.querySelectorAll(KEEP_CLEAR)].some(el => {
      const r = el.getBoundingClientRect();
      return r.width && r.height && rect.left < r.right && rect.right > r.left && rect.top < r.bottom && rect.bottom > r.top;
    });
  }
  function say(pal, text, duration = 2600) {
    if (!pal || !shown(pal) || pal.el.classList.contains("is-shy")) return false;
    if (!pal.bubble) {
      pal.bubble = document.createElement("span");
      pal.bubble.className = "pal-bubble";
      pal.el.append(pal.bubble);
    }
    pal.bubble.textContent = text;
    if (!fits(pal.bubble.getBoundingClientRect())) { hideBubble(pal); return false; }
    clearTimeout(pal.bubbleTimer);
    pal.bubble.classList.add("show");
    pal.last = text;
    lastSaid = performance.now();
    pal.bubbleTimer = setTimeout(() => hideBubble(pal), duration);
    const speaker = centerOf(pal.mascot);
    for (const other of pals) if (other !== pal && shown(other)) { setLook(other.mascot, lookVector(centerOf(other.mascot), speaker)); }
    setTimeout(schedule, 1600);
    return true;
  }
  /** The first friend with room for a bubble says one of these lines. */
  function speak(lines, order = ["purple", "mint", "pink"]) {
    if (document.hidden || performance.now() - bootedAt < QUIET_START) return null;
    for (const kind of order) {
      const pal = byKind(kind);
      if (pal && say(pal, pickLine(lines, pal.last))) return pal;
    }
    return null;
  }

  function signature(pal) {
    hop(pal.mascot, 10);
    if (pal.kind === "mint") { moves.adjustGlasses(pal.mascot, pal.peek); setMood(pal.mascot, "surprised", 700); }
    if (pal.kind === "pink") { moves.bop(pal.mascot, pal.peek, 4); }
    if (pal.kind === "purple") moves.sixSeven(pal.mascot, pal.peek, { rounds: 2 });
  }
  // Ducked friends can still be caught with a click.
  function poke(pal) {
    rouse();
    pal.braveUntil = performance.now() + 3000;
    clearTimeout(returns.get(pal));
    returns.delete(pal);
    pal.el.classList.remove("is-shy");
    setTimeout(schedule, 3050);
    signature(pal);
    setTimeout(() => say(pal, ROOM_LINES.caught[pal.kind] || "Hi!", 2000), 250);
  }
  pals.forEach(pal => pal.el.addEventListener("click", () => poke(pal)));

  // Pals doze off when nothing has played for a while, and perk up when it does.
  function doze() {
    if (dozing || document.body.dataset.playback === "playing") return;
    dozing = true;
    pals.forEach(pal => { setMood(pal.mascot, "sleepy"); hideBubble(pal); });
    snoreTimer = setInterval(() => {
      const visible = pals.filter(p => shown(p) && !p.el.classList.contains("is-shy"));
      const pal = visible[Math.floor(Math.random() * visible.length)];
      if (pal) burst(pal.peek, "z", { ...pointIn(pal.peek, pal.mascot, .7, .25), count: 1, color: "#E0D4FF", size: 15, spread: 20, rise: 45, duration: 1800 });
    }, 2600);
    schedule();
  }
  function rouse() {
    clearTimeout(dozeTimer);
    if (dozing) {
      dozing = false;
      clearInterval(snoreTimer);
      pals.forEach(pal => setMood(pal.mascot, "surprised", 600));
      setTimeout(() => speak(ROOM_LINES.wake), 300);
    }
    if (document.body.dataset.playback !== "playing") dozeTimer = setTimeout(doze, DOZE_AFTER);
  }
  const playbackWatch = new MutationObserver(() => {
    const next = document.body.dataset.playback;
    if (next === mood) return;
    const before = mood;
    mood = next;
    rouse();
    if (next === "playing") {
      pals.forEach((pal, i) => setTimeout(() => { if (shown(pal)) hop(pal.mascot, 6); }, i * 120));
      speak(ROOM_LINES.play, ["pink", "purple", "mint"]);
    } else if (next === "paused" && before === "playing") {
      pals.forEach(pal => setMood(pal.mascot, "surprised", 800));
      speak(ROOM_LINES.pause, ["mint", "purple", "pink"]);
    }
  });
  playbackWatch.observe(document.body, { attributes: true, attributeFilter: ["data-playback"] });
  rouse();

  function cheer(type) {
    if (document.hidden) return;
    rouse();
    if (type === "join") {
      pals.forEach((pal, i) => setTimeout(() => {
        wave(pal.mascot, 2); hop(pal.mascot, 8); setMood(pal.mascot, "happy", 1600);
        burst(pal.peek, "heart", { ...pointIn(pal.peek, pal.mascot, .5, .2), count: 2, color: "#F4ADC0", size: 15, spread: 40, rise: 55 });
      }, i * 160));
      speak(ROOM_LINES.join);
    }
    if (type === "added") {
      const fan = byKind("pink") || byKind("purple");
      if (fan) {
        hop(fan.mascot, 12); setMood(fan.mascot, "surprised", 700);
        burst(fan.peek, "note", { ...pointIn(fan.peek, fan.mascot, .5, .15), count: 2, color: "#F5BE70", size: 17, spread: 50, rise: 60 });
      }
      const panel = document.querySelector(".playlist-panel");
      for (const pal of pals) if (pal !== fan && panel && shown(pal)) setLook(pal.mascot, lookVector(centerOf(pal.mascot), centerOf(panel)));
      setTimeout(schedule, 1500);
      speak(ROOM_LINES.added, ["mint", "purple", "pink"]);
    }
    if (type === "next") {
      const fan = byKind("mint") || byKind("purple");
      if (fan) {
        hop(fan.mascot, 8); setMood(fan.mascot, "happy", 1200);
        burst(fan.peek, "spark", { ...pointIn(fan.peek, fan.mascot, .6, .2), count: 2, color: "#AADF97", size: 13, spread: 40, rise: 45 });
      }
      speak(ROOM_LINES.next, ["purple", "mint", "pink"]);
    }
  }

  // Between videos they keep themselves busy. While something plays they just vibe.
  const idleActs = [
    () => {
      const [a, b] = pals.filter(p => shown(p) && !p.el.classList.contains("is-shy")).sort(() => Math.random() - .5);
      if (!a || !b) return;
      setLook(a.mascot, lookVector(centerOf(a.mascot), centerOf(b.mascot)));
      setLook(b.mascot, lookVector(centerOf(b.mascot), centerOf(a.mascot)));
      setTimeout(() => { setMood(a.mascot, "happy", 900); setMood(b.mascot, "happy", 900); }, 700);
      setTimeout(schedule, 2000);
    },
    () => { const purple = byKind("purple"); if (purple) { moves.sixSeven(purple.mascot, purple.peek, { rounds: 2 }); setTimeout(() => say(purple, "6-7!", 1800), 1300); } },
    () => { const pink = byKind("pink"); if (pink && !pink.el.classList.contains("is-shy")) moves.bop(pink.mascot, pink.peek, 4); },
    () => { if (seen && !seen.queue) speak(ROOM_LINES.empty); else { const mint = byKind("mint"); if (mint) moves.adjustGlasses(mint.mascot, mint.peek); } },
  ];
  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!document.hidden && !dozing && document.body.dataset.playback !== "playing" && performance.now() - lastSaid > 8000)
        idleActs[Math.floor(Math.random() * idleActs.length)]();
      scheduleIdle();
    }, 16000 + Math.random() * 14000);
  }
  if (!reducedMotion()) scheduleIdle();

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
    clearTimeout(idleTimer);
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
