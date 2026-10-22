// Checks the per-slug blog flags in functions/_blog-redirects.js:
//  - BLOG_STATIC_FIRST: the repo page (blog/<slug>.html) wins over the KV doc.
//    Must cover the posts that were KV-first with stale claims (REPO_FIRST below),
//    each must have its repo file, and GET/HEAD must serve that file even when
//    KV has a doc with the same slug.
//  - BLOG_NOINDEX: served (no delete/redirect) but noindex,follow — meta robots
//    in every copy, X-Robots-Tag on GET and HEAD (function + _headers), and absent
//    from the sitemaps, the blog listings, posts-list API and related links.
// Runs the Pages Functions in node against stubbed ASSETS / KV bindings.
import { readFileSync, existsSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_FIRST = [
  'haitian-rappers-in-toronto-young-hadene-and-the-new-generation',
  'basement-to-stage-first-show', 'toronto-after-midnight', 'underground-toronto-sound-2026',
  'inside-young-hadene-an-honest-look',
  'young-hadene-haitian-toronto-drill-dark-trap-artist-redefining-the-6ix-sound',
  'young-hadene-one-of-the-top-best-toronto-rappers-redefining-drill-and-trap',
  'young-hadene-rap-game-takes', 'top-10-underground-toronto-tracks-2026', 'late-night-lab-no-sleep',
];
const NOINDEX = ['late-night-lab-no-sleep', 'top-10-underground-toronto-tracks-2026', 'young-hadene-no-sleep-song-meaning'];

let bad = 0;
const fail = (m) => { bad++; console.error('BLOG-FLAGS FAIL: ' + m); };

const dir = mkdtempSync(join(tmpdir(), 'yh-fn-'));
cpSync('functions', join(dir, 'functions'), { recursive: true });
writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
const imp = (p) => import(pathToFileURL(join(dir, 'functions', p)).href);
const flags = await imp('_blog-redirects.js');
const blogFn = await imp('blog/[slug].js');
const listFn = await imp('api/posts-list.js');
const smFn = await imp('sitemap.xml.js');
rmSync(dir, { recursive: true, force: true });

// 1. Lists.
for (const s of REPO_FIRST) {
  if (!flags.BLOG_STATIC_FIRST.has(s)) fail(`BLOG_STATIC_FIRST is missing ${s}`);
  if (!existsSync(`blog/${s}.html`)) fail(`BLOG_STATIC_FIRST slug has no repo file blog/${s}.html`);
  if (flags.BLOG_REDIRECTS[s]) fail(`${s} is both repo-first and redirected`);
}
for (const s of NOINDEX) {
  if (!flags.BLOG_NOINDEX.has(s)) fail(`BLOG_NOINDEX is missing ${s}`);
  if (flags.BLOG_REDIRECTS[s]) fail(`${s} is noindexed but also redirected (must stay served)`);
}

// 2. Stubbed bindings: KV has a doc for every slug; ASSETS returns the repo file.
const now = Date.now();
const kvDoc = (slug) => ({ slug, title: 'KV COPY ' + slug, content: 'KV BODY', status: 'published', category: 'Blog', tags: 'toronto', dateNum: now - 1000 });
const allSlugs = [...new Set([...REPO_FIRST, ...NOINDEX, 'kv-only-post'])];
const kvIndex = allSlugs.map(kvDoc);
const store = {
  async get(key) {
    if (key === 'blog:index') return JSON.stringify(kvIndex);
    if (key.startsWith('blog:')) { const s = key.slice(5); return allSlugs.includes(s) ? JSON.stringify(kvDoc(s)) : null; }
    if (key === 'news:index') return '[]';
    return null;
  },
};
const ASSETS = {
  async fetch(req) {
    const u = new URL(req.url || req);
    if (u.pathname === '/sitemap.xml') return new Response(readFileSync('sitemap.xml', 'utf8'), { status: 200 });
    if (u.pathname.endsWith('.json')) {
      const jf = u.pathname.replace(/^\//, '');
      return existsSync(jf) ? new Response(readFileSync(jf, 'utf8'), { status: 200, headers: { 'Content-Type': 'application/json' } }) : new Response('nf', { status: 404 });
    }
    const f = u.pathname.replace(/^\//, '').replace(/\.html$/, '') + '.html';
    if (!existsSync(f)) return new Response('nf', { status: 404 });
    return new Response(readFileSync(f, 'utf8'), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  },
};
const env = { YH_POSTS: store, ASSETS };
const ctx = (slug) => ({ request: new Request(`https://younghadene.ca/blog/${slug}`), env, params: { slug }, waitUntil() {} });

for (const s of allSlugs) {
  const g = await blogFn.onRequestGet(ctx(s));
  const body = await g.text();
  const h = await blogFn.onRequestHead(ctx(s));
  if (g.status !== h.status) fail(`${s}: HEAD ${h.status} != GET ${g.status}`);
  const gx = g.headers.get('X-Robots-Tag'), hx = h.headers.get('X-Robots-Tag');
  if (gx !== hx) fail(`${s}: HEAD X-Robots-Tag ${hx} != GET ${gx}`);
  if (REPO_FIRST.includes(s)) {
    if (g.status !== 200 || body.includes('KV COPY') || body !== readFileSync(`blog/${s}.html`, 'utf8')) fail(`${s}: GET did not serve the repo file blog/${s}.html`);
  }
  if (NOINDEX.includes(s)) {
    if (gx !== 'noindex, follow') fail(`${s}: GET X-Robots-Tag is ${gx}, want "noindex, follow"`);
  } else if (gx) fail(`${s}: indexable post sends X-Robots-Tag ${gx}`);
  if (s === 'kv-only-post' && !body.includes('KV COPY')) fail('kv-only-post: KV-only post no longer served from KV');
  if (s === 'kv-only-post') for (const n of NOINDEX) if (body.includes(`/blog/${n}"`)) fail(`related links on a KV page include noindexed ${n}`);
}
// .html variant too
{
  const r = await blogFn.onRequestGet({ ...ctx('late-night-lab-no-sleep'), params: { slug: 'late-night-lab-no-sleep.html' } });
  if (r.headers.get('X-Robots-Tag') !== 'noindex, follow') fail('/blog/late-night-lab-no-sleep.html: no X-Robots-Tag');
}

// 3. posts-list API and dynamic sitemap leave noindexed posts out.
{
  const r = await listFn.onRequestGet({ request: new Request('https://younghadene.ca/api/posts-list'), env });
  const d = await r.json();
  const got = new Set(d.posts.map((p) => p.slug));
  for (const n of NOINDEX) if (got.has(n)) fail(`/api/posts-list lists noindexed ${n}`);
  if (!got.has('basement-to-stage-first-show')) fail('/api/posts-list dropped an indexable post');
  const x = await (await smFn.onRequestGet({ env })).text();
  for (const n of NOINDEX) if (x.includes(`/blog/${n}<`) || x.includes(`/${n}<`)) fail(`dynamic sitemap.xml lists noindexed ${n}`);
  if (!x.includes('/blog/basement-to-stage-first-show<')) fail('dynamic sitemap.xml dropped an indexable post');
}

// 3b. Listing: for every BLOG_STATIC_FIRST slug the repo entry wins over the KV
// entry — in /api/posts-list (from blog/posts.json) and in blog.html's client
// merge (baked SERVER_POSTS over the live list). Driven by the constant, so new
// repo-first slugs are covered automatically.
import vm from 'node:vm';
{
  const repoList = JSON.parse(readFileSync('blog/posts.json', 'utf8'));
  const repoBySlug = new Map(repoList.map((p) => [p.slug, p]));
  const r = await listFn.onRequestGet({ request: new Request('https://younghadene.ca/api/posts-list'), env });
  const d = await r.json();
  const want = [...flags.BLOG_STATIC_FIRST].sort().join(',');
  if (!Array.isArray(d.repoFirst) || [...d.repoFirst].sort().join(',') !== want) fail('/api/posts-list repoFirst does not equal BLOG_STATIC_FIRST');
  const bySlug = new Map(d.posts.map((p) => [p.slug, p]));
  for (const s of flags.BLOG_STATIC_FIRST) {
    if (flags.BLOG_NOINDEX.has(s)) continue;
    if (!repoBySlug.has(s)) { console.warn(`BLOG-FLAGS WARN: ${s} has no blog/posts.json entry; /api/posts-list falls back to the KV entry`); continue; }
    const p = bySlug.get(s);
    if (!p) fail(`/api/posts-list dropped repo-first ${s}`);
    else if (p.title !== repoBySlug.get(s).title || /KV COPY/.test(p.title)) fail(`/api/posts-list uses the KV entry for repo-first ${s} ("${p.title}")`);
  }
  if (!/KV COPY/.test((bySlug.get('kv-only-post') || {}).title || '')) fail('/api/posts-list no longer uses the KV entry for a KV-only post');

  // blog.html client merge.
  const html = readFileSync('blog.html', 'utf8');
  const baked = html.match(/<script>(var SERVER_POSTS = [\s\S]*?)<\/script>/);
  const fnSrc = html.match(/async function refreshLivePosts\(\) \{[\s\S]*?\n    \}\n/);
  if (!baked || !fnSrc) fail('blog.html: could not find SERVER_POSTS / refreshLivePosts');
  else {
    const kvPosts = [...new Set([...allSlugs, ...flags.BLOG_STATIC_FIRST])].map(kvDoc);
    const sandbox = { renderBlog() {}, fetch: async () => ({ ok: true, json: async () => ({ ok: true, posts: kvPosts, repoFirst: [...flags.BLOG_STATIC_FIRST] }) }) };
    vm.createContext(sandbox);
    vm.runInContext(baked[1] + '\n' + fnSrc[0] + '\nthis.__run = refreshLivePosts; this.__get = () => SERVER_POSTS;', sandbox);
    const bakedBefore = new Map(sandbox.__get().map((p) => [p.slug, p.title]));
    await sandbox.__run();
    const merged = sandbox.__get();
    for (const s of flags.BLOG_STATIC_FIRST) {
      if (flags.BLOG_NOINDEX.has(s)) continue;
      if (!bakedBefore.has(s)) { console.warn(`BLOG-FLAGS WARN: ${s} is not in blog.html SERVER_POSTS; the /blog card uses the API entry`); continue; }
      const hits = merged.filter((p) => p.slug === s);
      if (hits.length !== 1) fail(`blog.html merge: ${s} appears ${hits.length} times`);
      else if (hits[0].title !== bakedBefore.get(s)) fail(`blog.html merge: ${s} card uses the KV title "${hits[0].title}"`);
    }
    const kvOnly = merged.find((p) => p.slug === 'kv-only-post');
    if (!kvOnly || !/KV COPY/.test(kvOnly.title)) fail('blog.html merge: KV-only post missing or not from KV');
  }
}

// 4. Static files: meta robots, _headers, sitemaps, listings, related links.
const META = /<meta name="robots" content="noindex, follow">/;
for (const n of NOINDEX) {
  for (const f of [`blog/${n}.html`, `${n}.html`]) {
    if (!existsSync(f)) continue;
    if (!META.test(readFileSync(f, 'utf8'))) fail(`${f}: missing <meta name="robots" content="noindex, follow">`);
  }
}
const headers = readFileSync('_headers', 'utf8');
for (const n of NOINDEX) for (const p of [`/blog/${n}`, ...(existsSync(`${n}.html`) ? [`/${n}`, `/${n}.html`] : [])]) {
  if (!new RegExp(`^${p.replace(/[.]/g, '\\.')}\\n\\s+X-Robots-Tag: noindex, follow`, 'm').test(headers)) fail(`_headers: ${p} has no X-Robots-Tag: noindex, follow`);
}
const LISTINGS = ['sitemap.xml', 'blog.html', 'blog/index.html', 'blog/posts.json', 'posts.json', 'yh_blogPosts.json', 'llms.txt'];
for (const f of LISTINGS) {
  if (!existsSync(f)) continue;
  const s = readFileSync(f, 'utf8');
  for (const n of NOINDEX) if (new RegExp(`${n}(?![a-z0-9-])`).test(s)) fail(`${f} still lists/links noindexed ${n}`);
}
// Related-post links in other blog pages.
import { readdirSync } from 'node:fs';
for (const f of readdirSync('blog').filter((x) => x.endsWith('.html'))) {
  const s = readFileSync('blog/' + f, 'utf8');
  for (const n of NOINDEX) {
    if (f === `${n}.html`) continue;
    if (new RegExp(`href="(?:https://younghadene\\.ca)?/blog/${n}(?:\\.html)?"`).test(s)) fail(`blog/${f} links to noindexed ${n}`);
  }
}

if (bad) { console.error(`BLOG-FLAGS FAIL: ${bad} problem(s)`); process.exit(1); }
console.log(`BLOG-FLAGS OK: ${REPO_FIRST.length} repo-first slugs serve blog/<slug>.html over KV (GET = HEAD); ${NOINDEX.length} noindexed slugs send X-Robots-Tag + meta robots and are out of sitemaps, listings, posts-list and related links; /blog listing + posts-list use the repo entry for repo-first slugs; KV-only posts still render from KV.`);
