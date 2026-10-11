// Campaigns: CRUD, compliance-gated launch, pause/resume/cancel, progress, reports, test send.
// POST /api/email-campaigns  { password, action, ... }
import { json, checkAuth, kv, normEmail, validEmail, emailHash, recipientEligible, settingsChecklist, buildRawMime, buildComplianceFooterText, buildComplianceFooterHtml, tokenFor, sesSendRaw } from './_email-lib.js';

function newId(p) {
  return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function getSettings(store) {
  try { return JSON.parse((await store.get('email:settings')) || '{}'); } catch { return {}; }
}

async function audit(store, action, detail) {
  try {
    const log = JSON.parse((await store.get('email:audit')) || '[]');
    log.unshift({ ts: Date.now(), actor: 'admin', action, detail: String(detail || '').substring(0, 300) });
    await store.put('email:audit', JSON.stringify(log.slice(0, 500)));
  } catch { /* */ }
}

async function eligibilitySnapshot(store, categories) {
  // Counts eligible vs suppressed across all contacts. For very large lists,
  // launch snapshots stream in chunks; counts are exact.
  const suppression = JSON.parse((await store.get('email:suppression')) || '{}');
  let eligible = 0, noConsent = 0, suppressed = 0, pending = 0;
  let cursor;
  do {
    const res = await store.list({ prefix: 'email:c:', limit: 1000, cursor });
    for (const k of res.keys) {
      const c = JSON.parse((await store.get(k.name)) || 'null');
      if (!c) continue;
      if (categories && categories.length && !(c.categories || []).some((x) => categories.includes(x)) && c.status !== 'unsubscribed') {
        // category-gated: contacts without the category are skipped (not counted eligible)
        if ((c.consent || {}).status === 'opted-in' && c.status === 'active') { noConsent++; }
        continue;
      }
      const r = recipientEligible(c, suppression, null);
      if (r.ok) eligible++;
      else if (String(r.reason).startsWith('suppressed')) suppressed++;
      else if (r.reason === 'unconfirmed' || r.reason === 'no-consent') { if (c.status === 'pending') pending++; else noConsent++; }
      else suppressed++;
    }
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return { eligible, noConsent, suppressed, pending };
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
    const action = String(body.action || 'list');

    if (action === 'list') {
      const out = [];
      let cursor;
      do {
        const res = await store.list({ prefix: 'email:camp:', limit: 100, cursor });
        for (const k of res.keys) {
          if (/:r:/.test(k.name) || k.name.endsWith(':excl')) continue;
          const c = JSON.parse((await store.get(k.name)) || 'null');
          if (c && c.id) out.push(summarize(c));
        }
        cursor = res.list_complete ? undefined : res.cursor;
      } while (cursor);
      out.sort((a, b) => b.updatedAt - a.updatedAt);
      return json({ ok: true, campaigns: out });
    }

    if (action === 'create' || action === 'update') {
      const id = action === 'create' ? newId('camp-') : String(body.id || '');
      if (!id) return json({ error: 'id required.' }, 400);
      const prev = action === 'create' ? null : JSON.parse((await store.get('email:camp:' + id)) || 'null');
      if (action === 'update' && !prev) return json({ error: 'Campaign not found.' }, 404);
      if (prev && (prev.status === 'sending')) return json({ error: 'Cannot edit while sending. Pause first.' }, 409);
      const now = Date.now();
      const c = Object.assign({}, prev || {}, {
        id, title: String(body.title || (prev && prev.title) || '').substring(0, 160),
        subject: String(body.subject || (prev && prev.subject) || '').substring(0, 200),
        html: String(body.html || (prev && prev.html) || '').substring(0, 500000),
        text: String(body.text || (prev && prev.text) || '').substring(0, 200000),
        categories: Array.isArray(body.categories) ? body.categories.map(String).slice(0, 20) : (prev && prev.categories) || [],
        scheduledFor: Number(body.scheduledFor || (prev && prev.scheduledFor) || 0),
        tz: String(body.tz || (prev && prev.tz) || 'UTC').substring(0, 60),
        status: (prev && prev.status) || 'draft',
        cursor: (prev && prev.cursor) || 0,
        stats: (prev && prev.stats) || { eligible: 0, sent: 0, failed: 0, skipped: 0, bounced: 0, complained: 0 },
        createdAt: (prev && prev.createdAt) || now, updatedAt: now,
      });
      await store.put('email:camp:' + id, JSON.stringify(c));
      await audit(store, 'campaign.' + action, id + ' ' + c.title.substring(0, 60));
      return json({ ok: true, campaign: summarize(c) });
    }

    if (action === 'checklist') {
      // Compliance gate preview: eligibility + missing settings. Launch requires this to pass.
      const id = String(body.id || '');
      const c = JSON.parse((await store.get('email:camp:' + id)) || 'null');
      if (!c) return json({ error: 'Campaign not found.' }, 404);
      const settings = await getSettings(store);
      const chk = settingsChecklist(settings);
      const snap = await eligibilitySnapshot(store, c.categories);
      const problems = [];
      if (chk.missing.length) problems.push('missing-settings:' + chk.missing.join(','));
      if (!c.subject.trim()) problems.push('missing-subject');
      if (!c.html.trim() && !c.text.trim()) problems.push('missing-body');
      if (!snap.eligible) problems.push('no-eligible-recipients');
      return json({ ok: problems.length === 0, problems, checklist: chk, snapshot: snap, campaign: summarize(c) });
    }

    if (action === 'launch') {
      const id = String(body.id || '');
      const c = JSON.parse((await store.get('email:camp:' + id)) || 'null');
      if (!c) return json({ error: 'Campaign not found.' }, 404);
      if (c.status === 'sending') return json({ error: 'Already sending.' }, 409);
      const settings = await getSettings(store);
      const chk = settingsChecklist(settings);
      if (chk.missing.length) return json({ error: 'Blocked: missing sender configuration: ' + chk.missing.join(', '), blocked: true }, 409);
      if (!c.subject.trim() || (!c.html.trim() && !c.text.trim())) return json({ error: 'Blocked: subject and body required.', blocked: true }, 409);
      // Materialize recipient id list in chunks (durable across restarts).
      const suppression = JSON.parse((await store.get('email:suppression')) || '{}');
      const chunks = [];
      let cur = [];
      let eligible = 0, skipped = 0;
      let cursor;
      do {
        const res = await store.list({ prefix: 'email:c:', limit: 1000, cursor });
        for (const k of res.keys) {
          const ct = JSON.parse((await store.get(k.name)) || 'null');
          if (!ct) continue;
          if (c.categories && c.categories.length && !(ct.categories || []).some((x) => c.categories.includes(x))) { skipped++; continue; }
          const r = recipientEligible(ct, suppression, null);
          if (!r.ok) { skipped++; continue; }
          cur.push(ct.id);
          eligible++;
          if (cur.length >= 1000) { chunks.push(cur); cur = []; }
        }
        cursor = res.list_complete ? undefined : res.cursor;
      } while (cursor);
      if (cur.length) chunks.push(cur);
      if (!eligible) return json({ error: 'Blocked: no eligible consented recipients.', blocked: true }, 409);
      for (let i = 0; i < chunks.length; i++) {
        await store.put('email:camp:' + id + ':r:' + i, JSON.stringify(chunks[i]));
      }
      c.chunks = chunks.length;
      c.cursor = 0;
      c.status = 'sending';
      c.launchedAt = Date.now();
      c.launchedBy = 'admin';
      c.stats = { eligible, sent: 0, failed: 0, skipped: 0, bounced: 0, complained: 0 };
      c.updatedAt = Date.now();
      await store.put('email:camp:' + id, JSON.stringify(c));
      await audit(store, 'campaign.launch', id + ' eligible=' + eligible + ' skipped=' + skipped);
      return json({ ok: true, campaign: summarize(c), eligible, skipped });
    }

    if (action === 'pause' || action === 'resume' || action === 'cancel') {
      const id = String(body.id || '');
      const c = JSON.parse((await store.get('email:camp:' + id)) || 'null');
      if (!c) return json({ error: 'Campaign not found.' }, 404);
      c.status = action === 'pause' ? 'paused' : action === 'resume' ? 'sending' : 'cancelled';
      c.updatedAt = Date.now();
      await store.put('email:camp:' + id, JSON.stringify(c));
      await audit(store, 'campaign.' + action, id);
      return json({ ok: true, campaign: summarize(c) });
    }

    if (action === 'progress') {
      const id = String(body.id || '');
      const c = JSON.parse((await store.get('email:camp:' + id)) || 'null');
      if (!c) return json({ error: 'Campaign not found.' }, 404);
      const settings = await getSettings(store);
      const rate = Number(settings.ratePerSec) || 12;
      const done = (c.stats.sent || 0) + (c.stats.failed || 0) + (c.stats.skipped || 0);
      const remaining = Math.max(0, (c.stats.eligible || 0) - done);
      return json({ ok: true, campaign: summarize(c), remaining, etaSeconds: Math.ceil(remaining / Math.max(1, rate)) });
    }

    if (action === 'report') {
      const id = String(body.id || '');
      const c = JSON.parse((await store.get('email:camp:' + id)) || 'null');
      if (!c) return json({ error: 'Campaign not found.' }, 404);
      const csv = 'metric,value\neligible,' + c.stats.eligible + '\nsent,' + c.stats.sent + '\nfailed,' + c.stats.failed + '\nskipped,' + c.stats.skipped + '\nbounced,' + c.stats.bounced + '\ncomplained,' + c.stats.complained + '\nstatus,' + c.status + '\n';
      return json({ ok: true, campaign: summarize(c), reportCsv: csv, note: 'Sent counts are SES acceptances, not proof of inbox delivery.' });
    }

    if (action === 'test-send') {
      // Sends the campaign draft to ONE admin-supplied address (still compliance-footers).
      const id = String(body.id || '');
      const to = normEmail(body.to || '');
      if (!validEmail(to)) return json({ error: 'Valid test address required.' }, 400);
      const c = JSON.parse((await store.get('email:camp:' + id)) || 'null');
      if (!c) return json({ error: 'Campaign not found.' }, 404);
      const settings = await getSettings(store);
      const chk = settingsChecklist(settings);
      if (chk.missing.length) return json({ error: 'Missing sender configuration: ' + chk.missing.join(', ') }, 409);
      const token = await tokenFor(env, 'unsub', to).catch(() => 'unconfigured');
      const unsubUrl = 'https://younghadene.ca/unsubscribe?token=' + token + '&email=' + encodeURIComponent(to);
      const text = (c.text || '[no plain-text version]') + buildComplianceFooterText(settings, unsubUrl);
      const html = (c.html || '<p>[no html version]</p>') + buildComplianceFooterHtml(settings, unsubUrl);
      const from = (settings.senderName ? settings.senderName + ' <' + settings.senderEmail + '>' : settings.senderEmail);
      const accessKey = env && env.AWS_ACCESS_KEY_ID;
      const secretKey = env && env.AWS_SECRET_ACCESS_KEY;
      if (!accessKey || !secretKey) return json({ ok: false, dryRun: true, detail: 'AWS credentials not configured; rendered MIME validated only.', subject: '[TEST] ' + c.subject });
      const raw = buildRawMime({ from, to, subject: '[TEST] ' + c.subject, textBody: text, htmlBody: html, unsubHttpsUrl: unsubUrl, unsubMailto: 'mailto:' + settings.senderEmail + '?subject=unsubscribe' });
      const r = await sesSendRaw({ region: (env && env.AWS_REGION) || settings.sesRegion || 'us-east-1', accessKey, secretKey, rawMime: raw, configSet: settings.sesConfigSet || undefined });
      await audit(store, 'campaign.test-send', id + ' to=' + to + ' status=' + r.status);
      return json({ ok: r.ok, status: r.status, detail: r.body });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function summarize(c) {
  return { id: c.id, title: c.title, subject: c.subject, status: c.status, categories: c.categories || [], cursor: c.cursor || 0, chunks: c.chunks || 0, stats: c.stats, scheduledFor: c.scheduledFor || 0, tz: c.tz || 'UTC', createdAt: c.createdAt, updatedAt: c.updatedAt, launchedAt: c.launchedAt || 0 };
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
