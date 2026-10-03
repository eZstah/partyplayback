// Mirrors youtubeUrl() in src/scripts/room-paste.js; the room checks again.
const HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"];

export function videoLink(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    let id;
    if (url.hostname === "youtu.be") id = url.pathname.slice(1);
    else if (HOSTS.includes(url.hostname)) {
      id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/)?.[1];
    }
    return typeof id === "string" && /^[\w-]{11}$/.test(id) ? "https://www.youtube.com/watch?v=" + id : null;
  } catch { return null; }
}
