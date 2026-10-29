// Checks that KV-served articles have one URL: /blog/<slug>.html and case
// variants 308 to /blog/<slug> (same for /news), while the clean URL is 200,
// unknown slugs stay 404 and the global middleware still behaves.
// Runs functions/ against a mocked env.ASSETS (Pages-style .html handling)
// and an in-memory YH_POSTS KV.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slug-redirects-'));
fs.cpSync(path.join(repo, 'functions'), path.join(tmp, 'functions'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
const load = (p) => import(pathToFileURL(path.join(tmp, 'functions', p)).href);
const mw = await load('_middleware.js');
const blog = await load('blog/[slug].js');
const news = await load('news/[slug].js');

const isFile = (p) => { try { return fs.statSync(path.join(repo, p)).isFile(); } catch { return false; } };
const ASSETS = {
  async fetch(req) {
    const p = decodeURIComponent(new URL(typeof req === 'string' ? req : req.url).pathname);
    const r = (status, loc) => new Response(status === 200 ? 'static' : null, { status, headers: loc ? { Location: loc } : {} });
    if (/\/index\.html$/.test(p) && isFile(p)) return r(308, p.replace(/index\.html$/, ''));
    if (/\.html$/.test(p) && isFile(p)) return r(308, p.replace(/\.html$/, ''));
    if (p.endsWith('/') && isFile(p + 'index.html')) return r(200);
    if (!p.endsWith('/') && isFile(p + '.html')) return r(200);
    if (!p.endsWith('/') && isFile(p)) return r(200);
    return r(404);
  },
};
const doc = (slug) => JSON.stringify({ slug, title: slug, content: 'x', status: 'published', date: '2026-10-01' });
const kv = new Map([
  ['blog:kv-only-check-post', doc('kv-only-check-post')],
  ['news:kv-only-check-story', doc('kv-only-check-story')],
  ['deleted', JSON.stringify({ blog: ['gone-check-post'], news: [] })],
]);
const env = { ASSETS, YH_POSTS: { get: async (k) => kv.get(k) ?? null, put: async () => {} } };

async function hit(p, method = 'GET') {
  const request = new Request('https://younghadene.ca' + p, { method });
  const route = () => {
    const pathname = new URL(request.url).pathname;
    let m;
    const ctx = (slug) => ({ request, env, params: { slug }, waitUntil() {} });
    if ((m = pathname.match(/^\/blog\/([^/]+)$/))) return (method === 'HEAD' ? blog.onRequestHead : blog.onRequestGet)(ctx(m[1]));
    if ((m = pathname.match(/^\/news\/([^/]+)$/))) return (method === 'HEAD' ? news.onRequestHead : news.onRequestGet)(ctx(m[1]));
    return ASSETS.fetch(request);
  };
  const res = await mw.onRequest({ request, env, next: route, params: {} });
  return [res.status, res.headers.get('Location') || ''];
}

const cases = [
  ['/blog/kv-only-check-post.html', 308, '/blog/kv-only-check-post'],
  ['/blog/KV-Only-Check-Post', 308, '/blog/kv-only-check-post'],
  ['/blog/KV-ONLY-CHECK-POST.html?ref=x', 308, '/blog/kv-only-check-post?ref=x'],
  ['/blog/kv-only-check-post', 200, ''],
  ['/news/kv-only-check-story.html', 308, '/news/kv-only-check-story'],
  ['/news/Kv-Only-Check-Story', 308, '/news/kv-only-check-story'],
  ['/news/kv-only-check-story', 200, ''],
  ['/blog/gone-check-post.html', 404, ''],
  ['/blog/no-such-check-post.html', 404, ''],
  ['/blog.html', 308, '/blog'],
  ['/news.html', 308, '/news'],
];
// A real static article (if any) still gets Pages' own one-hop 308.
const firstStatic = fs.readdirSync(path.join(repo, 'blog')).find((f) => f.endsWith('.html') && f !== 'index.html');
if (firstStatic) cases.push(['/blog/' + firstStatic, null, null]);

let bad = 0;
for (const [p, want, loc] of cases) {
  // HEAD only where the route exports onRequestHead (blog does, news does not).
  const methods = p.startsWith('/news/') && !news.onRequestHead ? ['GET'] : ['GET', 'HEAD'];
  for (const method of methods) {
    const [status, got] = await hit(p, method);
    const ok = want === null ? (status === 308 || status === 301) && !/\.html/.test(got) : status === want && got === loc;
    if (!ok) { bad++; console.error(`FAIL ${method} ${p}: ${status} ${got} (want ${want ?? '301/308'} ${loc ?? 'clean'})`); }
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (bad) { console.error(`check-slug-redirects: ${bad} failure(s)`); process.exit(1); }
console.log(`check-slug-redirects: ${cases.length} URLs OK (GET, plus HEAD where handled)`);
