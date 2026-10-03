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

export async function playlistLink(input, clipboard) {
  const value = input.value.trim();
  if (value) return { value, fromClipboard: false };
  let copied;
  try { copied = await clipboard?.readText?.(); } catch {}
  // A permission prompt can stay open while the viewer starts typing.
  const current = input.value.trim();
  if (current) return { value: current, fromClipboard: false };
  const url = youtubeUrl(copied);
  return url ? { value: url, fromClipboard: true } : null;
}

// The youple browser extension (extension/) posts videos into an open room tab.
export function extensionVideo(event, page) {
  if (event.source !== page || event.origin !== page.location.origin) return null;
  const data = event.data;
  return data?.source === "youple-extension" && data.type === "add" ? youtubeUrl(data.url) : null;
}
