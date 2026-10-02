import { animate, burst, centerOf, hop, lookVector, pickLine, pointIn, reducedMotion, setLook, setMood, wave } from "./mascot-fx.js";

// Each friend has their own voice. Lines stay short so bubbles fit on phones.
export const PERSONALITIES = {
  mint: {
    lines: ["Got a good video?", "I have 47 tabs open.", "Trust me, it's a banger.", "Skip the intro.", "One more video.", "Is this in 4K?"],
    dizzy: "My glasses!", petted: "Hehe, thanks.", wake: "Oh! You're back.", cheer: "Yesss!", eager: "Ooh, do it.",
  },
  pink: {
    lines: ["I brought snacks.", "This song slaps.", "Turn it up!", "Popcorn?", "Snack break!", "Volume to 11."],
    dizzy: "Okay, okay!", petted: "Aww.", wake: "Did I miss it?", cheer: "Party time!", eager: "Snacks ready!",
  },
  purple: {
    lines: ["6-7", "SIX SEVEN", "67!!", "6…7…", "6 or 7?"],
    dizzy: "6-7-6-7…", petted: "6-7 :)", wake: "67?", cheer: "67!!!", eager: "6-7?",
  },
};

const SLEEP_AFTER = 25000;

export function bootHomeMascots() {
  const cast = document.querySelector(".mascot-cast");
  if (!cast) return;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const friends = [...cast.querySelectorAll(".cast-member")].map(el => {
    const mascot = el.querySelector(".mascot");
    const bubble = el.querySelector(".speech-bubble");
    return { el, mascot, kind: mascot.dataset.kind, bubble, home: bubble?.textContent || "", last: "", pokes: [], rub: [], gaze: null, gazeUntil: 0, sayTimer: 0, busyUntil: 0, pettedAt: 0 };
  });
  const byKind = Object.fromEntries(friends.map(f => [f.kind, f]));
  let pointer = null, lastActive = performance.now(), sleeping = false, idleTimer = 0, sleepTimer = 0, zzzTimer = 0, gazeFrame = 0, keys = "";
  const button = document.querySelector(".create-room-button");

  function updateGaze() {
    gazeFrame = 0;
    const now = performance.now();
    for (const f of friends) {
      if (sleeping) { setLook(f.mascot, { x: 0, y: 0 }); continue; }
      const target = f.gazeUntil > now ? f.gaze : pointer;
      setLook(f.mascot, target ? lookVector(centerOf(f.mascot), target) : null);
    }
  }
  const scheduleGaze = () => { if (!gazeFrame) gazeFrame = requestAnimationFrame(updateGaze); };
  function lookAt(friend, point, duration = 1600) {
    friend.gaze = point; friend.gazeUntil = performance.now() + duration;
    scheduleGaze();
    setTimeout(scheduleGaze, duration + 20);
  }

  function say(friend, text, duration = 3200) {
    if (!friend.bubble) return;
    clearTimeout(friend.sayTimer);
    friend.bubble.textContent = text;
    friend.last = text;
    animate(friend.bubble, [{ scale: .55, opacity: .2 }, { scale: 1.08, opacity: 1, offset: .6 }, { scale: 1, opacity: 1 }], { duration: 380 });
    // Everyone else turns to the one talking.
    const speaker = centerOf(friend.mascot);
    for (const other of friends) if (other !== friend) lookAt(other, speaker, Math.min(duration, 1800));
    friend.sayTimer = setTimeout(() => {
      if (friend.bubble.textContent !== text) return;
      friend.bubble.textContent = friend.home;
      animate(friend.bubble, [{ opacity: .3 }, { opacity: 1 }], { duration: 300 });
    }, duration);
  }
  const chatter = friend => say(friend, pickLine(PERSONALITIES[friend.kind].lines, friend.last || friend.home));

  // Signature moves.
  function adjustGlasses(friend) {
    animate(friend.mascot.querySelector(".mascot-glasses"), [{ transform: "none" }, { transform: "translateY(-16%) rotate(-7deg)", offset: .35 }, { transform: "translateY(-4%) rotate(3deg)", offset: .7 }, { transform: "none" }], { duration: 900 });
    const glasses = friend.mascot.querySelector(".mascot-glasses");
    if (glasses) burst(friend.el, "spark", { ...pointIn(friend.el, glasses, .85, .2), count: 2, color: "#FFF0CD", size: 14, rise: 40, spread: 50, duration: 900 });
  }
  function bop(friend, beats = 6) {
    const rig = friend.mascot.querySelector(".mascot-rig");
    animate(rig, [{ transform: "rotate(0)" }, { transform: "rotate(-6deg) translateY(-2%)" }, { transform: "rotate(0)" }, { transform: "rotate(6deg) translateY(-2%)" }, { transform: "rotate(0)" }], { duration: 760, iterations: beats / 2, easing: "ease-in-out" });
    const phones = friend.mascot.querySelector(".mascot-headphones") || friend.mascot;
    const colors = ["#C3AFFF", "#F4ADC0", "#F5BE70", "#AADF97"];
    for (let i = 0; i < beats / 2; i++) setTimeout(() => burst(friend.el, "note", { ...pointIn(friend.el, phones, i % 2 ? .95 : .05, .6), count: 1, color: colors[i % colors.length], size: 20, spread: 60, rise: 90 }), i * 760);
    setMood(friend.mascot, "happy", 380 * beats);
  }
  function snacks(friend, toward = byKind.purple) {
    const from = pointIn(friend.el, friend.mascot, .5, .45);
    burst(friend.el, "kernel", { ...from, count: 4, size: 16, spread: 120, rise: 110, duration: 1300 });
    if (toward) { lookAt(toward, centerOf(friend.mascot), 1400); setTimeout(() => { hop(toward.mascot, 9); setMood(toward.mascot, "happy", 900); }, 500); }
  }
  function sixSeven(friend, rounds = 3) {
    const left = friend.mascot.querySelector(".arm-left"), right = friend.mascot.querySelector(".arm-right");
    // Palms up, weighing 6 against 7.
    const rest = { left: "rotate(30deg)", right: "rotate(-35deg)" };
    const leftUp = "translateY(-22%) rotate(-62deg)", leftDown = "translateY(8%) rotate(-82deg)";
    const rightUp = "translateY(-22%) rotate(62deg)", rightDown = "translateY(8%) rotate(82deg)";
    const timing = { duration: 640 * rounds, easing: "ease-in-out" };
    const swing = (a, b, restPose) => [{ transform: restPose }, ...Array.from({ length: rounds * 2 }, (_, i) => ({ transform: i % 2 ? b : a })), { transform: restPose }];
    animate(left, swing(leftUp, leftDown, rest.left), timing);
    animate(right, swing(rightDown, rightUp, rest.right), timing);
    animate(friend.mascot.querySelector(".mascot-rig"), [{ transform: "none" }, { transform: "rotate(-4deg)" }, { transform: "rotate(4deg)" }, { transform: "none" }], { duration: 640, iterations: rounds });
    for (let i = 0; i < rounds * 2; i++) setTimeout(() => {
      if (friend.bubble) friend.bubble.textContent = i % 2 ? "7" : "6";
      burst(friend.el, i % 2 ? "7" : "6", { ...pointIn(friend.el, friend.mascot, i % 2 ? .85 : .15, .4), count: 1, color: i % 2 ? "#F5BE70" : "#C3AFFF", size: 22, spread: 40, rise: 70 });
    }, i * 320);
    setTimeout(() => say(friend, rounds > 3 ? "SIX SEVEN!!" : "6-7!", 2200), rounds * 640);
  }
  const signature = { mint: f => { adjustGlasses(f); setMood(f.mascot, "surprised", 700); }, pink: f => (Math.random() < .5 ? bop(f) : snacks(f)), purple: f => sixSeven(f) };

  function react(friend) {
    friend.busyUntil = performance.now() + 1200;
    hop(friend.mascot);
    signature[friend.kind](friend);
    if (friend.kind !== "purple") chatter(friend);
  }
  function dizzy(friend) {
    friend.busyUntil = performance.now() + 2400;
    setMood(friend.mascot, "dizzy", 2200);
    animate(friend.mascot.querySelector(".mascot-rig"), [{ transform: "rotate(0)" }, { transform: "rotate(-9deg)" }, { transform: "rotate(7deg)" }, { transform: "rotate(-4deg)" }, { transform: "rotate(0)" }], { duration: 1100, iterations: 2, easing: "ease-in-out" });
    burst(friend.el, "spark", { ...pointIn(friend.el, friend.mascot, .5, .2), count: 4, color: "#F5BE70", size: 14, spread: 90, rise: 30 });
    say(friend, PERSONALITIES[friend.kind].dizzy, 2400);
    const giggler = friends.find(f => f !== friend && f.kind === "purple") || friends.find(f => f !== friend);
    if (giggler) setTimeout(() => setMood(giggler.mascot, "happy", 1400), 300);
  }
  function petted(friend) {
    const now = performance.now();
    if (now - friend.pettedAt < 3500) return;
    friend.pettedAt = now;
    setMood(friend.mascot, "happy", 2000);
    burst(friend.el, "heart", { ...pointIn(friend.el, friend.mascot, .5, .25), count: 3, color: "#F4ADC0", size: 18, spread: 80, rise: 80 });
    say(friend, PERSONALITIES[friend.kind].petted, 2200);
  }

  function poke(friend, event) {
    wake();
    const now = performance.now();
    friend.pokes = friend.pokes.filter(t => now - t < 2500);
    friend.pokes.push(now);
    if (event) lookAt(friend, { x: event.clientX, y: event.clientY }, 700);
    if (friend.pokes.length >= 5) { friend.pokes = []; dizzy(friend); }
    else react(friend);
  }

  for (const friend of friends) {
    friend.mascot.addEventListener("pointerdown", event => { if (event.button === 0) poke(friend, event); });
    // Rubbing back and forth over a friend with the mouse counts as a pet.
    friend.mascot.addEventListener("pointermove", event => {
      if (event.pointerType !== "mouse") return;
      const now = performance.now();
      friend.rub = friend.rub.filter(r => now - r.t < 1200);
      friend.rub.push({ t: now, d: Math.abs(event.movementX) + Math.abs(event.movementY) });
      if (friend.rub.reduce((sum, r) => sum + r.d, 0) > 420) { friend.rub = []; petted(friend); }
    });
  }

  // Idle life: friends chat, bop and goof around on their own.
  const idleActs = [
    () => { const f = friends[Math.floor(Math.random() * friends.length)]; chatter(f); hop(f.mascot, 6); },
    () => byKind.mint && (adjustGlasses(byKind.mint), chatter(byKind.mint)),
    () => byKind.pink && bop(byKind.pink),
    () => byKind.pink && byKind.purple && (snacks(byKind.pink), say(byKind.pink, "Popcorn?", 2400)),
    () => byKind.purple && sixSeven(byKind.purple, 2),
    () => { // two friends exchange a look
      const [a, b] = friends.slice().sort(() => Math.random() - .5);
      if (!a || !b) return;
      lookAt(a, centerOf(b.mascot), 1800); lookAt(b, centerOf(a.mascot), 1800);
      setTimeout(() => { setMood(a.mascot, "happy", 900); setMood(b.mascot, "happy", 900); }, 700);
    },
  ];
  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      const now = performance.now();
      if (!document.hidden && !sleeping && now - lastActive > 2500 && friends.every(f => f.busyUntil < now)) idleActs[Math.floor(Math.random() * idleActs.length)]();
      scheduleIdle();
    }, 6500 + Math.random() * 6000);
  }

  // Leave them alone for a while and they doze off; come back and they wake up.
  function sleep() {
    if (sleeping || document.hidden) return;
    sleeping = true;
    friends.forEach(f => setMood(f.mascot, "sleepy"));
    scheduleGaze();
    const snore = () => {
      const f = friends[Math.floor(Math.random() * friends.length)];
      burst(f.el, "z", { ...pointIn(f.el, f.mascot, .7, .25), count: 2, color: "#E0D4FF", size: 18, spread: 30, rise: 60, duration: 1800 });
    };
    snore();
    zzzTimer = setInterval(snore, 2200);
  }
  function wake() {
    lastActive = performance.now();
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(sleep, SLEEP_AFTER);
    if (!sleeping) return;
    sleeping = false;
    clearInterval(zzzTimer);
    friends.forEach((f, i) => { setMood(f.mascot, "surprised", 700); setTimeout(() => hop(f.mascot, 10), i * 110); });
    const greeter = friends[Math.floor(Math.random() * friends.length)];
    say(greeter, PERSONALITIES[greeter.kind].wake, 2600);
    scheduleGaze();
  }

  document.addEventListener("pointermove", event => {
    if (event.pointerType === "mouse" && finePointer.matches) { pointer = { x: event.clientX, y: event.clientY }; scheduleGaze(); }
    wake();
  }, { passive: true });
  document.addEventListener("pointerdown", event => { pointer = { x: event.clientX, y: event.clientY }; scheduleGaze(); wake(); }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { pointer = null; scheduleGaze(); });
  addEventListener("scroll", () => { wake(); scheduleGaze(); }, { passive: true });
  addEventListener("resize", scheduleGaze, { passive: true });
  document.addEventListener("keydown", event => {
    wake();
    if (event.target.closest?.("input,textarea,[contenteditable]") || event.ctrlKey || event.metaKey || event.altKey) return;
    keys = (keys + event.key).slice(-2);
    if (keys === "67" && byKind.purple) { keys = ""; sixSeven(byKind.purple, 5); friends.forEach(f => f !== byKind.purple && setTimeout(() => say(f, "6-7!", 1800), 900)); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });

  // The friends get excited about making a room.
  if (button) {
    let hovering = false, cheered = 0;
    button.addEventListener("pointerenter", () => {
      if (hovering) return;
      hovering = true;
      const target = centerOf(button);
      friends.forEach(f => { lookAt(f, target, 60000); setMood(f.mascot, "eager"); });
      const fan = friends[Math.floor(Math.random() * friends.length)];
      if (fan && fan.busyUntil < performance.now() && performance.now() - cheered > 5000) { cheered = performance.now(); say(fan, PERSONALITIES[fan.kind].eager, 1800); }
    });
    button.addEventListener("pointerleave", () => {
      if (!hovering) return;
      hovering = false;
      friends.forEach(f => { f.gazeUntil = 0; if (f.mascot.classList.contains("is-eager")) setMood(f.mascot, null); });
      scheduleGaze();
    });
  }
  document.getElementById("create-form")?.addEventListener("submit", () => {
    friends.forEach((f, i) => setTimeout(() => {
      hop(f.mascot, 18); wave(f.mascot, 2); setMood(f.mascot, "happy", 2500);
      say(f, PERSONALITIES[f.kind].cheer, 2600);
      burst(f.el, "spark", { ...pointIn(f.el, f.mascot, .5, .2), count: 4, color: ["#C3AFFF", "#F5BE70", "#AADF97"][i % 3], size: 16, spread: 110, rise: 90 });
    }, i * 140));
  });

  if (!reducedMotion()) scheduleIdle();
  wake();
}
