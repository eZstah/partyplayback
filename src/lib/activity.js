// Illustrative activity, not measured viewers. Shared clock-based values keep
// the preview stable across refreshes and clients without random jumps.
export function illustrativeSyncCount(now = Date.now()) {
  const minutes = now / 60000;
  const count = 27.5 + 14 * Math.sin(minutes / 240) + 7 * Math.sin(minutes / 73) + 1.5 * Math.sin(minutes / 19);
  return Math.max(5, Math.min(50, Math.round(count)));
}
