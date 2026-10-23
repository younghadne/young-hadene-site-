// Chunked campaign sender. NEVER sends a whole campaign in one request.
// POST /api/email-batch  { password, campaignId, maxSends }
// Each invocation sends a bounded window, advances a durable cursor, and
// returns progress. An external scheduler (cron) calls it repeatedly.
// Suppression is re-checked per recipient immediately before sending.
import { json, checkAuth, kv, normEmail, recipientEligible, settingsChecklist, buildRawMime, buildComplianceFooterText, buildComplianceFooterHtml, tokenFor, sesSendRaw, sesGetAccount } from './_email-lib.js';

async function audit(store, action, detail) {
  try {
    const log = JSON.parse((await store.get('email:audit')) || '[]');
    log.unshift({ ts: Date.now(), actor: 'admin-batch', action, detail: String(detail || '').substring(0, 300) });
    await store.put('email:audit', JSON.stringify(log.slice(0, 500)));
  } catch { /* */ }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const auth = await checkAuth(env, body.password);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const store = kv(env);
    if (!store) return json({ error: 'KV not configured (bind YH_POSTS)' }, 500);

    const campaignId = String(body.campaignId || '');
    const maxSends = Math.min(500, Math.max(1, Number(body.maxSends) || 100));
    const c = JSON.parse((await store.get('email:camp:' + campaignId)) || 'null');
    if (!c) return json({ error: 'Campaign not found.' }, 404);
    if (c.status !== 'sending') return json({ ok: true, done: true, reason: 'campaign-' + c.status, campaign: { id: c.id, status: c.status, stats: c.stats } });

    const settings = JSON.parse((await store.get('email:settings')) || '{}');
    const chk = settingsChecklist(settings);
    if (chk.missing.length) {
      c.status = 'paused';
      await store.put('email:camp:' + campaignId, JSON.stringify(c));
      await audit(store, 'batch.autopause', campaignId + ' missing-settings');
      return json({ error: 'Paused: sender configuration missing: ' + chk.missing.join(', ') }, 409);
    }
    // Per-invocation enforcement re-check: a campaign launched before a
    // shutdown must halt on the next batch window, not drain the queue.
    if (env && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      try {
        const acct = await sesGetAccount({ region: (env && env.AWS_REGION) || settings.sesRegion || 'us-east-1', accessKey: env.AWS_ACCESS_KEY_ID, secretKey: env.AWS_SECRET_ACCESS_KEY, testClient: env.YH_SES_TEST_CLIENT });
        const eb = (acct && acct.body) || {};
        if (!acct.ok || eb.SendingEnabled === false || (eb.EnforcementStatus && eb.EnforcementStatus !== 'HEALTHY')) {
          c.status = 'paused';
          c.updatedAt = Date.now();
          await store.put('email:camp:' + campaignId, JSON.stringify(c));
          await audit(store, 'batch.autopause', campaignId + ' ses-enforcement=' + (eb.EnforcementStatus || 'unknown'));
          return json({ error: 'Paused: SES account cannot send (enforcement=' + (eb.EnforcementStatus || 'unknown') + ').', blocked: true }, 409);
        }
      } catch (e) {
        return json({ error: 'Paused: SES status check failed: ' + e.message, blocked: true }, 409);
      }
    }

    const accessKey = env && env.AWS_ACCESS_KEY_ID;
    const secretKey = env && env.AWS_SECRET_ACCESS_KEY;
    const region = (env && env.AWS_REGION) || settings.sesRegion || 'us-east-1';
    const dryRun = !(accessKey && secretKey);

    const suppression = JSON.parse((await store.get('email:suppression')) || '{}');
    const excl = JSON.parse((await store.get('email:camp:' + campaignId + ':excl')) || '{}');
    const from = (settings.senderName ? settings.senderName + ' <' + settings.senderEmail + '>' : settings.senderEmail);

    let sent = 0, failed = 0, skipped = 0;
    let cursor = Number(c.cursor) || 0;
    let stopReason = 'window-complete';
    const perSend = [];
    const errors = [];
    const pilotCap = c.pilotLimit && !c.pilotDone ? c.pilotLimit : Infinity;

    while (sent + failed < maxSends) {
      if (sent >= pilotCap) { stopReason = 'pilot-complete'; break; }
      const chunkIdx = Math.floor(cursor / 1000);
      const chunk = JSON.parse((await store.get('email:camp:' + campaignId + ':r:' + chunkIdx)) || 'null');
      if (!chunk) break; // no more recipients
      const id = chunk[cursor % 1000];
      cursor++;
      if (id == null) continue;
      const ct = JSON.parse((await store.get('email:c:' + id)) || 'null');
      if (!ct) { skipped++; c.stats.skipped = (c.stats.skipped || 0) + 1; continue; }
      // Idempotency: skip already-sent markers for this campaign.
      const sentKey = 'email:sent:' + campaignId + ':' + ct.id;
      if (await store.get(sentKey)) { skipped++; c.stats.skipped = (c.stats.skipped || 0) + 1; continue; }
      // Immediate pre-send suppression re-check (covers mid-campaign unsubscribes).
      const elig = recipientEligible(ct, suppression, excl);
      if (!elig.ok) { skipped++; c.stats.skipped = (c.stats.skipped || 0) + 1; perSend.push({ id: ct.id, skipped: elig.reason }); continue; }

      let token = 'unconfigured';
      try { token = await tokenFor(env, 'unsub', ct.email); } catch { /* EMAIL_SECRET missing -> dry-run only */ }
      const unsubUrl = 'https://younghadene.ca/unsubscribe?token=' + token + '&email=' + encodeURIComponent(ct.email);
      const text = (c.text || '') + buildComplianceFooterText(settings, unsubUrl);
      const html = (c.html || '') + buildComplianceFooterHtml(settings, unsubUrl);
      if (dryRun) {
        sent++;
        c.stats.sent = (c.stats.sent || 0) + 1;
        await store.put(sentKey, String(Date.now()), { expirationTtl: 90 * 86400 });
        perSend.push({ id: ct.id, dryRun: true });
        continue;
      }
      const raw = buildRawMime({ from, to: ct.email, subject: c.subject, textBody: text, htmlBody: html, unsubHttpsUrl: unsubUrl, unsubMailto: 'mailto:' + settings.senderEmail + '?subject=unsubscribe' });
      let r;
      try {
        r = await sesSendRaw({ region, accessKey, secretKey, rawMime: raw, configSet: settings.sesConfigSet || undefined, testClient: env.YH_SES_TEST_CLIENT });
      } catch (e) {
        r = { ok: false, status: 0, body: 'fetch-error:' + e.message };
      }
      if (r.ok) {
        sent++;
        c.stats.sent = (c.stats.sent || 0) + 1;
        const mid = r.body && r.body.MessageId ? String(r.body.MessageId).substring(0, 120) : '';
        await store.put(sentKey, JSON.stringify({ ts: Date.now(), mid }), { expirationTtl: 90 * 86400 });
        perSend.push({ id: ct.id, sent: true, mid });
      } else {
        const s = Number(r.status) || 0;
        const transient = s === 429 || s === 500 || s === 502 || s === 503 || s === 0 || /throttl|toomany|slowdown|tryagain/i.test(JSON.stringify(r.body || ''));
        if (transient) {
          cursor--; // retry this recipient next invocation (no marker written)
          stopReason = 'throttled:status=' + s;
          errors.push('throttle at cursor ' + cursor);
          break;
        }
        failed++;
        c.stats.failed = (c.stats.failed || 0) + 1;
        errors.push('send-failed:' + s);
        // SES-level suppression (e.g. account suppression list): mark contact suppressed.
        if (s === 400 && /suppression|suppressed/i.test(JSON.stringify(r.body || ''))) {
          ct.status = 'unsubscribed';
          ct.updatedAt = Date.now();
          await store.put('email:c:' + ct.id, JSON.stringify(ct));
          suppression[ct.emailHash] = { reason: 'ses-suppression', ts: Date.now(), campaignId };
        }
      }
    }

    c.cursor = cursor;
    c.updatedAt = Date.now();
    // Pilot phase: stop at the pilot cap for human review before full rollout.
    if (stopReason === 'pilot-complete' && c.status === 'sending') {
      c.status = 'pilot-review';
      await audit(store, 'batch.pilot-complete', campaignId + ' pilot-sent=' + c.stats.sent + ' review-required');
      await store.put('email:camp:' + campaignId, JSON.stringify(c));
      return json({ ok: true, dryRun, sent, failed, skipped, stopReason: 'pilot-complete', done: false, pilotReview: true, status: c.status });
    }
    // Reputation auto-pause (conservative defaults, configurable).
    const st = c.stats;
    const bouncePct = st.sent ? (100 * (st.bounced || 0)) / st.sent : 0;
    const compPct = st.sent ? (100 * (st.complained || 0)) / st.sent : 0;
    if ((st.sent >= 50 && bouncePct > Number(settings.bouncePausePct || 5)) || (st.sent >= 100 && compPct > Number(settings.complaintPausePct || 0.4))) {
      c.status = 'paused';
      await audit(store, 'batch.autopause', campaignId + ' bounce=' + bouncePct.toFixed(2) + '% complaint=' + compPct.toFixed(2) + '%');
      stopReason = 'auto-paused-reputation';
    }
    const done = (st.sent + st.failed + st.skipped) >= (st.eligible || 0);
    if (done && c.status === 'sending') {
      c.status = 'complete';
      await audit(store, 'campaign.complete', campaignId + ' sent=' + st.sent + ' failed=' + st.failed + ' skipped=' + st.skipped);
    }
    await store.put('email:camp:' + campaignId, JSON.stringify(c));
    await store.put('email:suppression', JSON.stringify(suppression));

    const rate = Number(settings.ratePerSec) || 12;
    const remaining = Math.max(0, (st.eligible || 0) - (st.sent + st.failed + st.skipped));
    return json({ ok: true, dryRun, sent, failed, skipped, stopReason, done, remaining, etaSeconds: Math.ceil(remaining / Math.max(1, rate)), status: c.status, errors: errors.slice(0, 5) });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
