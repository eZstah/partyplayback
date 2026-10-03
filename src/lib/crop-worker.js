import { cropPixels } from "./crop-geometry.js";

// Frame arrival drives this worker. No animation frames or background-tab timers.
self.onmessage = async ({ data: { readable, writable, rect, width, height } }) => {
  const crop = cropPixels(rect, width, height);
  const canvas = new OffscreenCanvas(crop.outputWidth, crop.outputHeight);
  const context = canvas.getContext("2d", { alpha: false });
  let ready = false;
  try {
    await readable.pipeThrough(new TransformStream({
      transform(frame, controller) {
        try {
          // A resized source can move private content into the old rectangle.
          if (frame.displayWidth !== width || frame.displayHeight !== height) {
            throw new Error("The shared tab changed size. Share again to select the video area.");
          }
          context.drawImage(frame, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
          controller.enqueue(new VideoFrame(canvas, { timestamp: frame.timestamp }));
          if (!ready) { ready = true; self.postMessage({ type: "ready" }); }
        } finally { frame.close(); }
      },
    // The parent owns track shutdown so it can show a useful error first.
    })).pipeTo(writable, { preventClose: true, preventAbort: true });
    self.postMessage({ type: "ended" });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message || "The video area could not be shared. Try sharing again." });
  }
};
