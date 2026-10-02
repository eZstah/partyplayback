export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const active = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("aria-label", "Room link");
  field.style.cssText = "position:fixed;left:-9999px;top:0";
  const root = document.querySelector("dialog[open]") || document.fullscreenElement || document.body;
  root.append(field);
  try { field.select(); return document.execCommand("copy"); }
  catch { return false; }
  finally { field.remove(); active?.focus({ preventScroll: true }); }
}

export function beginInviteCopy() {
  let resolveContent, rejectContent, pending = Promise.resolve(false), finished = false;
  // Start the clipboard transaction in the click/submit gesture. Safari needs
  // this even though the new room URL only arrives after the server responds.
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    const content = new Promise((resolve, reject) => { resolveContent = resolve; rejectContent = reject; });
    content.catch(() => {});
    try {
      pending = navigator.clipboard.write([new ClipboardItem({ "text/plain": content })]).then(() => true, () => false);
    } catch {}
  }
  return {
    async complete(path) {
      if (finished) return false;
      finished = true;
      if (typeof path !== "string" || !/^\/room\/[a-zA-Z0-9_-]{1,64}$/.test(path)) {
        rejectContent?.(new Error("Invalid room URL"));
        return false;
      }
      const link = location.origin + path;
      resolveContent?.(new Blob([link], { type: "text/plain" }));
      if (await pending) return true;
      return copyText(link);
    },
    cancel() {
      if (finished) return;
      finished = true;
      rejectContent?.(new Error("Room creation did not complete"));
    },
  };
}

export function takeCreatedRoomNotice() {
  try {
    const notice = JSON.parse(sessionStorage.getItem("youple-created-room"));
    sessionStorage.removeItem("youple-created-room");
    const age = Date.now() - notice?.at;
    if (notice?.url === location.pathname && Number.isFinite(age) && age >= 0 && age <= 15000) return { copied: notice.copied === true };
  } catch {}
  return null;
}
