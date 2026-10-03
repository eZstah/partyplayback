// Each expression belongs to the same illustrated character in every state.
// CSS animates the SVG rig; reduced motion needs no fallback image.
export const CAT_NAMES = { mint: 'Miso', pink: 'Mochi', purple: 'Pixel', black: 'Bean' };
const shared = {
  eager: 'sparkle', happy: 'joy', surprised: 'scream', dizzy: 'dizzy',
  sleepy: 'sleepy', playing: 'watching', snack: 'snack', error: 'scream',
  annoyed: 'side-eye',
};
export const CAT_FACES = {
  mint: { ...shared, idle: 'pleading', paused: 'pleading' },
  pink: { ...shared, idle: 'watching', paused: 'pleading' },
  purple: { ...shared, idle: 'side-eye', paused: 'side-eye' },
  black: { ...shared, idle: 'watching', paused: 'watching' },
};

export function faceFor(kind, reaction = 'idle') {
  const faces = Object.hasOwn(CAT_FACES, kind) ? CAT_FACES[kind] : CAT_FACES.mint;
  return Object.hasOwn(faces, reaction) ? faces[reaction] : faces.idle;
}

export function showCatFace(mascot, reaction = 'idle') {
  mascot.dataset.reaction = reaction;
  // Repeated snapshots leave the rig alone instead of restarting animations.
  const face = faceFor(mascot.dataset.kind, reaction);
  if (mascot.dataset.face !== face) mascot.dataset.face = face;
}
