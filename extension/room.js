// Runs on youple.tv room pages: remembers the room and passes videos into it.
const name = document.querySelector(".room-name h1")?.textContent?.trim()
  || document.title.replace(/ — youple\.tv$/, "");
const room = { url: location.origin + location.pathname, name };
chrome.storage.local.get("rooms").then(({ rooms = [] }) => chrome.storage.local.set({
  lastRoom: room,
  rooms: [room, ...rooms.filter(saved => saved.url !== room.url)].slice(0, 8),
}));

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "add" || typeof message.url !== "string") return;
  window.postMessage({ source: "youple-extension", type: "add", url: message.url }, location.origin);
  reply({ ok: true });
});
