// Appends the RoomDO class to the Astro-generated Cloudflare Worker bundle.
// Cloudflare Durable Object classes must be exported from the same module as
// the worker's fetch handler. Since @astrojs/cloudflare generates that bundle,
// we append our plain-JS DO class as a named export after the build.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const workerPath = join(root, "dist", "_worker.js", "index.js");
const doPath = join(root, "src", "lib", "room-do.js");

console.log("[post-build] Appending RoomDO to worker bundle...");

let workerCode, doCode;

try {
  workerCode = readFileSync(workerPath, "utf8");
} catch {
  console.error("[post-build] ERROR: Worker bundle not found at:", workerPath);
  console.error("[post-build] Run 'astro build' first.");
  process.exit(1);
}

try {
  doCode = readFileSync(doPath, "utf8");
} catch {
  console.error("[post-build] ERROR: RoomDO source not found at:", doPath);
  process.exit(1);
}

// Guard against running twice (e.g., if build script is called repeatedly)
if (workerCode.includes("class RoomDO")) {
  console.log("[post-build] RoomDO already present in bundle — skipping.");
  process.exit(0);
}

const combined = workerCode + "\n\n// === RoomDO — appended by scripts/post-build.mjs ===\n" + doCode + "\n";

writeFileSync(workerPath, combined, "utf8");
console.log(`[post-build] Done. Bundle size: ${combined.length} bytes.`);
