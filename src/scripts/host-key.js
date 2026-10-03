// The browser that creates a quick room keeps its host key, which lets it remove people there.
const prefix = "youple-host:";

export function saveHostKey(url, key) {
  const slug = typeof url === "string" ? url.match(/^\/room\/([a-zA-Z0-9_-]{1,64})$/)?.[1] : null;
  if (!slug || typeof key !== "string") return;
  try { localStorage.setItem(prefix + slug, key); } catch {}
}

export function hostKey(slug) {
  try { return localStorage.getItem(prefix + slug) || undefined; } catch { return undefined; }
}
