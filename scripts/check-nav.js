#!/usr/bin/env node
// Regression test: shared navigation consistency (run: npm test).
// The canonical tab list lives in js/main.js (NAV_ITEMS) and every page's
// static <nav> fallback must contain the same tabs. This guards against a
// repeat of the disappearing-News/About bug, where per-page hardcoded nav
// copies silently drifted apart.
// Fails (exit 1) listing every offending file. No dependencies.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// label -> href pattern (root pages use absolute, blog|news subdirs use ../)
const REQUIRED = [
  { label: 'Home', hrefs: ['/', '/index.html', '../index.html'] },
  { label: 'Music', hrefs: ['/music', '/music.html', '../music.html'] },
  { label: 'Blog', hrefs: ['/blog', '/blog.html', '../blog.html'] },
  { label: 'News', hrefs: ['/news', '/news.html', '../news.html'] },
  { label: 'About', hrefs: ['/about', '/about.html', '../about.html'] },
  { label: 'Contact', hrefs: ['/contact', '/contact.html', '../contact.html'] },
  { label: 'Admin', hrefs: ['/admin', '/admin.html', '../admin.html'] },
];

function listHtml(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.wrangler') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listHtml(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function navOf(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/<nav.*?<\/nav>/s);
  return m ? m[0] : null;
}

let failures = 0;
const files = listHtml(ROOT).sort();
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const nav = navOf(file);
  if (!nav) {
    console.log(`NAV-CHECK FAIL ${rel}: no <nav> block`);
    failures++;
    continue;
  }
  const missing = REQUIRED.filter(
    (t) => !new RegExp(`<a[^>]*href="(${t.hrefs.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})"[^>]*>${t.label}</a>`).test(nav)
  ).map((t) => t.label);
  if (missing.length) {
    console.log(`NAV-CHECK FAIL ${rel}: missing tab(s): ${missing.join(', ')}`);
    failures++;
  }
}

// The runtime single source of truth must define the same labels.
try {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const navSrc = (main.match(/const NAV_ITEMS = \[([\s\S]*?)\];/) || [])[1] || '';
  const absent = REQUIRED.filter((t) => !navSrc.includes(`label: '${t.label}'`)).map((t) => t.label);
  if (absent.length) {
    console.log(`NAV-CHECK FAIL js/main.js NAV_ITEMS missing: ${absent.join(', ')}`);
    failures++;
  }
} catch (e) {
  console.log(`NAV-CHECK FAIL js/main.js unreadable: ${e.message}`);
  failures++;
}

if (failures) {
  console.log(`\nNAV-CHECK: ${failures} problem(s) in ${files.length} pages — fix the nav, do not patch one tab.`);
  process.exit(1);
}
console.log(`NAV-CHECK OK: ${files.length} pages, all ${REQUIRED.length} tabs present + NAV_ITEMS in sync.`);
