import { isPrivatePath } from './_private-paths.js';

// 1. Repo-only files (build tooling, SEO working files, authoring data, dev
//    keys; see _private-paths.js) answer the site's normal 404 for every
//    method, before any asset or Function is looked up. The build output is
//    the repo root, so without this every committed file is public.
//
// 2. Mobile-friendly redirects for page URLs, applied only when the request
// would otherwise 404:
//   /Music, /MUSIC, /music/Broken  -> lowercase page (308, one hop)
//   /music/index.html              -> /music (folder URL, 308)
// /api/ and file assets (anything with an extension other than .html) are
// never touched, so nothing goes through two redirects.
const ASSET_EXT = /\.(?!html?$)[a-z0-9]{1,8}$/i;

// The same 404 Pages gives any missing file: ask ASSETS for a path that
// cannot exist and pass its body on (the site's 404.html), status 404.
async function notFound(context, url) {
  let body = 'Not found\n';
  let type = 'text/plain; charset=utf-8';
  try {
    const miss = await context.env.ASSETS.fetch(new Request(url.origin + '/__yh-not-found__', { method: 'GET' }));
    body = await miss.text();
    type = miss.headers.get('Content-Type') || 'text/html; charset=utf-8';
  } catch { /* plain text body */ }
  return new Response(context.request.method === 'HEAD' ? null : body, {
    status: 404,
    headers: { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

export async function onRequest(context) {
  const reqUrl = new URL(context.request.url);
  if (isPrivatePath(reqUrl.pathname)) return notFound(context, reqUrl);

  const res = await context.next();
  if (res.status !== 404) return res;

  const url = new URL(context.request.url);
  const path = url.pathname;
  if (path.toLowerCase().startsWith('/api/') || ASSET_EXT.test(path)) return res;

  let target = path.toLowerCase();
  target = target.replace(/\/index\.html?$/, '') || '/';
  target = target.replace(/\.html?$/, '');
  if (target.length > 1) target = target.replace(/\/+$/, '');
  if (target === path) return res;

  const probe = new URL(url);
  probe.pathname = target;
  const check = await context.env.ASSETS.fetch(new Request(probe.toString(), { method: 'GET', redirect: 'manual' }));
  if (check.status !== 200) return res;

  url.pathname = target;
  return new Response(null, { status: 308, headers: { Location: url.pathname + url.search } });
}
