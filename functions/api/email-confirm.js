// Double opt-in confirmation (public). POST { token, email }.
// GET never mutates.
import { json, kv, normEmail, emailHash, tokenValid } from './_email-lib.js';

export async function onRequestGet(context) {
  return json({ ok: true, info: 'POST token + email to confirm subscription. GET never confirms.' });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const email = normEmail(body.email || '');
    const token = String(body.token || '');
    if (!email || !token) return json({ error: 'token and email required.' }, 400);
    const valid = await tokenValid(env, 'confirm', email, token);
    if (!valid) return json({ error: 'Invalid or expired link.' }, 400);
    const store = kv(env);
    if (!store) return json({ error: 'Service unavailable.' }, 500);
    const id = await store.get('email:byemail:' + (await emailHash(email)));
    if (!id) return json({ error: 'Subscription not found.' }, 404);
    const c = JSON.parse((await store.get('email:c:' + id)) || 'null');
    if (!c) return json({ error: 'Subscription not found.' }, 404);
    const suppression = JSON.parse((await store.get('email:suppression')) || '{}');
    if (suppression[c.emailHash]) return json({ error: 'This address is suppressed and cannot be reactivated here.' }, 409);
    const now = Date.now();
    c.status = 'active';
    c.confirmTs = now;
    c.consent = Object.assign({}, c.consent || {}, { status: 'opted-in', method: 'double-opt-in', ts: now });
    c.updatedAt = now;
    await store.put('email:c:' + id, JSON.stringify(c));
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
