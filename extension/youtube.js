// Adds a "Send to <room>" button to YouTube video pages, next to the channel's Subscribe button,
// a round one in the Like/Share column on Shorts, and a small one on any video thumbnail under the mouse.
const VIDEO_PAGE = /^\/(watch|shorts\/|live\/)/;
const button = document.createElement("button");
button.type = "button";
button.className = "youple-send";
button.innerHTML = `<img alt="" src="${chrome.runtime.getURL("icons/32.png")}"><span></span>`;
const label = button.querySelector("span");
let roomName = "", resetTimer;
const short = document.createElement("button");
short.type = "button";
short.className = "youple-short";
short.innerHTML = `<span class="youple-short-icon"><img alt="" src="${chrome.runtime.getURL("icons/32.png")}"></span><span class="youple-short-label">youple</span>`;
const shortLabel = short.querySelector(".youple-short-label");
let shortTimer;

const style = document.createElement("style");
style.textContent = `
  .youple-send { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 16px 0 8px; margin-left: 8px;
    border: 0; border-radius: 18px; background: rgba(0,0,0,.05); color: #0f0f0f; font: 500 14px/36px Roboto, Arial, sans-serif;
    cursor: pointer; white-space: nowrap; flex: none; max-width: 260px; }
  html[dark] .youple-send { background: rgba(255,255,255,.1); color: #f1f1f1; }
  .youple-send:hover { background: rgba(0,0,0,.1); }
  html[dark] .youple-send:hover { background: rgba(255,255,255,.2); }
  .youple-send:disabled { cursor: default; }
  .youple-send img { width: 22px; height: 22px; border-radius: 6px; }
  .youple-send span { overflow: hidden; text-overflow: ellipsis; }
  .youple-thumb { position: fixed; z-index: 2147483001; display: inline-flex; align-items: center; height: 32px; min-width: 32px;
    padding: 0 4px; gap: 6px; border: 0; border-radius: 8px; background: rgba(0,0,0,.72); color: #fff; cursor: pointer;
    font: 500 12px/32px Roboto, Arial, sans-serif; white-space: nowrap; max-width: 220px; }
  .youple-thumb[hidden] { display: none; }
  .youple-thumb img { width: 24px; height: 24px; border-radius: 6px; flex: none; }
  .youple-thumb span { display: none; overflow: hidden; text-overflow: ellipsis; padding-right: 6px; }
  .youple-thumb:hover span, .youple-thumb.is-busy span { display: inline; }
  .youple-thumb:hover { background: rgba(0,0,0,.88); }
  .youple-short { display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 0 0 16px; padding: 0; border: 0;
    background: none; color: #0f0f0f; font: 500 14px/20px Roboto, Arial, sans-serif; cursor: pointer; }
  html[dark] .youple-short { color: #f1f1f1; }
  .youple-short-icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: rgba(0,0,0,.05); }
  html[dark] .youple-short-icon { background: rgba(255,255,255,.1); }
  .youple-short:hover .youple-short-icon { background: rgba(0,0,0,.1); }
  html[dark] .youple-short:hover .youple-short-icon { background: rgba(255,255,255,.2); }
  .youple-short img { width: 26px; height: 26px; border-radius: 7px; }
  .youple-send.is-floating, html[dark] .youple-send.is-floating { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; margin: 0;
    background: #272727; color: #f1f1f1; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
`;
document.documentElement.append(style);

function idle() {
  button.disabled = false;
  label.textContent = roomName ? "Send to " + roomName : "Send to youple";
  button.title = roomName ? "Add this video to the playlist in " + roomName : "Open a youple.tv room first, then send videos to it";
  short.title = roomName ? "Send to " + roomName : button.title;
  short.setAttribute("aria-label", short.title);
}

// The Like/Share column of the Short on screen. YouTube renames its containers often, so start
// from the Like button that's fully in view and climb to the widest ancestor that's still a
// narrow column.
const LIKE_BUTTONS = "like-button-view-model, ytd-like-button-renderer, #like-button";
function shortsActions() {
  for (const like of document.querySelectorAll(LIKE_BUTTONS)) {
    const box = like.getBoundingClientRect();
    if (!box.width || box.top < 0 || box.bottom > innerHeight) continue;
    let column = like;
    while (column.parentElement && column.parentElement !== document.body && column.parentElement.getBoundingClientRect().width < 140) {
      column = column.parentElement;
    }
    if (column !== like && column.childElementCount >= 3) return column;
  }
  return null;
}

function place() {
  if (!VIDEO_PAGE.test(location.pathname)) { button.remove(); short.remove(); return; }
  const actions = location.pathname.startsWith("/shorts/") ? shortsActions() : null;
  if (actions) {
    button.remove();
    // Above the last item, which is the sound or channel thumbnail.
    const before = actions.lastElementChild === short ? short.previousElementSibling : actions.lastElementChild;
    if (short.parentElement !== actions || short.nextElementSibling !== before) actions.insertBefore(short, before);
    return;
  }
  short.remove();
  // YouTube keeps the hidden watch page around while Shorts play.
  const spot = location.pathname === "/watch" ? document.querySelector("ytd-watch-metadata #owner") : null;
  if (spot) {
    button.classList.remove("is-floating");
    if (button.parentElement !== spot) spot.append(button);
  } else if (!button.isConnected || !button.classList.contains("is-floating")) {
    // Shorts, or a YouTube layout this script doesn't know yet.
    button.classList.add("is-floating");
    document.body?.append(button);
  }
}

