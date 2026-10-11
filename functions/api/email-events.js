// SNS event ingestion: bounce / complaint / delivery sync into suppression.
// POST /api/email-events?key=EMAIL_WEBHOOK_KEY
// - Verifies SNS message signature (RSA-SHA1, amazonaws cert only).
// - Validates TopicArn against settings allowlist when configured.
// - Handles SubscriptionConfirmation by fetching SubscribeURL (server-side).
// - Idempotent: event message-ids recorded; duplicates ignored.
import { json, kv, timingSafeEqual, verifySnsSignature, normEmail, emailHash } from './_email-lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key') || '';
    const expected = (env && env.EMAIL_WEBHOOK_KEY) || '';
    if (!expected || !timingSafeEqual(key, expected)) return json({ error: 'Forbidden.' }, 403);
    const store = kv(env);
    if (!store) return json({ error: 'KV not configured.' }, 500);
    let msg = null;
    try { msg = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }

    const sigOk = await verifySnsSignature(msg, fetch);
    if (!sigOk) return json({ error: 'Invalid SNS signature.' }, 403);

    const settings = JSON.parse((await store.get('email:settings')) || '{}');
    if (Array.isArray(settings.sesTopicArns) && settings.sesTopicArns.length && !settings.sesTopicArns.includes(msg.TopicArn)) {
      return json({ error: 'Topic not allowed.' }, 403);
    }

    if (msg.Type === 'SubscriptionConfirmation') {
      const r = await fetch(msg.SubscribeURL, { method: 'GET' });
      return json({ ok: r.ok, confirmed: r.ok });
    }
    if (msg.Type !== 'Notification') return json({ ok: true, ignored: true });

    let inner = null;
    try { inner = JSON.parse(msg.Message); } catch { return json({ error: 'Bad Message JSON.' }, 400); }
    // Idempotency on SNS MessageId.
    const seenKey = 'email:evt:' + String(msg.MessageId || '').replace(/[^a-zA-Z0-9-]/g, '').substring(0, 80);
    if (seenKey.length > 10 && (await store.get(seenKey))) return json({ ok: true, duplicate: true });
    if (seenKey.length > 10) await store.put(seenKey, String(Date.now()), { expirationTtl: 30 * 86400 });

    const kind = String(inner.notificationType || inner.eventType || '');
    const out = { kind, processed: 0 };
    const suppression = JSON.parse((await store.get('email:suppression')) || '{}');

    if (kind === 'Bounce') {
      const btype = (inner.bounce || {}).bounceType || '';
      const hard = /permanent/i.test(btype);
      for (const r of (inner.bounce || {}).bouncedRecipients || []) {
        const email = normEmail(r.emailAddress || '');
        if (!email) continue;
        const hash = await emailHash(email);
        const id = await store.get('email:byemail:' + hash);
        if (id) {
          const c = JSON.parse((await store.get('email:c:' + id)) || 'null');
          if (c) {
            c.bounce = { hard, ts: Date.now(), diagnostic: String(r.diagnosticCode || '').substring(0, 200) };
            if (hard) { c.status = 'unsubscribed'; }
            c.updatedAt = Date.now();
            await store.put('email:c:' + id, JSON.stringify(c));
          }
        }
        if (hard && !suppression[hash]) suppression[hash] = { reason: 'hard-bounce', ts: Date.now() };
        out.processed++;
      }
    } else if (kind === 'Complaint') {
      for (const r of (inner.complaint || {}).complainedRecipients || []) {
        const email = normEmail(r.emailAddress || '');
        if (!email) continue;
        const hash = await emailHash(email);
        const id = await store.get('email:byemail:' + hash);
        if (id) {
          const c = JSON.parse((await store.get('email:c:' + id)) || 'null');
          if (c) {
            c.complaint = { ts: Date.now() };
            c.status = 'unsubscribed';
            c.updatedAt = Date.now();
            await store.put('email:c:' + id, JSON.stringify(c));
          }
        }
        if (!suppression[hash]) suppression[hash] = { reason: 'complaint', ts: Date.now() };
        out.processed++;
      }
    } else if (kind === 'Delivery') {
      out.processed = ((inner.delivery || {}).recipients || []).length;
    } else {
      return json({ ok: true, ignored: true, kind });
    }
    await store.put('email:suppression', JSON.stringify(suppression));
    return json(Object.assign({ ok: true }, out));
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
