// Verifies blog HEAD responses match GET (status + Location, empty body).
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
// functions/ are ESM .js in a non-module package; copy to .mjs to import them.
const d = mkdtempSync(join(tmpdir(), 'yhhead-')); mkdirSync(join(d, 'blog'));
writeFileSync(join(d, '_blog-redirects.mjs'), readFileSync('functions/_blog-redirects.js'));
writeFileSync(join(d, 'blog', 'slug.mjs'), readFileSync('functions/blog/[slug].js', 'utf8').replace(/(['"])\.\.\/([^'"]+)\.js\1/g, "'../$2.mjs'"));
const { onRequestGet, onRequestHead } = await import(join(d, 'blog', 'slug.mjs'));
const { BLOG_REDIRECTS } = await import(join(d, '_blog-redirects.mjs'));
const env = { ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } };
const ctx = slug => ({ request: new Request('https://younghadene.ca/blog/' + slug), env, params: { slug } });
let bad = 0;
for (const slug of Object.keys(BLOG_REDIRECTS)) {
  const g = await onRequestGet(ctx(slug)), h = await onRequestHead(ctx(slug));
  const body = await h.text();
  if (g.status !== h.status || g.headers.get('Location') !== h.headers.get('Location') || body) { bad++; console.error('HEAD mismatch:', slug, g.status, h.status); }
}
if (bad) { console.error(`HEAD-CHECK FAIL: ${bad}`); process.exit(1); }
console.log(`HEAD-CHECK OK: ${Object.keys(BLOG_REDIRECTS).length} redirects answer HEAD like GET.`);
