// A cat's inner life, kept free of DOM so it can be tested and reasoned about.
// Drives rise and fall with personality; choices are weighted, never scripted.
import { CAST, KINDS } from './cast.js';

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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

// Small seeded generator so tests (and replays) are deterministic.
export function rng(seed = Date.now()) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
export const pick = (list, random = Math.random) => list[Math.floor(random() * list.length) % list.length];

// Time-of-day rhythm: cats are crepuscular, sleepy mid-day and late at night.
export function dayRhythm(hour) {
  if (hour >= 23 || hour < 5) return { sleepy: 1.8, playful: .6, label: 'night' };
  if (hour < 9) return { sleepy: .7, playful: 1.5, label: 'morning' };
  if (hour >= 12 && hour < 16) return { sleepy: 1.3, playful: .9, label: 'afternoon' };
  if (hour >= 18) return { sleepy: .9, playful: 1.4, label: 'evening' };
  return { sleepy: 1, playful: 1, label: 'day' };
}

const ACTIVITY_LABEL = {
  sleep: 'Sleeping', loaf: 'Loafing', sit: 'Sitting around', groom: 'Grooming', wander: 'Wandering', explore: 'Exploring up high',
  watch: 'Watching the video', dance: 'Dancing', zoomies: 'Has the zoomies', stalk: 'Stalking your cursor', approach: 'Coming to say hi',
  stare: 'Staring at you', visit: 'Visiting', chase: 'Chasing', flee: 'Running away', cuddle: 'Cuddling', hunt: 'Hunting a butterfly',
  laser: 'Chasing the red dot', treat: 'Going for the treat', follow: 'Following', stretch: 'Stretching', carried: 'Being carried',
  hiss: 'Hissing', wrestle: 'Play-fighting', beg: 'Asking for attention', react: 'Reacting', fall: 'Falling', greet: 'Saying hello',
  hide: 'Hiding', leave: 'Out exploring', glass: 'At the glass', knock: 'Knocking things over', annoyed: 'Annoyed',
};
export const activityLabel = (type, partner) => (ACTIVITY_LABEL[type] || 'Thinking') + (partner && ['visit', 'chase', 'flee', 'cuddle', 'follow', 'wrestle'].includes(type) ? ` ${CAST[partner].name}` : '');

