// Send mistyped capitalised URLs (e.g. /Music, /MUSIC) to the lowercase page
// instead of a 404. Only kicks in when the original path 404s, so real URLs
// with capitals (asset names, video IDs) are untouched.
export async function onRequest(context) {
  const res = await context.next();
  if (res.status !== 404) return res;
  const url = new URL(context.request.url);
  const lower = url.pathname.toLowerCase();
  if (lower === url.pathname) return res;
  url.pathname = lower;
  const check = await context.env.ASSETS.fetch(new Request(url.toString(), { method: 'HEAD' }));
  if (check.status >= 400) return res;
  return Response.redirect(url.toString(), 301);
}
