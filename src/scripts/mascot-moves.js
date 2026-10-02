import { animate, burst, pointIn, setMood } from "./mascot-fx.js";

// Each friend's signature move. `host` is the positioned element particles float in.

export function adjustGlasses(mascot, host) {
  const glasses = mascot.querySelector(".mascot-glasses");
  if (!glasses) return;
  animate(glasses, [{ transform: "none" }, { transform: "translateY(-16%) rotate(-7deg)", offset: .35 }, { transform: "translateY(-4%) rotate(3deg)", offset: .7 }, { transform: "none" }], { duration: 900 });
  burst(host, "spark", { ...pointIn(host, glasses, .85, .2), count: 2, color: "#FFF0CD", size: 14, rise: 40, spread: 50, duration: 900 });
}

export function bop(mascot, host, beats = 6) {
  animate(mascot.querySelector(".mascot-rig"), [{ transform: "rotate(0)" }, { transform: "rotate(-6deg) translateY(-2%)" }, { transform: "rotate(0)" }, { transform: "rotate(6deg) translateY(-2%)" }, { transform: "rotate(0)" }], { duration: 760, iterations: beats / 2, easing: "ease-in-out" });
  const phones = mascot.querySelector(".mascot-headphones") || mascot;
  const colors = ["#C3AFFF", "#F4ADC0", "#F5BE70", "#AADF97"];
  for (let i = 0; i < beats / 2; i++) setTimeout(() => burst(host, "note", { ...pointIn(host, phones, i % 2 ? .95 : .05, .6), count: 1, color: colors[i % colors.length], size: 20, spread: 60, rise: 90 }), i * 760);
  setMood(mascot, "happy", 380 * beats);
}

export function tossSnacks(mascot, host) {
  burst(host, "kernel", { ...pointIn(host, mascot, .5, .45), count: 4, size: 16, spread: 120, rise: 110, duration: 1300 });
}

/** Palms up, weighing 6 against 7. onBeat gets "6" or "7" on each swing. */
export function sixSeven(mascot, host, { rounds = 3, onBeat } = {}) {
  const left = mascot.querySelector(".arm-left"), right = mascot.querySelector(".arm-right");
  const leftUp = "translateY(-22%) rotate(-62deg)", leftDown = "translateY(8%) rotate(-82deg)";
  const rightUp = "translateY(-22%) rotate(62deg)", rightDown = "translateY(8%) rotate(82deg)";
  const timing = { duration: 640 * rounds, easing: "ease-in-out" };
  const swing = (a, b, rest) => [{ transform: rest }, ...Array.from({ length: rounds * 2 }, (_, i) => ({ transform: i % 2 ? b : a })), { transform: rest }];
  animate(left, swing(leftUp, leftDown, "rotate(30deg)"), timing);
  animate(right, swing(rightDown, rightUp, "rotate(-35deg)"), timing);
  animate(mascot.querySelector(".mascot-rig"), [{ transform: "none" }, { transform: "rotate(-4deg)" }, { transform: "rotate(4deg)" }, { transform: "none" }], { duration: 640, iterations: rounds });
  for (let i = 0; i < rounds * 2; i++) setTimeout(() => {
    const digit = i % 2 ? "7" : "6";
    onBeat?.(digit);
    burst(host, digit, { ...pointIn(host, mascot, i % 2 ? .85 : .15, .4), count: 1, color: i % 2 ? "#F5BE70" : "#C3AFFF", size: 22, spread: 40, rise: 70 });
  }, i * 320);
  return rounds * 640;
}
