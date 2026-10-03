// The mood of Bean's room in Aquarium: the window follows the visitor's own time
// of day, and the weather drifts between clear, cloudy and rainy now and then.
// Pure helpers plus a small mount that only sets data attributes; the look lives
// in cat-habitat.css.

export const DAYPARTS = ['night', 'dawn', 'day', 'dusk'];
export const WEATHERS = ['clear', 'clouds', 'rain'];
const WEATHER_ODDS = { clear: .5, clouds: .3, rain: .2 };

export function dayPart(hour) {
  if (hour >= 21 || hour < 5) return 'night';
  if (hour < 8) return 'dawn';
  if (hour < 17) return 'day';
  return 'dusk';
}

// The next weather, never the same as now, so a change is always visible.
export function nextWeather(current, random = Math.random) {
  const options = WEATHERS.filter(w => w !== current);
  const total = options.reduce((sum, w) => sum + WEATHER_ODDS[w], 0);
  let roll = random() * total;
  for (const w of options) { roll -= WEATHER_ODDS[w]; if (roll < 0) return w; }
  return options[options.length - 1];
}

// Seconds until the weather changes: long enough to settle into, 6 to 14 minutes.
export const weatherSpell = (random = Math.random) => 360 + random() * 480;

// ?scene=night or ?scene=dusk,rain pins the look, for screenshots and checks.
export function sceneOverride(search = '') {
  const value = new URLSearchParams(search).get('scene');
  if (!value) return {};
  const parts = value.split(',');
  return { daypart: parts.find(p => DAYPARTS.includes(p)), weather: parts.find(p => WEATHERS.includes(p)) };
}

export function mountScene(el, { now = () => new Date(), random = Math.random,
  schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id),
  search = typeof location === 'undefined' ? '' : location.search } = {}) {
  const pinned = sceneOverride(search);
  let weather = pinned.weather || (random() < WEATHER_ODDS.clear ? 'clear' : nextWeather('clear', random));
  let clockTimer = null, weatherTimer = null, stopped = false;
  const apply = () => {
    el.dataset.daypart = pinned.daypart || dayPart(now().getHours());
    el.dataset.weather = weather;
  };
  const tick = () => { if (stopped) return; apply(); clockTimer = schedule(tick, 60_000); };
  const change = () => {
    if (stopped) return;
    weather = nextWeather(weather, random); apply();
    weatherTimer = schedule(change, weatherSpell(random) * 1000);
  };
  tick();
  if (!pinned.weather) weatherTimer = schedule(change, weatherSpell(random) * 1000);
  return {
    get state() { return { daypart: el.dataset.daypart, weather: el.dataset.weather }; },
    stop() { stopped = true; cancel(clockTimer); cancel(weatherTimer); },
  };
}