export class Mind {
  constructor(kind, memory = {}, random = Math.random) {
    this.kind = kind; this.cast = CAST[kind]; this.t = this.cast.traits; this.random = random;
    const r = () => random() * 30;
    // Drives: 0 = satisfied, 100 = urgent.
    this.drives = { sleepy: 20 + r(), playful: 30 + r(), lonely: 20 + r(), curious: 30 + r(), hungry: 15 + r() };
    this.mood = { joy: .3, annoyance: 0, fear: 0 };
    this.trust = memory.trust ?? 30 + this.t.affection * 30;
    this.bonds = { ...defaultBonds(kind), ...(memory.bonds || {}) };
    this.stats = { pets: 0, boops: 0, carried: 0, treats: 0, ...(memory.stats || {}) };
    this.activity = 'sit'; this.partner = null; this.since = 0; this.last = []; this.petStreak = 0; this.lastSaid = '';
  }
  get label() { return activityLabel(this.activity, this.partner); }
  feelings() {
    const d = this.drives, out = [];
    if (this.mood.fear > .4) out.push('spooked');
    if (this.mood.annoyance > .45) out.push('annoyed');
    if (this.mood.joy > .65) out.push('delighted'); else if (this.mood.joy > .35) out.push('content');
    if (d.sleepy > 70) out.push('very sleepy'); else if (d.sleepy > 50) out.push('a bit sleepy');
    if (d.playful > 65) out.push('playful');
    if (d.hungry > 65) out.push('peckish');
    if (d.lonely > 65) out.push('lonely');
    if (d.curious > 70) out.push('nosy');
    return out.length ? out.slice(0, 3) : ['calm'];
  }
  tick(dt, ctx = {}) {
    const d = this.drives, t = this.t, day = ctx.day || dayRhythm(12), a = this.activity;
    const resting = a === 'sleep' || a === 'cuddle', lazing = a === 'loaf' || a === 'sit' || a === 'watch';
    const active = ['zoomies', 'chase', 'flee', 'laser', 'hunt', 'dance', 'wrestle', 'stalk'].includes(a);
    d.sleepy += dt * (resting ? -2.2 : (active ? .9 : lazing ? .12 : .3) * (.55 + t.lazy) * day.sleepy);
    d.playful += dt * (active ? -2.4 : resting ? .05 : .45 * (.3 + t.energy) * day.playful);
    d.lonely += dt * (ctx.nearFriend || ['cuddle', 'visit', 'glass', 'approach', 'stare'].includes(a) ? -1.5 : .35 * t.sociable);
    d.curious += dt * (['explore', 'wander', 'hunt', 'leave', 'hide', 'knock'].includes(a) ? -1.8 : .4 * (.25 + t.curiosity));
    d.hungry += dt * .05;
    for (const k in d) d[k] = clamp(d[k], 0, 100);
    const m = this.mood, decay = Math.exp(-dt / 9);
    m.joy = .25 + (m.joy - .25) * Math.exp(-dt / 30); m.annoyance *= decay; m.fear *= Math.exp(-dt / 4);
    this.since += dt;
    if (this.since > 10) this.petStreak = Math.max(0, this.petStreak - dt * .2);
  }
  // Score what to do next. ctx: { playing, vibe, day, cursor, laser, treat, critter, shelves, hideouts, toys, aquarium, reduced, calm, others }
  choose(ctx = {}) {
    const d = this.drives, t = this.t, others = ctx.others || [], random = this.random;
    const awake = others.filter(o => o.activity !== 'sleep' && o.activity !== 'cuddle' && o.activity !== 'carried');
    const sleepers = others.filter(o => o.activity === 'sleep' || o.activity === 'cuddle');
    const best = (list, f) => list.reduce((b, o) => (f(o) > (b ? f(b) : -Infinity) ? o : b), null);
    const friend = best(awake, o => this.bonds[o.kind] + random() * .3);
    const playmate = best(awake.filter(o => this.bonds[o.kind] > -.3), o => o.playful / 100 + this.bonds[o.kind]);
    const nap = best(sleepers.filter(o => this.bonds[o.kind] > .25), o => this.bonds[o.kind]);
    const motion = ctx.reduced ? 0 : 1, calm = ctx.calm;
    const scores = {
      sleep: d.sleepy * 1.1 + t.lazy * 25 + (calm ? 400 : 0) - (d.sleepy < 35 ? 60 : 0),
      cuddle: nap && d.sleepy > 40 ? 40 + d.sleepy * .5 + this.bonds[nap.kind] * 40 + t.sociable * 20 : 0,
      loaf: 18 + t.lazy * 30 + d.sleepy * .25,
      sit: 16 + t.lazy * 12,
      groom: 14 + (1 - t.mischief) * 14,
      stretch: d.sleepy < 30 && this.last[0] === 'sleep' ? 90 : 4,
      wander: 14 + d.curious * .35 + t.energy * 14,
      explore: ctx.shelves ? 10 + d.curious * .45 + t.bold * 18 + t.curiosity * 12 : 0,
      hide: ctx.hideouts ? (9 + t.mischief * 18 + (1 - t.bold) * 12 + t.curiosity * 8 + d.curious * .2) * (ctx.playing ? .35 : 1) : 0,
      leave: (12 + t.curiosity * 14 + t.energy * 10 + d.curious * .25 - t.affection * 6) * (ctx.playing ? .3 : 1),
      glass: ((ctx.aquarium ? 22 : 6) + t.curiosity * 12 + t.affection * 10 + d.lonely * .15) * motion * (ctx.playing ? .3 : 1),
      knock: ctx.toys ? Math.max(0, t.mischief * 44 + d.playful * .3 - 10) * motion : 0,
      watch: ctx.playing ? 52 + (this.kind === 'purple' ? 25 : 0) + (ctx.vibe === 'talk' && this.kind !== 'purple' ? -25 : 0) : 0,
      dance: ctx.playing && ctx.vibe === 'music' ? (d.playful * .6 + t.energy * 45 + (this.kind === 'pink' ? 30 : 0)) * motion : 0,
      zoomies: d.playful > 55 ? (d.playful * .6 + t.energy * 30 + (ctx.day?.label === 'morning' || ctx.day?.label === 'evening' ? 18 : 0)) * motion : 0,
      stalk: ctx.cursor ? (d.playful * .5 + t.mischief * 30 + t.bold * 10) * motion : 0,
      approach: ctx.cursor || ctx.aquarium ? t.affection * 24 + this.trust * .25 + d.lonely * .2 : 0,
      stare: (ctx.aquarium ? 24 : 9) + t.curiosity * 10,
      visit: friend ? d.lonely * .7 + t.sociable * 22 + this.bonds[friend.kind] * 15 : 0,
      chase: playmate ? (d.playful * .55 + t.mischief * 26 + this.bonds[playmate.kind] * 10) * motion : 0,
      hunt: ctx.critter ? (40 + d.curious * .3 + d.playful * .35 + t.bold * 15) * motion : 0,
      laser: ctx.laser ? (95 + d.playful * .3 - t.grumpy * 70) * (motion || .3) : 0,
      treat: ctx.treat ? 110 + d.hungry * .6 : 0,
      follow: this.kind === 'black' && awake.length ? 26 + this.bonds.pink * 25 : 0,
    };
    if (calm) for (const k in scores) if (k !== 'sleep' && k !== 'cuddle' && k !== 'treat') scores[k] *= .1;
    const recent = new Set(this.last.slice(0, 2));
    let top = null, topScore = -Infinity;
    for (const [type, score] of Object.entries(scores)) {
      if (score <= 0) continue;
      const repeat = recent.has(type) && !['sleep', 'watch', 'laser', 'treat', 'hunt'].includes(type) ? .45 : 1;
      const s = score * repeat + random() * 22;
      if (s > topScore) { topScore = s; top = type; }
    }
    const partner = top === 'visit' || top === 'follow' ? friend?.kind : top === 'chase' ? playmate?.kind : top === 'cuddle' ? nap?.kind : null;
    return { type: top || 'sit', partner: partner || null };
  }
  begin(type, partner = null) {
    if (this.activity !== type) { this.last.unshift(this.activity); this.last.length = Math.min(this.last.length, 4); }
    this.activity = type; this.partner = partner; this.since = 0;
  }
  // Interactions with the viewer. Return how the cat takes it.
  pet() {
    this.stats.pets++; this.petStreak++; this.drives.lonely = Math.max(0, this.drives.lonely - 20);
    const limit = 2 + Math.round((1 - this.t.grumpy) * 6 + this.trust / 25);
    if (this.petStreak > limit) { this.mood.annoyance = clamp(this.mood.annoyance + .5, 0, 1); this.petStreak = limit - 2; return 'enough'; }
    this.trust = clamp(this.trust + 2.5 * (.4 + this.t.affection), 0, 100); this.mood.joy = clamp(this.mood.joy + .25, 0, 1);
    return 'purr';
  }
  boop() {
    this.stats.boops++;
    if (this.t.grumpy > .6 && this.random() > this.trust / 120) { this.mood.annoyance = clamp(this.mood.annoyance + .35, 0, 1); return 'annoyed'; }
    if (this.t.mischief > .7) { this.drives.playful = clamp(this.drives.playful + 25, 0, 100); return 'playful'; }
    this.trust = clamp(this.trust + 1, 0, 100); this.mood.joy = clamp(this.mood.joy + .2, 0, 1); return 'happy';
  }
  carried() { this.stats.carried++; this.trust = clamp(this.trust - (this.t.grumpy > .5 ? 3 : 0), 0, 100); this.mood.fear = this.t.bold < .5 ? .4 : 0; }
  ate() { this.stats.treats++; this.drives.hungry = 0; this.trust = clamp(this.trust + 6, 0, 100); this.mood.joy = clamp(this.mood.joy + .4, 0, 1); }
  startle(amount = .6) { this.mood.fear = clamp(this.mood.fear + amount * (1.2 - this.t.bold), 0, 1); this.trust = clamp(this.trust - 1, 0, 100); }
  bond(kind, delta) { this.bonds[kind] = clamp((this.bonds[kind] ?? 0) + delta, -1, 1); }
  // Pick something to say for a situation, never the same line twice running.
  line(key) {
    const lines = this.cast.voice[key];
    if (!lines?.length) return null;
    const options = lines.length > 1 ? lines.filter(l => l !== this.lastSaid) : lines;
    return (this.lastSaid = pick(options, this.random));
  }
  memory() { return { trust: Math.round(this.trust * 10) / 10, bonds: this.bonds, stats: this.stats }; }
}

