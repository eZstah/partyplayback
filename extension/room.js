// Runs on youple.tv room pages: remembers the room and passes videos into it.
const name = document.querySelector(".room-name h1")?.textContent?.trim()
  || document.title.replace(/ — youple\.tv$/, "");
chrome.storage.local.set({ lastRoom: { url: location.origin + location.pathname, name } });

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "add" || typeof message.url !== "string") return;
  window.postMessage({ source: "youple-extension", type: "add", url: message.url }, location.origin);
  reply({ ok: true });
});
