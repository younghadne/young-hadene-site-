// Guards functions/_middleware.js + functions/_private-paths.js: repo-only
// files must 404 on the site, public pages/assets must still be served and
// the existing case redirects (/Music -> /music) must keep working.
//
// Why: the Pages build output directory is the repo root, so every committed
// file is uploaded. On 2026-10-30 live (younghadene.ca) and the previews
// served /scripts/*.mjs, /package.json, /server.js, /analytics.json (visitor
// IPs), /key.pem (local-dev TLS key), /seo/*.csv, /.env.example, ...
//
// Also fails when a NEW committed file is neither on the public allowlist
// below nor blocked, so tooling added later can't leak by default.
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

let bad = 0;
const fail = (msg) => { bad++; console.error('PRIVATE-PATHS-CHECK FAIL:', msg); };

const d = mkdtempSync(join(tmpdir(), 'yhpriv-'));
const toMjs = (src) => readFileSync(src, 'utf8').replace(/(['"])(\.\.?\/[^'"]+)\.js\1/g, "'$2.mjs'");
for (const f of ['_private-paths', '_middleware']) writeFileSync(join(d, f + '.mjs'), toMjs(`functions/${f}.js`));
const mw = await import(join(d, '_middleware.mjs'));
const { isPrivatePath } = await import(join(d, '_private-paths.mjs'));

const NOT_FOUND = readFileSync('404.html', 'utf8');
// Mock Pages assets: serves this checkout's files, 404.html (status 404) for misses.
const ASSETS = { async fetch(req) {
  const p = decodeURIComponent(new URL(req.url).pathname);
  const file = p.endsWith('/') ? p + 'index.html' : p;
  for (const f of [file, file + '.html']) {
    try { return new Response(readFileSync('.' + f), { status: 200 }); } catch { /* next */ }
  }
  return new Response(NOT_FOUND, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
} };
async function get(path, method = 'GET') {
  let nextCalled = false;
  const request = new Request('https://younghadene.ca' + path, { method });
  const res = await mw.onRequest({ request, env: { ASSETS }, next: async () => { nextCalled = true; return ASSETS.fetch(request); } });
  return { res, nextCalled };
}

// 1. Everything live served on 2026-10-30 that must not be public.
const MUST_404 = [
  '/scripts/check-news-feeds.mjs', '/scripts/check-head.mjs', '/scripts/build-static.js', '/scripts/sitemap.js', '/scripts/', '/scripts',
  '/package.json', '/package-lock.json', '/server.js', '/worker.js', '/proxy.js', '/start.sh', '/render.yaml', '/AGENTS.md',
  '/posts.json', '/blog/posts.json', '/settings.json', '/analytics.json', '/yh_blogPosts.json', '/yh_newsPosts.json',
  '/cert.pem', '/key.pem', '/.gitignore', '/.env.example', '/.env', '/.github/workflows/deploy.yml', '/.git/config',
  '/seo/keyword-map.csv', '/seo/briefs/B1-p16-haitian-caribbean.md', '/functions/_middleware.js', '/node_modules/x/package.json',
  // case / encoding / slash variants
  '/Scripts/sitemap.js', '/SCRIPTS/check-head.mjs', '/%73cripts/sitemap.js', '/%2573cripts/sitemap.js', '//scripts/sitemap.js',
  '/scripts%2Fsitemap.js', '/Package.JSON', '/%2egitignore', '/images/../scripts/sitemap.js', '/x/key.pem',
];
for (const p of MUST_404) {
  for (const method of ['GET', 'HEAD', 'POST']) {
    const { res, nextCalled } = await get(p, method);
    if (res.status !== 404) fail(`${method} ${p} -> ${res.status}, want 404`);
    if (nextCalled) fail(`${method} ${p} reached the asset/Function (next() called)`);
    if (method === 'GET' && (await res.text()) !== NOT_FOUND) fail(`${p} 404 body is not the site's 404 page`);
  }
}

// 2. Public pages and assets still pass through untouched.
const MUST_SERVE = ['/', '/index.html', '/music', '/news', '/blog', '/js/main.js', '/main.js', '/css/' + execFileSync('git', ['ls-files', 'css'], { encoding: 'utf8' }).split('\n')[0].replace(/^css\//, ''),
  '/robots.txt', '/llms.txt', '/sitemap.xml', '/news-sitemap.xml', '/news-rss.xml', '/banner.webp', '/archive/style.css'];
for (const p of MUST_SERVE) {
  const { res, nextCalled } = await get(p);
  if (!nextCalled || res.status !== 200) fail(`GET ${p} -> ${res.status} (next ${nextCalled}), want the asset (200)`);
}
for (const p of ['/.well-known/security.txt', '/api/news-list', '/blog/some-post', '/news/some-post']) {
  if (isPrivatePath(p)) fail(`${p} is treated as private`);
}
// Existing case redirect still works (and blocked paths never redirect).
{
  const { res } = await get('/Music');
  if (res.status !== 308 || res.headers.get('Location') !== '/music') fail(`/Music -> ${res.status} ${res.headers.get('Location')}, want 308 /music`);
}

// 3. Every committed file is either on the public allowlist or blocked.
const PUBLIC = [
  /^(?!(scripts|seo|functions)\/)[^.][^/]*(\/[^.][^/]*)*\.html$/, // pages
  /^(images|img|css|fonts|js|music|videos|archive|news)\//,
  /^blog\/(?!posts\.json$)/,
  /^[^/]+\.(xml|txt|png|webp|jpe?g|svg|ico|gif|css|woff2?)$/,
  /^main\.js$/,
  /^_(redirects|headers|routes\.json)$/, // read by Pages, never served
];
for (const f of execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)) {
  const pub = PUBLIC.some((re) => re.test(f));
  const priv = isPrivatePath('/' + f);
  if (pub && priv && !/^_/.test(f)) fail(`${f} is on the public allowlist but blocked`);
  if (!pub && !priv) fail(`${f} would be served publicly: add it to functions/_private-paths.js or to the allowlist in this check`);
}

// 4. A _routes.json that excludes paths from Functions would skip the middleware.
if (existsSync('_routes.json')) {
  const r = JSON.parse(readFileSync('_routes.json', 'utf8'));
  if (!(r.include || []).includes('/*')) fail('_routes.json must include "/*" so the middleware sees every request');
  for (const ex of r.exclude || []) {
    const re = new RegExp('^' + ex.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    for (const p of MUST_404) if (re.test(p.toLowerCase())) fail(`_routes.json exclude ${ex} bypasses the block for ${p}`);
  }
}

rmSync(d, { recursive: true, force: true });
if (bad) { console.error(`PRIVATE-PATHS-CHECK FAIL: ${bad} problem(s).`); process.exit(1); }
console.log(`PRIVATE-PATHS-CHECK OK: ${MUST_404.length} repo-only paths 404 (GET/HEAD/POST, case/encoding variants), public assets and /Music redirect unchanged, every committed file classified.`);
