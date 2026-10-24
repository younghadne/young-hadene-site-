// Guard for hand-written blog posts:
//  1. No editorial placeholder markers ([CONFIRM], [VERIFY], [HELD]) may ship
//     in any blog/*.html file. They mean a fact is still waiting on sign-off.
//  2. Each batch post listed in MIN_WORDS must have a body of at least 900
//     words. The body is the text between the POST-BODY-START/END comments.
import fs from 'node:fs';
import path from 'node:path';

const MARKER = /\[(CONFIRM|VERIFY|HELD)\b[^\]]*\]/gi;
const MIN = 900;
const MIN_WORDS = [
  // Blog batch 1 (2026-10-22)
  'young-hadene-4-minutes-of-hell-freestyle',
  'young-hadene-nightmares-in-the-nighttime',
  'young-hadene-in-the-cut',
  'young-hadene-rise-again-from-the-bottom',
  'haitian-rappers-in-toronto-young-hadene-and-the-new-generation',
];

const bad = [];
const files = fs.readdirSync('blog').filter((f) => f.endsWith('.html'));
for (const f of files) {
  const rel = path.join('blog', f);
  const s = fs.readFileSync(rel, 'utf8');
  const lines = s.split('\n');
  lines.forEach((ln, i) => {
    for (const m of ln.matchAll(MARKER)) bad.push(`${rel}:${i + 1}: marker ${m[0]}`);
  });
}

export function bodyWords(html) {
  const a = html.indexOf('<!-- POST-BODY-START -->');
  const b = html.indexOf('<!-- POST-BODY-END -->');
  if (a < 0 || b < a) return null;
  const text = html.slice(a, b)
    .replace(/<(script|style|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ');
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.:-]*/gu) || []).length;
}

const counts = [];
for (const slug of MIN_WORDS) {
  const rel = path.join('blog', slug + '.html');
  if (!fs.existsSync(rel)) { bad.push(`${rel}: missing`); continue; }
  const n = bodyWords(fs.readFileSync(rel, 'utf8'));
  if (n === null) { bad.push(`${rel}: no POST-BODY-START/END markers`); continue; }
  counts.push(`${slug}=${n}`);
  if (n < MIN) bad.push(`${rel}: body is ${n} words (minimum ${MIN})`);
}

if (bad.length) { console.error('BLOG-MARKER-CHECK FAIL:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`BLOG-MARKER-CHECK OK: ${files.length} blog pages, no [CONFIRM]/[VERIFY]/[HELD]; word counts: ${counts.join(', ')}`);
