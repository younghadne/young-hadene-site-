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
