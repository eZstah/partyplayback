// Checks every record on the Aquarium music shelf against YouTube's oEmbed
// endpoint, which answers only for videos that exist and allow embedding.
// Run: node scripts/check-records.mjs   (or npm run check:records)
import { MUSIC_MIXES } from '../src/scripts/music-shelf.js';

let bad = 0, unknown = 0;
for (const mix of MUSIC_MIXES) {
  for (const video of mix.videos) {
    const url = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + video.id);
    let verdict;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (response.ok) { const data = await response.json(); verdict = `ok    ${data.author_name} · ${data.title}`; }
      else if (response.status === 401) { bad++; verdict = 'BLOCK embedding is disabled'; }
      else if (response.status === 400 || response.status === 404) { bad++; verdict = 'GONE  removed or private'; }
      else { unknown++; verdict = `?     could not check (HTTP ${response.status})`; }
    } catch (error) { unknown++; verdict = '?     could not check (' + error.message + ')'; }
    console.log(`${mix.label.padEnd(8)} ${video.id}  ${verdict}`);
  }
}
if (bad) console.log(`\n${bad} record video(s) need replacing in src/scripts/music-shelf.js.`);
if (unknown) console.log(`\n${unknown} video(s) could not be checked from this network.`);
if (!bad && !unknown) console.log('\nAll record videos can be embedded.');
process.exitCode = bad || unknown ? 1 : 0;
