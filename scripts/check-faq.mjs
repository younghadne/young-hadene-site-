// Verifies every homepage FAQPage JSON-LD Q&A pair appears verbatim in the visible FAQ (.faq-q / .faq-a).
import { readFileSync } from 'node:fs';
const file = process.argv[2] || 'index.html';
const html = readFileSync(file, 'utf8');
const ents = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const dec = s => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-z]+);/gi, (m, n) => ents[n] ?? m);
const norm = s => dec(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
let schema = [];
for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  const walk = o => { if (!o || typeof o !== 'object') return; if (o['@type'] === 'FAQPage') schema.push(...o.mainEntity); Object.values(o).forEach(walk); };
  walk(JSON.parse(m[1]));
}
const visible = new Map();
for (const m of html.matchAll(/<h3 class="faq-q">([\s\S]*?)<\/h3>\s*(?:<p class="faq-a">([\s\S]*?)<\/p>)?/g)) visible.set(norm(m[1]), m[2] == null ? null : norm(m[2]));
let bad = 0;
for (const q of schema) {
  const name = norm(q.name), ans = norm(q.acceptedAnswer.text);
  if (!visible.has(name)) { bad++; console.error('MISSING Q:', name); continue; }
  if (visible.get(name) !== ans) { bad++; console.error('ANSWER MISMATCH:', name, '\n  visible:', visible.get(name), '\n  schema: ', ans); }
}
if (!schema.length) { console.error('FAQ-CHECK FAIL: no FAQPage schema'); process.exit(1); }
if (bad) { console.error(`FAQ-CHECK FAIL: ${bad} of ${schema.length}`); process.exit(1); }
console.log(`FAQ-CHECK OK: all ${schema.length} schema Q&A pairs match the visible FAQ.`);
