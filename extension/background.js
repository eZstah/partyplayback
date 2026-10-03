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

chrome.action.onClicked.addListener(tab => send(tab.url));
chrome.contextMenus.onClicked.addListener((info, tab) => send(info.menuItemId === "send" ? info.linkUrl : tab?.url));

async function showRoom() {
  const { lastRoom } = await chrome.storage.local.get("lastRoom");
  const name = lastRoom ? lastRoom.name || "your youple.tv room" : null;
  chrome.action.setTitle({ title: name ? "Send this video to " + name : "Open a youple.tv room first" });
  chrome.contextMenus.update("send", { title: name ? "Send to " + name : "Send to youple.tv room" }).catch(() => {});
  chrome.contextMenus.update("send-page", { title: name ? "Send this video to " + name : "Send this video to youple.tv room" }).catch(() => {});
}

async function send(value) {
  const url = videoLink(value || "");
  if (!url) return flash("?", "#8a8494", "Open a YouTube video first");
  const { lastRoom } = await chrome.storage.local.get("lastRoom");
  if (!lastRoom) {
    await chrome.tabs.create({ url: "https://youple.tv/" });
    return;
  }
  // An open room tab adds the video without reloading; otherwise open the room with it.
  for (const tab of await chrome.tabs.query({ url: lastRoom.url + "*" })) {
    try {
      const answer = await chrome.tabs.sendMessage(tab.id, { type: "add", url });
      if (answer?.ok) return flash("✓", "#4f9d69", "Sent to " + (lastRoom.name || "your room"));
    } catch {}
  }
  await chrome.tabs.create({ url: lastRoom.url + "?add=" + encodeURIComponent(url) });
}

function flash(text, color, title) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  chrome.action.setTitle({ title });
  setTimeout(() => { chrome.action.setBadgeText({ text: "" }); showRoom(); }, 2500);
}
