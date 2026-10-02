// Illustrative activity, not measured viewers. Shared clock-based values keep
// the preview stable across refreshes and clients without random jumps.
export function illustrativeSyncCount(now = Date.now()) {
  const minutes = now / 60000;
  const count = 51 + 25 * Math.sin(minutes / 240) + 12 * Math.sin(minutes / 73) + 3 * Math.sin(minutes / 19);
  return Math.max(10, Math.min(100, Math.round(count)));
}
