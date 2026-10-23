// Shared constant-time secret compare for every admin endpoint.
//
// safeEqual(a, b): both values are HMAC-SHA-256'd with a fresh random key per
// call (crypto.subtle), and the fixed 32-byte digests are XOR-compared over
// every byte with no early return, so neither the content nor the LENGTH of
// the secret leaks through timing.
//
// checkAdminPassword(env, password): ADMIN_PASSWORD unset/empty -> 500 (never
// fails open); missing/wrong password -> 401; else { ok: true }.
const enc = new TextEncoder();

export async function safeEqual(a, b) {
  const key = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [x, y] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(String(a == null ? '' : a))),
    crypto.subtle.sign('HMAC', key, enc.encode(String(b == null ? '' : b))),
  ]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = u.length ^ v.length;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

export async function checkAdminPassword(env, password) {
  const expected = env && env.ADMIN_PASSWORD;
  if (!expected) return { ok: false, status: 500, error: 'ADMIN_PASSWORD not configured on the server' };
  if (!password || !(await safeEqual(password, expected))) {
    return { ok: false, status: 401, error: 'Incorrect password' };
  }
  return { ok: true };
}
