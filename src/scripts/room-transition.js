export async function enterCreatedRoom(url, trigger) {
  if (typeof url !== "string" || !/^\/room\/[a-zA-Z0-9_-]{1,64}$/.test(url)) throw new Error("Invalid room URL");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const portal = document.getElementById("room-portal");
  if (portal && !reducedMotion.matches) {
    const bounds = trigger.getBoundingClientRect();
    portal.style.setProperty("--portal-x", bounds.left + bounds.width / 2 + "px");
    portal.style.setProperty("--portal-y", bounds.top + bounds.height / 2 + "px");
    document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    portal.hidden = false;
    document.body.classList.add("room-departing");
    await new Promise(resolve => setTimeout(resolve, 850));
    try { sessionStorage.setItem("youple-room-arrival", String(Date.now())); } catch {}
  }
  location.assign(url);
}

export function revealCreatedRoom() {
  let arrived = 0;
  try {
    arrived = Number(sessionStorage.getItem("youple-room-arrival"));
    sessionStorage.removeItem("youple-room-arrival");
  } catch {}
  const age = Date.now() - arrived;
  if (age >= 0 && age < 8000 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.classList.add("portal-arrival");
  }
}
