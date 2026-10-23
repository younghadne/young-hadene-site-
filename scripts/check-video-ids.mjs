// Fails if any blocklisted YouTube video ID (private/removed videos) appears in repo HTML/JS/JSON/XML.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const BLOCKED = {
  EG5myGjhc20: 'private (Nightmares)',
  manx5Ndea6s: 'private (Monster)',
  FxV9J8hhXoc: 'private (Cold Hands)',
  '7JernHdTQt8': 'private (Send Him Home)',
  NEAqzPCtt0c: 'private (Street Lights)',
  Ttp0RT7fP0s: 'deleted, embed 404 (Rise Again Short)',
  XHrnMZZgbOw: 'private/embedding off, embed 403 (Dis Ain\'t What U Want Short)',
  H1Cn9k671WE: 'private/embedding off, embed 403 (Controlla)',
  '0hNiNpkLZco': 'private/removed, oEmbed 403, thumbs 404 (Glitch In The Trap Short)',
  '68QBfCJhy7c': 'private/removed, oEmbed 403, thumbs 404 (Goldyard bag Short)',
  '6K6NmuhkTOY': 'private/removed, oEmbed 403, thumbs 404 (Controlla, Aug 2025 upload)',
  '7MS3QwYmnUE': 'private/removed, oEmbed 403, thumbs 404 (Cold Hands Short)',
  'CB5F6Alix_k': 'private/removed, oEmbed 403, thumbs 404 (Drip On My Walk, Oct 2025 upload)',
  'HWkmp3z8xu0': 'private/removed, oEmbed 403, thumbs 404 (Loud Pack, May 2026 upload)',
  'N-13ZEAU5HM': 'private/removed, oEmbed 403, thumbs 404 (10 Feet, Oct 2025 upload)',
  'VvRWojKnhMY': 'private/removed, oEmbed 403, thumbs 404 (Action Line)',
  'YZU_GtOZ77o': 'private/removed, oEmbed 403, thumbs 404 (By My Side Remix Short, clip 2)',
  'eloQ9DseIPg': 'private/removed, oEmbed 403, thumbs 404 (Are You Dumb, Oct 2025 upload)',
  'g-1J_gwKLVI': 'private/removed, oEmbed 403, thumbs 404 (Cold Hands Short, clip 3)',
  'g1qU_HG98-s': 'private/removed, oEmbed 403, thumbs 404 (10 Feet)',
  'qHRO9r97xCA': 'private/removed, oEmbed 403, thumbs 404 (Cold Hands Short, clip 2)',
  'qMz8Re2Pcxg': 'private/removed, oEmbed 403, thumbs 404 (Young Hadene x Young Tory)',
  'sTNU1C-0HhE': 'private/removed, oEmbed 403, thumbs 404 (Cold Hands, Mar 2026 upload)',
  'shpsG6HSWHg': 'private/removed, oEmbed 403, thumbs 404 (Goldyard bag Short, clip 2)',
  'tHJzldnFY0w': 'private/removed, oEmbed 403, thumbs 404 (A P)',
};
const root = process.argv[2] || '.';
const SKIP = new Set(['node_modules', '.git', '.wrangler']);
const self = 'scripts/check-video-ids.mjs';
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(html?|m?js|cjs|json|xml|txt)$/i.test(n) && relative(root, p) !== self) files.push(p);
  }
})(root);
let bad = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const id of Object.keys(BLOCKED)) if (s.includes(id)) { bad++; console.error(`BLOCKED VIDEO ${id} (${BLOCKED[id]}) in ${relative(root, f)}`); }
}
if (bad) { console.error(`VIDEO-IDS FAIL: ${bad} blocked reference(s)`); process.exit(1); }
console.log(`VIDEO-IDS OK: ${Object.keys(BLOCKED).length} blocked IDs absent from ${files.length} files.`);
