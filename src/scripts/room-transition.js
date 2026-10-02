export async function enterCreatedRoom(url, trigger, copying = Promise.resolve(false)) {
  if (typeof url !== "string" || !/^\/room\/[a-zA-Z0-9_-]{1,64}$/.test(url)) throw new Error("Invalid room URL");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const portal = document.getElementById("room-portal");
  let animation = Promise.resolve(), point = null;
  if (portal && !reducedMotion.matches) {
    const bounds = trigger.getBoundingClientRect();
    const x = (bounds.left + bounds.width / 2) / innerWidth * 100;
    const y = (bounds.top + bounds.height / 2) / innerHeight * 100;
    portal.style.setProperty("--portal-x", x + "%");
    portal.style.setProperty("--portal-y", y + "%");
    document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    portal.hidden = false;
    document.body.classList.add("room-departing");
    animation = new Promise(resolve => setTimeout(resolve, 850));
    point = { x, y };
  }
  const [copied] = await Promise.all([Promise.race([copying.catch(() => false), new Promise(resolve => setTimeout(() => resolve(false), 1000))]), animation]);
  try {
    if (point) sessionStorage.setItem("youple-room-arrival", JSON.stringify({ at: Date.now(), url, ...point }));
    sessionStorage.setItem("youple-created-room", JSON.stringify({ at: Date.now(), url, copied: copied === true }));
  } catch {}
  location.assign(url);
}

export async function revealCreatedRoom() {
  const root = document.documentElement;
  if (!root.classList.contains("room-arriving")) return;
  // Connect and settle the layout under the same backdrop as the outgoing page.
  // A slow or failed connection must never trap someone behind the transition.
  const connected = new Promise(resolve => {
    const done = () => { clearTimeout(timer); document.removeEventListener("youple:room-ready", done); resolve(); };
    const timer = setTimeout(done, 1200);
    document.addEventListener("youple:room-ready", done, { once: true });
  });
  await Promise.all([connected, Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 250))])]);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (!root.classList.contains("room-arriving")) return;
  performance.mark("youple:room-reveal");
  root.classList.add("room-revealing");
  await new Promise(resolve => setTimeout(resolve, 480));
  root.classList.remove("room-arriving", "room-revealing");
  performance.mark("youple:room-visible");
}
