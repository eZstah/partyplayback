// Cursor releases use one ballistic trajectory, shared by hit selection and the
// rig. Coordinates are screen pixels; y and vy are positive towards the floor.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const MIN_DURATION = .08, MAX_DURATION = 2.4;

function descendingTime(y, vy, gravity, level) {
  const discriminant = vy * vy + 2 * gravity * (level - y);
  if (discriminant < 0) return null;
  const time = (Math.sqrt(discriminant) - vy) / gravity;
  return time >= 0 ? time : null;
}

/**
 * Plan a drop or throw without reading the DOM. Surface bounds describe usable
 * top edges; supply a non-null id to identify the selected landing to the world.
 * startX/startY are unchanged for in-bounds roots and normalize invalid/offscreen
 * inputs. Use them as the rig origin before applying the returned trajectory.
 */
export function planRelease(input = {}) {
  const options = input && typeof input === 'object' ? input : {};
  const scale = clamp(finite(options.scale, 1), .25, 4);
  const width = clamp(finite(options.width, 1280), 1, 16384);
  const floorY = clamp(finite(options.floorY, 720), 1, 16384);
  const edge = Math.min(28 * scale, width * .2);
  const startX = clamp(finite(options.x, width / 2), edge, width - edge);
  const startY = clamp(finite(options.y, floorY), 0, floorY);
  let vx = clamp(finite(options.vx, 0), -1400 * scale, 1400 * scale);
  let vy = clamp(finite(options.vy, 0), -1200 * scale, 1200 * scale);
  let gravity = 1600 * scale;

  // Keep the apex inside the scene. Increasing gravity only affects unusually
  // tall scenes, where an ordinary fall would otherwise occupy many seconds.
  const headroom = Math.max(0, startY - 18 * scale);
  vy = Math.max(vy, -Math.sqrt(2 * gravity * headroom));
  gravity = Math.max(gravity, 2 * (floorY - startY - vy * MAX_DURATION) / MAX_DURATION ** 2);
  let duration = descendingTime(startY, vy, gravity, floorY);

  // Cap horizontal speed once against the complete floor flight, then evaluate
  // every ledge with that same velocity. Clamping only the final target would
  // alter the path and could incorrectly pass through an earlier ledge.
  const boundTime = Math.max(MIN_DURATION, duration);
  vx = clamp(vx, (edge - startX) / boundTime, (width - edge - startX) / boundTime);
  let surfaceId = null, y = floorY;
  const surfaces = Array.isArray(options.surfaces) ? options.surfaces : [];
  for (const surface of surfaces) {
    if (!surface || surface.id == null || !Number.isFinite(surface.left) || !Number.isFinite(surface.right) || !Number.isFinite(surface.y)) continue;
    if (surface.right <= surface.left || surface.y < 0 || surface.y >= floorY) continue;
    const time = descendingTime(startY, vy, gravity, surface.y);
    if (time === null || time >= duration) continue;
    const x = startX + vx * time;
    if (x < Math.max(edge, surface.left) || x > Math.min(width - edge, surface.right)) continue;
    duration = time; y = surface.y; surfaceId = surface.id;
  }

  const x = startX + vx * duration;
  if (duration < MIN_DURATION) {
    // A paw already touching an edge still lands there. Give the rig a brief
    // settle without hopping upwards or tunnelling through that near surface.
    duration = MIN_DURATION;
    if (y >= startY) gravity = Math.min(gravity, 2 * (y - startY) / duration ** 2);
    vx = (x - startX) / duration;
    vy = (y - startY - .5 * gravity * duration ** 2) / duration;
  }
  const thrown = Math.abs(vx) > 180 * scale || vy < -180 * scale;
  const spin = thrown && duration >= .65 && (Math.abs(vx) > 350 * scale || vy < -350 * scale) ? Math.sign(vx || -vy) : 0;
  return { startX, startY, x, y, duration, vx, vy, gravity, surfaceId, thrown, spin };
}
