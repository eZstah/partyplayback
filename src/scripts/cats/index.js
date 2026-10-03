import { bootCats } from './world.js';

// Page adapters depend on this boundary. The rig and world can evolve behind it.
export const BEAN_ENGINE_VERSION = '1.0.0-rc.1';
export function mountBean(options) {
  const world = bootCats(options);
  return Object.freeze({
    version: BEAN_ENGINE_VERSION,
    observe: world.observe,
    linkError: world.linkError,
    inviteCopied: world.inviteCopied,
    greet: world.greet,
    treat: world.treat,
    laser: world.laser,
    aquarium: world.aquarium,
    calm: world.calm,
    snapshot: world.snapshot,
    destroy: world.destroy,
  });
}
