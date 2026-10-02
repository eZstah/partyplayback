export function youtubeUrl(value) {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    let id;
    if (url.hostname === "youtu.be") id = url.pathname.slice(1);
    else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
      id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/)?.[1];
    }
    return typeof id === "string" && /^[\w-]{11}$/.test(id) ? "https://www.youtube.com/watch?v=" + id : null;
  } catch { return null; }
}

export function pastedVideo(event, dialogOpen = false) {
  if (event.defaultPrevented || dialogOpen) return null;
  const field = event.target?.closest?.("input,textarea,select,[contenteditable]:not([contenteditable=false])");
  if (field && !(field.tagName === "INPUT" && field.type === "range")) return null;
  return youtubeUrl(event.clipboardData?.getData("text/plain"));
}