// Starting relationships give the cast its dynamics: Mochi teases Pixel, Bean idolises Mochi.
export function defaultBonds(kind) {
  const table = {
    mint: { pink: .35, purple: .45, black: .8 },
    pink: { mint: .3, purple: -.15, black: .55 },
    purple: { mint: .5, pink: -.35, black: .1 },
    black: { mint: .75, pink: .9, purple: .3 },
  };
  return Object.fromEntries(KINDS.filter(k => k !== kind).map(k => [k, table[kind]?.[k] ?? 0]));
}

// What the cats did while the tab was hidden, as a short journal line.
export function awaySummary(minds, seconds, random = Math.random) {
  if (seconds < 45) return null;
  const mins = Math.round(seconds / 60), span = mins < 2 ? 'a minute' : mins < 90 ? `${mins} minutes` : `${Math.round(mins / 60)} hours`;
  const names = minds.map(m => m.cast.name);
  const events = [
    `${pick(names, random)} slept through most of it`, `${names[1]} knocked something off a shelf`,
    `${names[3] || names[0]} followed ${names[1]} everywhere`, `${names[2]} held a staring contest with the wall and won`,
    `${names[0]} groomed everyone, whether they liked it or not`, `${names[1]} and ${names[3] || names[2]} chased each other twice`,
  ];
  const a = pick(events, random); let b = pick(events, random);
  if (b === a) b = events[(events.indexOf(a) + 1) % events.length];
  return `You were away ${span}. ${a}, and ${b}.`;
}