async function sendVideo(url) {
  let result;
  try { result = await chrome.runtime.sendMessage({ type: "send", url }); } catch {}
  return { sent: "Added to " + (roomName || "your room"), opened: "Added, room opened in a new tab",
    "no-room": "Open a room, then try again", "no-video": "This isn't a video" }[result] || "Couldn't send. Reload the page";
}

button.addEventListener("click", async () => {
  clearTimeout(resetTimer);
  button.disabled = true;
  label.textContent = "Sending…";
  label.textContent = await sendVideo(location.href);
  resetTimer = setTimeout(idle, 3000);
});

short.addEventListener("click", async event => {
  event.stopPropagation();
  clearTimeout(shortTimer);
  short.disabled = true;
  shortLabel.textContent = "Sending…";
  const message = await sendVideo(location.href);
  shortLabel.textContent = message.startsWith("Added") ? "Added ✓" : "Not sent";
  short.title = message;
  shortTimer = setTimeout(() => { short.disabled = false; shortLabel.textContent = "youple"; idle(); }, 2500);
});

// One shared thumbnail button in the top-left corner of whichever video thumbnail is under the
// mouse. It looks through every layer at the pointer, so YouTube's hover preview can't hide it.
const thumb = document.createElement("button");
thumb.type = "button";
thumb.className = "youple-thumb";
thumb.hidden = true;
thumb.innerHTML = `<img alt="" src="${chrome.runtime.getURL("icons/32.png")}"><span></span>`;
const thumbLabel = thumb.querySelector("span");
let thumbLink = null, thumbBusy = false, pointer = null, pending = false;

function videoLinkAt(x, y) {
  for (const element of document.elementsFromPoint(x, y)) {
    if (thumb.contains(element)) continue;
    const link = element.closest?.("a[href]");
    if (!link || !/^\/(watch\?|shorts\/|live\/)/.test(link.getAttribute("href").replace(/^https:\/\/www\.youtube\.com/, ""))) continue;
    const box = link.getBoundingClientRect();
    if (box.width >= 120 && box.height >= 68) return link; // a thumbnail or preview, not a title
  }
  return null;
}
function inside(box, x, y) { return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom; }
function thumbText() {
  thumbLabel.textContent = roomName ? "Send to " + roomName : "Open a youple room first";
  thumb.setAttribute("aria-label", thumbLabel.textContent);
}
function track() {
  pending = false;
  if (thumbBusy || !pointer) return;
  const over = inside(thumb.getBoundingClientRect(), pointer.x, pointer.y) && !thumb.hidden;
  const link = over ? thumbLink : videoLinkAt(pointer.x, pointer.y);
  if (!link?.isConnected) { thumb.hidden = true; thumbLink = null; return; }
  if (link !== thumbLink) thumbText();
  thumbLink = link;
  const box = link.getBoundingClientRect();
  thumb.style.left = box.left + 8 + "px";
  thumb.style.top = box.top + 8 + "px";
  if (!thumb.isConnected) document.body.append(thumb);
  thumb.hidden = false;
}
function schedule() { if (!pending) { pending = true; requestAnimationFrame(track); } }
document.addEventListener("pointermove", event => { pointer = { x: event.clientX, y: event.clientY }; schedule(); }, { passive: true });
document.addEventListener("scroll", schedule, { capture: true, passive: true });
document.documentElement.addEventListener("pointerleave", () => { pointer = null; if (!thumbBusy) thumb.hidden = true; });
// Keep YouTube from treating our click as a click on the video.
for (const type of ["pointerdown", "mousedown", "mouseup"]) thumb.addEventListener(type, event => event.stopPropagation());
thumb.addEventListener("click", async event => {
  event.preventDefault();
  event.stopPropagation();
  if (!thumbLink || thumbBusy) return;
  thumbBusy = true;
  thumb.classList.add("is-busy");
  thumbLabel.textContent = "Sending…";
  thumbLabel.textContent = await sendVideo(thumbLink.href);
  setTimeout(() => { thumbBusy = false; thumb.classList.remove("is-busy"); thumbText(); schedule(); }, 1800);
});

chrome.storage.local.get("lastRoom").then(({ lastRoom }) => { roomName = lastRoom?.name || ""; idle(); });
chrome.storage.onChanged.addListener(changes => {
  if (!changes.lastRoom) return;
  roomName = changes.lastRoom.newValue?.name || "";
  if (!button.disabled) idle();
});
// YouTube swaps pages without reloading and rebuilds parts of them, so keep the button in place.
let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; place(); });
}).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("yt-navigate-finish", place);
// Shorts swap the playing video as you scroll.
document.addEventListener("scroll", () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; place(); });
}, { capture: true, passive: true });
idle();
place();
