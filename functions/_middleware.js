// Mobile-friendly redirects for page URLs, applied only when the request
// would otherwise 404:
//   /Music, /MUSIC, /music/Broken  -> lowercase page (308, one hop)
//   /music/index.html              -> /music (folder URL, 308)
// /api/ and file assets (anything with an extension other than .html) are
// never touched, so nothing goes through two redirects.
const ASSET_EXT = /\.(?!html?$)[a-z0-9]{1,8}$/i;

export async function onRequest(context) {
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
