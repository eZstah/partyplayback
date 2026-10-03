import { centeredCrop, clampCrop, cropPixels } from "../lib/crop-geometry.js";

const aborted = () => new DOMException("Sharing cancelled", "AbortError");
export const canCrop = () => !!(window.MediaStreamTrackProcessor && window.MediaStreamTrackGenerator && window.VideoFrame && window.OffscreenCanvas && window.Worker);

export async function selectShareArea(source, signal, onError) {
  const $ = id => document.getElementById(id);
  const dialog = $("share-area-dialog"), preview = $("share-area-preview"), surface = $("share-area-surface"), box = $("share-area-box");
  const sourceTrack = source.getVideoTracks()[0];
  let worker, output, stopped = false, rejectPending, rect, width, height;
  const events = new AbortController();
  const listen = (el, event, fn) => el.addEventListener(event, fn, { signal: events.signal });
  function stop() {
    if (stopped) return;
    stopped = true;
    rejectPending?.(aborted());
    events.abort();
    signal.removeEventListener("abort", stop);
    worker?.terminate();
    output?.getTracks().forEach(track => track.stop());
    source.getTracks().forEach(track => track.stop());
    preview.srcObject = null;
    if (dialog.open) dialog.close();
  }
  function ended(message) {
    if (stopped) return;
    if (message) onError(message);
    const track = output?.getVideoTracks()[0];
    stop();
    // stop() itself does not emit ended; notify the room's capture lifecycle.
    track?.dispatchEvent(new Event("ended"));
  }
  signal.addEventListener("abort", stop, { once: true });
  listen(sourceTrack, "ended", () => ended());
  try {
    if (signal.aborted || sourceTrack.readyState === "ended") throw aborted();
    preview.srcObject = source;
    await new Promise((resolve, reject) => {
      rejectPending = reject;
      const timer = setTimeout(() => reject(new Error("The tab preview did not load. Try sharing again.")), 10000);
      const ready = () => { clearTimeout(timer); resolve(); };
      listen(preview, "loadedmetadata", ready);
      // Clear the wait on cancellation as well as success.
      rejectPending = error => { clearTimeout(timer); reject(error); };
      if (preview.readyState >= 1) ready();
    });
    if (stopped) throw aborted();
    await preview.play();
    width = preview.videoWidth; height = preview.videoHeight;
    rect = centeredCrop(width, height);
    surface.style.aspectRatio = `${width} / ${height}`;
    surface.style.maxWidth = `calc(max(180px, 100dvh - 340px) * ${width / height})`;
    function paint() {
      rect = clampCrop(rect);
      Object.assign(box.style, { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` });
      const crop = cropPixels(rect, width, height);
      $("share-area-size").textContent = `${crop.outputWidth} × ${crop.outputHeight}`;
    }
    let drag;
    listen(surface, "pointerdown", event => {
      if (event.button !== 0) return;
      const bounds = surface.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width, y = (event.clientY - bounds.top) / bounds.height;
      const mode = event.target.closest("[data-crop-resize]") ? "resize" : event.target.closest("#share-area-box") ? "move" : "draw";
      drag = { x, y, rect: { ...rect }, mode };
      surface.setPointerCapture(event.pointerId);
      box.focus(); event.preventDefault();
    });
    listen(surface, "pointermove", event => {
      if (!drag) return;
      const bounds = surface.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
      const dx = x - drag.x, dy = y - drag.y;
      rect = drag.mode === "move" ? { ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy }
        : drag.mode === "resize" ? { ...drag.rect, width: Math.min(1 - drag.rect.x, drag.rect.width + dx), height: Math.min(1 - drag.rect.y, drag.rect.height + dy) }
        : { x: Math.min(x, drag.x), y: Math.min(y, drag.y), width: Math.abs(dx), height: Math.abs(dy) };
      paint();
    });
    listen(surface, "pointerup", () => { drag = null; });
    listen(surface, "pointercancel", () => { drag = null; });
    listen(box, "keydown", event => {
      if (!event.key.startsWith("Arrow")) return;
      event.preventDefault();
      const axis = event.key === "ArrowLeft" || event.key === "ArrowRight" ? "x" : "y";
      const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -0.01 : 0.01;
      rect[event.shiftKey ? (axis === "x" ? "width" : "height") : axis] += delta;
      paint();
    });
    listen($("share-area-portrait"), "click", () => { rect = centeredCrop(width, height); paint(); });
    listen($("share-area-wide"), "click", () => { rect = centeredCrop(width, height, 16 / 9); paint(); });
    paint();
    const choice = new Promise((resolve, reject) => {
      rejectPending = reject;
      listen($("share-area-confirm"), "click", () => resolve("crop"));
      listen($("share-area-whole"), "click", () => resolve("whole"));
      listen(dialog, "cancel", event => { event.preventDefault(); reject(aborted()); });
      listen(dialog, "close", () => reject(aborted()));
      listen($("share-area-cancel"), "click", () => reject(aborted()));
    });
    dialog.showModal();
    const mode = await choice;
    dialog.close();
    preview.srcObject = null;
    if (stopped) throw aborted();
    if (mode === "whole") return { stream: source, stop };
    // Never attach the source video track to a peer. Only the cropped output.
    const processor = new MediaStreamTrackProcessor({ track: sourceTrack, maxBufferSize: 1 });
    const generator = new MediaStreamTrackGenerator({ kind: "video" });
    output = new MediaStream([generator, ...source.getAudioTracks()]);
    worker = new Worker(new URL("../lib/crop-worker.js", import.meta.url), { type: "module" });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Cropping could not start in this browser. Try desktop Chrome or Edge.")), 10000);
      rejectPending = error => { clearTimeout(timer); reject(error); };
      worker.onmessage = ({ data }) => {
        if (data.type === "ready") { clearTimeout(timer); rejectPending = null; resolve(); }
        else {
          const preparing = !!rejectPending;
          rejectPending?.(new Error(data.message || "Capture ended."));
          ended(preparing ? null : data.message);
        }
      };
      worker.onerror = () => {
        const preparing = !!rejectPending;
        rejectPending?.(new Error("Cropping could not start in this browser."));
        ended(preparing ? null : "Cropping stopped. Try sharing again.");
      };
      worker.postMessage({ readable: processor.readable, writable: generator.writable, rect, width, height }, [processor.readable, generator.writable]);
    });
    if (stopped) throw aborted();
    return { stream: output, stop };
  } catch (error) { stop(); throw error; }
}
