import { clamp } from './mascot-motion.js';

// Personality and motivation are separate from rendering. No video/audio access
// is inferred: classification is a conservative title hint, or a viewer choice.
export const CAST = {
  mint: { name: 'Miso', role: 'The caretaker', motive: 'Keeps the room, and the others, together.', energy: 65, courage: .25 },
  pink: { name: 'Mochi', role: 'The instigator', motive: 'Every screen is a stage. Every cursor is prey.', energy: 95, courage: .95 },
  purple: { name: 'Pixel', role: 'The critic', motive: 'Needs excellent cinema. And personal space.', energy: 48, courage: .6 },
};
export const VIDEO_VIBES = ['auto', 'music', 'chill', 'talk', 'action'];
export function videoVibe(title = '', override = 'auto') {
  if (VIDEO_VIBES.includes(override) && override !== 'auto') return { kind: override, source: 'Your choice' };
  const text = String(title).toLowerCase();
  const rules = [
    ['chill', /\b(lofi|lo-fi|ambient|sleep|relax|meditation|asmr|rain sounds|peaceful)\b/],
    ['music', /\b(music|song|concert|remix|official video|official audio|lyrics?|dj|dance|techno|edm|live set|performance)\b/],
    ['talk', /\b(podcast|lecture|interview|tutorial|explained|documentary|discussion|seminar)\b/],
    ['action', /\b(trailer|gaming|gameplay|speedrun|battle|action|fight|highlights)\b/],
  ];
  return { kind: rules.find(([, pattern]) => pattern.test(text))?.[0] || 'unknown', source: title ? 'Video title hint' : 'No video yet' };
}

export class CatDirector {
  constructor() {
    this.cats = Object.fromEntries(Object.entries(CAST).map(([kind, cat]) => [kind, { energy: cat.energy, trust: 50, boredom: 0, status: 'Settling in' }]));
    this.history = []; this.cooldowns = new Map(); this.time = 0; this.tension = 0; this.lastStory = '';
    this.context = { playing: false, vibe: 'unknown', intensity: 'play', wallpaper: false };
  }
  advance(seconds) {
    const dt = clamp(seconds, 0, 1); this.time += dt;
    for (const [kind, cat] of Object.entries(this.cats)) {
      const resting = cat.status === 'Napping';
      cat.energy = clamp(cat.energy + dt * (resting ? 2.1 : this.context.playing && this.context.vibe === 'music' ? -.3 : -.07), 0, 100);
      cat.boredom = clamp(cat.boredom + dt * (this.context.playing && this.context.vibe === 'talk' ? (kind === 'purple' ? 1.1 : .23) : -.65), 0, 100);
    }
    this.tension = clamp(this.tension - dt * .07, 0, 100);
  }
  pet(kind) { const cat = this.cats[kind]; cat.trust = clamp(cat.trust + 8, 0, 100); cat.boredom = Math.max(0, cat.boredom - 15); }
  record(story) {
    this.lastStory = story; this.history.push(story); this.history = this.history.slice(-8);
    const delays = { peek: 65, squabble: 65, mischief: 100, leave: 100, nap: 45, dance: 16, snack: 40, patrol: 20 };
    this.cooldowns.set(story, this.time + (delays[story] || 30));
    if (story === 'dance') this.cats.pink.energy = Math.max(0, this.cats.pink.energy - 12);
    if (story === 'squabble') { this.tension = 0; this.cats.pink.energy = Math.max(0, this.cats.pink.energy - 15); }
    if (story === 'snack') { this.cats.pink.energy = Math.min(100, this.cats.pink.energy + 15); this.tension += 22; }
    if (story === 'leave') this.cats.purple.boredom = 0;
    if (story === 'patrol') this.tension += 12;
  }
  choose() {
    const { playing, vibe, intensity, wallpaper } = this.context;
    const c = this.cats;
    const choices = [
      ['nap', (100 - Math.min(...Object.values(c).map(cat => cat.energy))) * .8 + (vibe === 'chill' && playing ? 70 : 0)],
      ['dance', playing && vibe === 'music' ? c.pink.energy + 45 : 0],
      ['leave', c.purple.boredom > 45 ? c.purple.boredom + 35 : 0],
      ['squabble', intensity !== 'watch' ? this.tension + (vibe === 'action' && playing ? 65 : 8) : 0],
      ['mischief', intensity === 'chaos' ? 64 + c.pink.energy * .25 : 0],
      ['peek', intensity !== 'watch' || wallpaper ? 42 : 0],
      ['snack', 25 + (100 - c.pink.energy) * .55],
      ['patrol', 35],
    ];
    return choices.filter(([name, score]) => score > 0 && name !== this.lastStory && this.time >= (this.cooldowns.get(name) || 0))
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
}

// An owned sequence clock. Interrupting a story drops all future beats at once;
// a background tab never catches up by firing a backlog on its next frame.
export class StoryClock {
  constructor() { this.current = null; this.serial = 0; }
  start(name, now, beats, duration, priority = 30) {
    if (this.current && this.current.priority > priority) return false;
    this.current = { id: ++this.serial, name, start: now, beats: [...beats].sort((a, b) => a.at - b.at), duration, priority };
    return true;
  }
  tick(now) {
    const story = this.current;
    if (!story) return;
    while (this.current === story && story.beats.length && now - story.start >= story.beats[0].at) story.beats.shift().run();
    if (this.current === story && now - story.start >= story.duration) this.current = null;
  }
  clear() { this.current = null; this.serial++; }
}
