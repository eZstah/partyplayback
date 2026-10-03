import { videoLink } from "./video.js";

const YOUTUBE_LINKS = ["*://*.youtube.com/watch*", "*://*.youtube.com/shorts/*", "*://*.youtube.com/live/*", "*://youtu.be/*"];

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: "send", title: "Send to youple.tv room", contexts: ["link"], targetUrlPatterns: YOUTUBE_LINKS });
  chrome.contextMenus.create({ id: "send-page", title: "Send this video to youple.tv room", contexts: ["page", "video"], documentUrlPatterns: YOUTUBE_LINKS });
  showRoom();
});
chrome.runtime.onStartup.addListener(showRoom);
chrome.storage.onChanged.addListener(changes => { if (changes.lastRoom) showRoom(); });

// The button on YouTube pages (youtube.js).
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "send") send(message.url, message.room).then(reply, () => reply("failed"));
  else if (message?.type === "rooms") recentRooms().then(reply, () => reply([]));
  else if (message?.type === "forget") forget(message.room).then(reply, () => reply([]));
  else return;
  return true;
});

// Rooms opened recently, newest first, marking the ones open in a tab right now.
async function recentRooms() {
  const { rooms = [], lastRoom } = await chrome.storage.local.get(["rooms", "lastRoom"]);
  const list = rooms.length ? rooms : lastRoom ? [lastRoom] : [];
  return Promise.all(list.map(async room => ({ ...room, open: (await chrome.tabs.query({ url: room.url + "*" })).length > 0 })));
}

async function forget(url) {
  const { rooms = [], lastRoom } = await chrome.storage.local.get(["rooms", "lastRoom"]);
  const left = rooms.filter(room => room.url !== url);
  await chrome.storage.local.set({ rooms: left, lastRoom: lastRoom?.url === url ? left[0] || null : lastRoom });
  return recentRooms();
}
chrome.contextMenus.onClicked.addListener((info, tab) => send(info.menuItemId === "send" ? info.linkUrl : tab?.url));

async function showRoom() {
  const { lastRoom } = await chrome.storage.local.get("lastRoom");
  const name = lastRoom ? lastRoom.name || "your youple.tv room" : null;
  chrome.action.setTitle({ title: name ? "Send to " + name : "Send to youple.tv" });
  chrome.contextMenus.update("send", { title: name ? "Send to " + name : "Send to youple.tv room" }).catch(() => {});
  chrome.contextMenus.update("send-page", { title: name ? "Send this video to " + name : "Send this video to youple.tv room" }).catch(() => {});
}

async function send(value, room) {
  const result = await deliver(value, room);
  if (result === "no-video") flash("?", "#8a8494", "Open a YouTube video first");
  else if (result !== "no-room") flash("✓", "#4f9d69", "Sent to your youple.tv room");
  return result;
}

async function deliver(value, room) {
  const url = videoLink(value || "");
  if (!url) return "no-video";
  const { lastRoom, rooms = [] } = await chrome.storage.local.get(["lastRoom", "rooms"]);
  // Only rooms the extension saw opened can be picked.
  const target = rooms.find(saved => saved.url === room) || lastRoom;
  if (!target) {
    await chrome.tabs.create({ url: "https://youple.tv/" });
    return "no-room";
  }
  // An open room tab adds the video without reloading; otherwise open the room with it.
  for (const tab of await chrome.tabs.query({ url: target.url + "*" })) {
    try {
      const answer = await chrome.tabs.sendMessage(tab.id, { type: "add", url });
      if (answer?.ok) return "sent";
    } catch {}
  }
  await chrome.tabs.create({ url: target.url + "?add=" + encodeURIComponent(url), active: false });
  return "opened";
}

function flash(text, color, title) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  chrome.action.setTitle({ title });
  setTimeout(() => { chrome.action.setBadgeText({ text: "" }); showRoom(); }, 2500);
}
