// Guards against unverified claims returning to /about and the homepage.
import { readFileSync } from 'node:fs';
let bad = 0;
const fail = m => { bad++; console.error('CLAIMS FAIL:', m); };
const ents = { amp: '&', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–' };
const text = s => s.replace(/<[^>]+>/g, ' ').replace(/&([a-z]+);/gi, (m, n) => ents[n] ?? m).replace(/\s+/g, ' ');

const about = readFileSync('about.html', 'utf8');
// Visible text + JSON-LD bodies + meta/OG content attributes.
const aboutAll = text(about.replace(/<[^>]*\bcontent="([^"]*)"[^>]*>/g, ' $1 '));
// 1. Night Lovell (Ottawa) / Swollen Members (Vancouver) must not be described as Toronto rappers.
for (const sent of aboutAll.split(/(?<=[.!?])\s+/)) {
  for (const name of ['Night Lovell', 'Swollen Members']) {
    if (sent.includes(name) && /Toronto/i.test(sent)) fail(`/about describes ${name} as Toronto: "${sent.trim().slice(0, 160)}"`);
  }
}
// 2. Unverified singles must not be listed. 'Pressure & Diamonds' is a real track and is allowed.
for (const [label, re] of [
  ['No Sleep', /\bNo Sleep\b/i],
  ['6ix Side', /\b6ix Side\b/i],
  ['After Dark', /\bAfter Dark\b/i],
  ['Pressure', /\bPressure\b(?!\s*(?:&|and)\s*Diamonds)/i],
]) if (re.test(aboutAll)) fail(`/about lists unverified single "${label}"`);

// 3. Homepage: no streaming-numbers claim (visible text or schema).
const index = readFileSync('index.html', 'utf8');
if (/streaming numbers/i.test(index)) fail('index.html still claims "streaming numbers"');

if (bad) { console.error(`CLAIMS-CHECK FAIL: ${bad}`); process.exit(1); }
console.log('CLAIMS-CHECK OK: /about has no Toronto-labelled Night Lovell/Swollen Members and no unverified singles; index has no streaming-numbers claim.');
