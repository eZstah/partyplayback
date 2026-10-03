// Adds a "Send to <room>" button to YouTube video pages, next to the channel's Subscribe button,
// and a small one on any video thumbnail under the mouse.
const VIDEO_PAGE = /^\/(watch|shorts\/|live\/)/;
const button = document.createElement("button");
button.type = "button";
button.className = "youple-send";
button.innerHTML = `<img alt="" src="${chrome.runtime.getURL("icons/32.png")}"><span></span>`;
const label = button.querySelector("span");
let roomName = "", resetTimer;

const style = document.createElement("style");
style.textContent = `
  .youple-send { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px 0 6px; margin-left: 8px;
    border: 0; border-radius: 18px; background: #c3afff; color: #181622; font: 500 14px/36px Roboto, Arial, sans-serif;
    cursor: pointer; white-space: nowrap; flex: none; max-width: 260px; }
  .youple-send:hover { background: #d4c6ff; }
  .youple-send:disabled { cursor: default; opacity: .8; }
  .youple-send img { width: 24px; height: 24px; border-radius: 6px; }
  .youple-send span { overflow: hidden; text-overflow: ellipsis; }
  .youple-thumb { position: fixed; max-width: 220px; white-space: nowrap; z-index: 2147483001; display: inline-flex; align-items: center; gap: 4px; height: 28px;
    padding: 0 10px 0 3px; border: 0; border-radius: 14px; background: #c3afff; color: #181622; cursor: pointer;
    font: 500 13px/28px Roboto, Arial, sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,.45); }
  .youple-thumb:hover { background: #d4c6ff; }
  .youple-thumb[hidden] { display: none; }
  .youple-thumb span { overflow: hidden; text-overflow: ellipsis; }
  .youple-thumb img { width: 22px; height: 22px; border-radius: 6px; }
  .youple-send.is-floating { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; margin: 0; box-shadow: 0 4px 16px rgba(0,0,0,.35); }
`;
document.documentElement.append(style);

function idle() {
  button.disabled = false;
  label.textContent = roomName ? "Send to " + roomName : "Send to youple";
  button.title = roomName ? "Add this video to the playlist in " + roomName : "Open a youple.tv room first, then send videos to it";
}

function place() {
  if (!VIDEO_PAGE.test(location.pathname)) { button.remove(); return; }
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

// One shared thumbnail button, moved to whichever video thumbnail the mouse is over.
const thumb = document.createElement("button");
thumb.type = "button";
thumb.className = "youple-thumb";
thumb.hidden = true;
thumb.innerHTML = `<img alt="" src="${chrome.runtime.getURL("icons/32.png")}"><span></span>`;
const thumbLabel = thumb.querySelector("span");
let thumbLink = null, thumbBusy = false, thumbTimer;

function videoAnchor(target) {
  const link = target?.closest?.("a[href]");
  if (!link || !/^\/(watch\?|shorts\/|live\/)/.test(link.getAttribute("href").replace(/^https:\/\/www\.youtube\.com/, ""))) return null;
  const box = link.getBoundingClientRect();
  return box.width >= 120 && box.height >= 68 ? link : null; // a thumbnail or preview, not a title
}
function showThumb(link) {
  clearTimeout(thumbTimer);
  if (thumbBusy || (link === thumbLink && !thumb.hidden)) return;
  thumbLink = link;
  const box = link.getBoundingClientRect();
  thumb.style.left = box.left + 8 + "px";
  thumb.style.top = box.top + 8 + "px";
  thumbLabel.textContent = roomName ? "Send to " + roomName : "Send to youple";
  thumb.title = roomName ? "Add to the playlist in " + roomName : "Open a youple.tv room first, then send videos to it";
  if (!thumb.isConnected) document.body.append(thumb);
  thumb.hidden = false;
}
function hideThumb(now) {
  if (thumbBusy) return;
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => { thumb.hidden = true; thumbLink = null; }, now ? 0 : 150);
}
document.addEventListener("mouseover", event => {
  if (thumb.contains(event.target)) { clearTimeout(thumbTimer); return; }
  const link = videoAnchor(event.target);
  if (link) showThumb(link); else hideThumb();
}, true);
document.addEventListener("scroll", () => hideThumb(true), true);
thumb.addEventListener("click", async event => {
  event.preventDefault();
  event.stopPropagation();
  if (!thumbLink || thumbBusy) return;
  thumbBusy = true;
  thumbLabel.textContent = "Sending…";
  thumbLabel.textContent = await sendVideo(thumbLink.href);
  setTimeout(() => { thumbBusy = false; hideThumb(true); }, 1800);
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
idle();
place();
