import { videoDownscale } from "./share-video-quality.js";

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// Normalized rectangles keep the selector independent of its on-screen size.
export function clampCrop(rect) {
  const width = clamp(rect.width, 0.05, 1), height = clamp(rect.height, 0.05, 1);
  return { x: clamp(rect.x, 0, 1 - width), y: clamp(rect.y, 0, 1 - height), width, height };
}

export function centeredCrop(width, height, ratio = 9 / 16) {
  const h = Math.min(0.9, width * 0.9 / ratio / height);
  const w = h * height * ratio / width;
  return { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h };
}

// Round inward: no pixels outside the selected rectangle enter the output.
export function cropPixels(rect, width, height) {
  const r = clampCrop(rect);
  const x = Math.ceil(r.x * width), y = Math.ceil(r.y * height);
  const w = Math.max(1, Math.floor((r.x + r.width) * width) - x);
  const h = Math.max(1, Math.floor((r.y + r.height) * height) - y);
  const scale = 1 / videoDownscale(w, h);
  return { x, y, width: w, height: h, outputWidth: Math.max(2, Math.floor(w * scale / 2) * 2), outputHeight: Math.max(2, Math.floor(h * scale / 2) * 2) };
}
