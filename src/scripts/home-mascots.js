import { bootCatSimulator } from './cat-simulator.js';

export const PERSONALITIES = {
  mint: {
    lines: ["Got a good video?", "I have 47 tabs open.", "Trust me, it's a banger.", "Skip the intro.", "One more video.", "Is this in 4K?"],
    dizzy: "WHY.", petted: "emotional support human.", wake: "you came back :')", cheer: "we are so back.", eager: "please press it.",
  },
  pink: {
    lines: ["I brought snacks.", "This song slaps.", "Turn it up!", "Popcorn?", "Snack break!", "Volume to 11."],
    dizzy: "brain buffering.", petted: "no thoughts. just cat.", wake: "did i miss the drama?", cheer: "this is cinema.", eager: "i'm ready to vibe.",
  },
  purple: {
    lines: ["waiting aggressively.", "the suspense. unbearable", "press play, human.", "i require cinema.", "one more. no excuses."],
    dizzy: "AAAAAAAA.", petted: "acceptable, human.", wake: "i blinked. that's all.", cheer: "LET'S GOOOO.", eager: "DO IT.",
  },
};

export function bootHomeMascots() { return bootCatSimulator(); }
