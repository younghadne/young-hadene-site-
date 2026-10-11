// Email settings + SES health (admin-only).
// GET/POST /api/email-settings
import { json, checkAuth, kv, settingsChecklist, sesGetAccount } from './_email-lib.js';

const DEFAULTS = {
  senderName: '', senderEmail: '', mailingAddress: '', contactMethod: '',
  privacyVersion: 'v1', doubleOptIn: true, requireConsent: true,
  sesRegion: 'us-east-1', sesConfigSet: '', ratePerSec: 12,
  bouncePausePct: 5, complaintPausePct: 0.4, webhookKey: '',
};

export async function onRequestGet(context) {
  return json({ error: 'Use POST with admin password.' }, 405);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const auth = checkAuth(env, body.password);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const store = kv(env);
    if (!store) return json({ error: 'KV not configured (bind YH_POSTS)' }, 500);
    const action = String(body.action || 'get');

    if (action === 'get') {
      let s = {};
      try { s = JSON.parse((await store.get('email:settings')) || '{}'); } catch { s = {}; }
      s = Object.assign({}, DEFAULTS, s);
      const redacted = Object.assign({}, s);
      return json({ ok: true, settings: redacted, checklist: settingsChecklist(s) });
    }

    if (action === 'save') {
      const s = body.settings || {};
      const prev = JSON.parse((await store.get('email:settings')) || '{}');
      const next = Object.assign({}, DEFAULTS, prev);
      for (const k of Object.keys(DEFAULTS)) {
        if (s[k] !== undefined) next[k] = s[k];
      }
      next.senderName = String(next.senderName || '').substring(0, 120);
      next.senderEmail = String(next.senderEmail || '').substring(0, 160);
      next.mailingAddress = String(next.mailingAddress || '').substring(0, 300);
      await store.put('email:settings', JSON.stringify(next));
      await audit(store, 'settings.save', 'sender=' + next.senderEmail);
      return json({ ok: true, settings: next, checklist: settingsChecklist(next) });
    }

    if (action === 'audit') {
      const log = JSON.parse((await store.get('email:audit')) || '[]');
      return json({ ok: true, entries: log.slice(0, 100) });
    }

    if (action === 'health') {      // Live SES account check. Requires AWS creds in env (server-side only).
      const region = (env && env.AWS_REGION) || (JSON.parse((await store.get('email:settings')) || '{}').sesRegion) || 'us-east-1';
      const accessKey = env && env.AWS_ACCESS_KEY_ID;
      const secretKey = env && env.AWS_SECRET_ACCESS_KEY;
      if (!accessKey || !secretKey) {
        return json({ ok: false, error: 'AWS credentials not configured on the server (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY). SES status unknown — not assumed.' });
      }
      const r = await sesGetAccount({ region, accessKey, secretKey });
      return json({ ok: r.ok, status: r.status, account: r.body });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function audit(store, action, detail) {
  try {
    const log = JSON.parse((await store.get('email:audit')) || '[]');
    log.unshift({ ts: Date.now(), actor: 'admin', action, detail: String(detail || '').substring(0, 300) });
    await store.put('email:audit', JSON.stringify(log.slice(0, 500)));
  } catch { /* best effort */ }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
