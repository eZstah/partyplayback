import { videoLink } from "./video.js";

const $ = id => document.getElementById(id);
const sendButton = $("send"), status = $("status");
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const video = videoLink(tab?.url || "");
let rooms = await chrome.runtime.sendMessage({ type: "rooms" });
let { lastRoom } = await chrome.storage.local.get("lastRoom");
let chosen = rooms.find(room => room.url === lastRoom?.url)?.url || rooms[0]?.url;

if (video) {
  $("video").hidden = false;
  $("video-thumb").src = "https://i.ytimg.com/vi/" + new URL(video).searchParams.get("v") + "/mqdefault.jpg";
  $("video-title").textContent = (tab.title || "").replace(/^\(\d+\)\s*/, "").replace(/ - YouTube$/, "") || "This video";
} else $("no-video").hidden = false;

function render() {
  $("rooms-section").hidden = !rooms.length;
  $("empty").hidden = !!rooms.length;
  $("rooms").replaceChildren(...rooms.map(room => {
    const item = document.createElement("li");
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "room";
    pick.setAttribute("role", "radio");
    pick.setAttribute("aria-checked", String(room.url === chosen));
    pick.innerHTML = `<span class="dot"></span><span class="name"></span>${room.open ? '<span class="open">open</span>' : ""}`;
    pick.querySelector(".name").textContent = room.name || "Room";
    pick.title = room.open ? "Open in a tab" : "Opens in a background tab when you send";
    pick.addEventListener("click", () => {
      chosen = room.url;
      chrome.storage.local.set({ lastRoom: { url: room.url, name: room.name } });
      render();
    });
    const forget = document.createElement("button");
    forget.type = "button";
    forget.className = "forget";
    forget.textContent = "×";
    forget.title = forget.ariaLabel = "Remove " + (room.name || "room") + " from this list";
    forget.addEventListener("click", async () => {
      rooms = await chrome.runtime.sendMessage({ type: "forget", room: room.url });
      if (chosen === room.url) chosen = rooms[0]?.url;
      render();
    });
    item.append(pick, forget);
    return item;
  }));
  const room = rooms.find(room => room.url === chosen);
  sendButton.hidden = !video || !room;
  sendButton.textContent = room ? "Send to " + (room.name || "room") : "";
}

sendButton.addEventListener("click", async () => {
  sendButton.disabled = true;
  status.classList.remove("is-error");
  status.textContent = "Sending…";
  const result = await chrome.runtime.sendMessage({ type: "send", url: video, room: chosen }).catch(() => "failed");
  const name = rooms.find(room => room.url === chosen)?.name || "your room";
  if (result === "sent" || result === "opened") {
    status.textContent = result === "sent" ? "Added to " + name + " ✓" : "Added. " + name + " opened in a new tab ✓";
    setTimeout(() => window.close(), 1400);
  } else {
    status.classList.add("is-error");
    status.textContent = "Couldn't send it. Try again.";
    sendButton.disabled = false;
  }
});

render();
