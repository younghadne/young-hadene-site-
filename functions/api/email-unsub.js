// Public unsubscribe + preference centre backend.
// POST /api/email-unsub  { token, email, categories?|global?, confirm? }
// GET never mutates (safe against email security scanners).
// One-click (RFC 8058): email clients POST with
//   List-Unsubscribe=One-Click  -> auto-confirmed when token valid.
// Webpage flow: POST without one-click header requires { confirm: true }
//   (the page shows a confirmation button first).
import { json, kv, normEmail, emailHash, tokenValid } from './_email-lib.js';

export async function onRequestGet(context) {
  return json({ ok: true, info: 'POST token + email to unsubscribe. GET never unsubscribes.' });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const email = normEmail(body.email || '');
    const token = String(body.token || '');
    if (!email || !token) return json({ error: 'token and email required.' }, 400);

    const oneClick = String(request.headers.get('List-Unsubscribe') || '').toLowerCase() === 'one-click';
    const confirmed = oneClick || body.confirm === true;
    if (!confirmed) {
      // Webpage first step: token valid? (does not mutate)
      const ok = await tokenValid(env, 'unsub', email, token);
      if (!ok) return json({ error: 'Invalid or expired link.' }, 400);
      return json({ ok: true, needsConfirm: true });
    }

    const valid = await tokenValid(env, 'unsub', email, token);
    if (!valid) return json({ error: 'Invalid or expired link.' }, 400);

    const store = kv(env);
    if (!store) return json({ error: 'Service unavailable.' }, 500);
    const hash = await emailHash(email);
    const id = await store.get('email:byemail:' + hash);
    const now = Date.now();
    const reason = String(body.reason || (oneClick ? 'one-click' : 'web')).substring(0, 120);

    // Global unsubscribe overrides all categories. Idempotent: repeat calls
    // return success without changing history beyond first event.
    const suppression = JSON.parse((await store.get('email:suppression')) || '{}');
    const firstEvent = !suppression[hash];
    if (body.global === false && Array.isArray(body.categories)) {
      // Category-level: remove categories, keep subscription if any remain.
      if (id) {
        const c = JSON.parse((await store.get('email:c:' + id)) || 'null');
        if (c) {
          const keep = (c.categories || []).filter((x) => !body.categories.includes(x));
          c.categories = keep;
          if (!keep.length) {
            c.status = 'unsubscribed';
            c.unsubTs = c.unsubTs || now;
          }
          c.updatedAt = now;
          await store.put('email:c:' + id, JSON.stringify(c));
        }
      }
      if (firstEvent && (!id || true)) {
        // Category-only unsub still suppresses those categories via contact record.
      }
      return json({ ok: true, idempotent: !firstEvent, categories: true });
    }

    if (id) {
      const c = JSON.parse((await store.get('email:c:' + id)) || 'null');
      if (c) {
        c.status = 'unsubscribed';
        if (!c.unsubTs) { c.unsubTs = now; c.unsubReason = reason; }
        c.updatedAt = now;
        await store.put('email:c:' + id, JSON.stringify(c));
      }
    }
    if (!suppression[hash]) {
      suppression[hash] = { reason: 'unsub:' + reason, ts: now, campaign: String(body.campaignId || '').substring(0, 60) };
      await store.put('email:suppression', JSON.stringify(suppression));
    }
    try {
      const log = JSON.parse((await store.get('email:audit')) || '[]');
      log.unshift({ ts: now, actor: 'public-unsub', action: 'unsubscribe', detail: (oneClick ? 'one-click' : 'web') + ' hash=' + hash.substring(0, 12) });
      await store.put('email:audit', JSON.stringify(log.slice(0, 500)));
    } catch { /* */ }
    return json({ ok: true, idempotent: !firstEvent, oneClick });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
