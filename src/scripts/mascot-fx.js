// Shared bits for the mascots on the home page and in rooms.
import { showCatFace } from './cat-reactions.js';

const ART = {
  note: '<svg viewBox="0 0 32 44" fill="none"><path d="M17 33V5c0 11 15 6 10 19" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><ellipse cx="10" cy="34" rx="9" ry="6" fill="currentColor" transform="rotate(-20 10 34)"/></svg>',
  heart: '<svg viewBox="0 0 24 22"><path d="M12 21C5 15 0 11 0 6a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 5-5 9-12 15Z" fill="currentColor"/></svg>',
  kernel: '<svg viewBox="0 0 24 22"><path d="M4 14C-2 9 4 1 9 5c2-6 11-5 11 1 6 0 5 9-1 9-1 6-10 7-12 2-2 1-4 0-3-3Z" fill="#FFF5D8"/><circle cx="12" cy="11" r="2.5" fill="#F5BE70"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0Z" fill="currentColor"/></svg>',
};

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where pupils should sit (in px) to look from one point toward another. */
export function lookVector(from, to, { maxX = 4, maxY = 3, reach = 220 } = {}) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return { x: 0, y: 0 };
  const pull = Math.min(1, distance / reach);
  return { x: Math.round(dx / distance * maxX * pull * 10) / 10, y: Math.round(dy / distance * maxY * pull * 10) / 10 };
}

/** A random line that isn't the one just said. */
export function pickLine(lines, last, random = Math.random) {
  const options = lines.length > 1 ? lines.filter(line => line !== last) : lines;
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

export function centerOf(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function setLook(mascot, look) {
  if (!look) { mascot.style.removeProperty("--look-x"); mascot.style.removeProperty("--look-y"); return; }
  mascot.style.setProperty("--look-x", look.x + "px");
  mascot.style.setProperty("--look-y", look.y + "px");
}

const MOODS = ["is-surprised", "is-happy", "is-sleepy", "is-dizzy", "is-eager", "is-error", "is-paused", "is-snack", "is-annoyed"];
const moodTimers = new WeakMap();
export function setBaseMood(mascot, mood = 'idle') {
  mascot.dataset.baseMood = mood;
  if (!MOODS.some(name => mascot.classList.contains(name))) showCatFace(mascot, mood);
}
/** Shows a face for a while; without a duration it stays until replaced. */
export function setMood(mascot, mood, duration) {
  clearTimeout(moodTimers.get(mascot));
  mascot.classList.remove(...MOODS);
  if (mood) mascot.classList.add("is-" + mood);
  showCatFace(mascot, mood || mascot.dataset.baseMood || 'idle');
  if (mood && duration) moodTimers.set(mascot, setTimeout(() => setMood(mascot, null), duration));
}

export function animate(element, keyframes, options) {
  if (!element || reducedMotion() || typeof element.animate !== "function") return null;
  return element.animate(keyframes, { easing: "cubic-bezier(.22,1,.36,1)", ...options });
}

export function hop(mascot, height = 14) {
  return animate(mascot.querySelector(".mascot-rig"), [
    { transform: "none" },
    { transform: "translateY(3%) scale(1.08,.9)", offset: .18 },
    { transform: `translateY(-${height}%) scale(.95,1.07)`, offset: .5 },
    { transform: "translateY(1%) scale(1.04,.96)", offset: .82 },
    { transform: "none" },
  ], { duration: 620 });
}

export function wave(mascot, times = 2) {
  return animate(mascot.querySelector(".cat-arm-right"), [
    { transform: "rotate(0deg)" }, { transform: "rotate(-115deg)" }, { transform: "rotate(-85deg)" }, { transform: "rotate(-115deg)" }, { transform: "rotate(0deg)" },
  ], { duration: 520 * times, iterations: 1 });
}

/**
 * Floats a few little things (notes, hearts, popcorn…) out of a point inside host.
 * `art` is a key of ART or a short piece of text.
 */
export function burst(host, art, { x, y, count = 3, color = "#C3AFFF", size = 20, spread = 70, rise = 80, duration = 1400, fall = false } = {}) {
  if (!host || reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const fx = document.createElement("span");
    fx.className = "mascot-fx";
    fx.setAttribute("aria-hidden", "true");
    if (ART[art]) fx.innerHTML = ART[art];
    else { fx.textContent = art; fx.style.fontSize = size + "px"; }
    fx.style.cssText += `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;color:${color}`;
    host.append(fx);
    const dx = (Math.random() - .5) * spread + (count > 1 ? (i / (count - 1) - .5) * spread * .6 : 0);
    const dy = fall ? rise * (.6 + Math.random() * .6) : -rise * (.7 + Math.random() * .6);
    const turn = (Math.random() - .5) * 70;
    const motion = fx.animate([
      { opacity: 0, transform: "translate(0,0) scale(.3) rotate(0deg)" },
      { opacity: 1, transform: `translate(${dx * .35}px,${fall ? -rise * .45 : dy * .35}px) scale(1) rotate(${turn / 2}deg)`, offset: .25 },
      { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(.8) rotate(${turn}deg)` },
    ], { duration: duration * (.85 + Math.random() * .3), delay: i * 90, easing: fall ? "cubic-bezier(.4,0,.8,.6)" : "cubic-bezier(.22,1,.36,1)", fill: "both" });
    motion.finished.then(() => fx.remove(), () => fx.remove());
  }
}

/** A point inside host for a part of the mascot (e.g. its head), as host-relative px. */
export function pointIn(host, element, fx = .5, fy = .5) {
  const h = host.getBoundingClientRect(), r = element.getBoundingClientRect();
  return { x: r.left - h.left + r.width * fx, y: r.top - h.top + r.height * fy };
}
