// Contacts: CSV import, consent management, double opt-in, suppression-safe.
// POST /api/email-contacts  { password, action, ... }
import { json, checkAuth, kv, normEmail, validEmail, emailHash, tokenFor, sesSendRaw, buildRawMime, buildComplianceFooterText, buildComplianceFooterHtml } from './_email-lib.js';

function newId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function getSettings(store) {
  try { return Object.assign({ doubleOptIn: true }, JSON.parse((await store.get('email:settings')) || '{}')); } catch { return { doubleOptIn: true }; }
}

async function audit(store, action, detail) {
  try {
    const log = JSON.parse((await store.get('email:audit')) || '[]');
    log.unshift({ ts: Date.now(), actor: 'admin', action, detail: String(detail || '').substring(0, 300) });
    await store.put('email:audit', JSON.stringify(log.slice(0, 500)));
  } catch { /* */ }
}

function parseCsv(text) {
  // Minimal CSV: first line may be a header containing 'email'. Handles quotes.
  const rows = [];
  let cur = [''];
  let inQ = false;
  const t = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') {
        if (t[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; } else inQ = false;
      } else cur[cur.length - 1] += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') cur.push('');
    else if (ch === '\n' || ch === '\r') {
      if (cur.length > 1 || cur[0].trim() !== '') rows.push(cur);
      cur = [''];
      if (ch === '\r' && t[i + 1] === '\n') i++;
    } else cur[cur.length - 1] += ch;
  }
  if (cur.length > 1 || cur[0].trim() !== '') rows.push(cur);
  return rows.map((r) => r.map((c) => c.trim()));
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
    const action = String(body.action || 'stats');

    if (action === 'stats') {
      return json({ ok: true, stats: await contactStats(store) });
    }

    if (action === 'list') {
      const q = normEmail(body.q || '');
      const filter = String(body.filter || 'all');
      const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
      const cursor = body.cursor || null;
      const out = [];
      let nextCursor = null;
      // KV list with prefix; paginate.
      let res = await store.list({ prefix: 'email:c:', limit: 1000, cursor: cursor || undefined });
      const redact = (c) => ({ id: c.id, email: c.email, status: c.status, categories: c.categories || [], consent: c.consent || {}, confirmTs: c.confirmTs || 0, unsubTs: c.unsubTs || 0, bounce: !!((c.bounce || {}).hard), complaint: !!c.complaint, updatedAt: c.updatedAt });
      for (const k of res.keys) {
        if (out.length >= limit) { nextCursor = res.cursor || res.keys[res.keys.length - 1].name; break; }
        const c = JSON.parse((await store.get(k.name)) || 'null');
        if (!c) continue;
        if (q && !c.email.includes(q)) continue;
        if (filter === 'active' && !(c.status === 'active' && (c.consent || {}).status === 'opted-in')) continue;
        if (filter === 'unsubscribed' && c.status !== 'unsubscribed') continue;
        if (filter === 'pending' && c.status !== 'pending') continue;
        if (filter === 'suppressed' && !(c.status === 'unsubscribed' || ((c.bounce || {}).hard) || c.complaint)) continue;
        out.push(redact(c));
      }
      if (!nextCursor && res.list_complete === false) nextCursor = res.cursor;
      return json({ ok: true, contacts: out, nextCursor });
    }

    if (action === 'import') {
      // CSV import NEVER grants consent and NEVER reactivates suppression.
      const csv = String(body.csv || '');
      const source = String(body.source || 'csv-import').substring(0, 120);
      const purpose = String(body.purpose || 'marketing').substring(0, 80);
      const privacyVersion = String(body.privacyVersion || 'v1').substring(0, 20);
      const settings = await getSettings(store);
      const rows = parseCsv(csv);
      const start = rows.length && /email/i.test(rows[0].join(',')) ? 1 : 0;
      let imported = 0, duplicates = 0, invalid = 0, skippedSuppressed = 0;
      const suppression = JSON.parse((await store.get('email:suppression')) || '{}');
      for (let i = start; i < rows.length; i++) {
        const email = normEmail(rows[i][0]);
        if (!validEmail(email)) { invalid++; continue; }
        const hash = await emailHash(email);
        if (suppression[hash]) { skippedSuppressed++; continue; } // suppression survives re-import
        const byKey = 'email:byemail:' + hash;
        const existingId = await store.get(byKey);
        if (existingId) {
          const ex = JSON.parse((await store.get('email:c:' + existingId)) || 'null');
          if (ex) {
            if (ex.status === 'unsubscribed' || ((ex.bounce || {}).hard) || ex.complaint) { skippedSuppressed++; continue; }
            duplicates++;
            continue; // never overwrite consent on re-import
          }
        }
        const id = newId();
        const now = Date.now();
        const rec = {
          id, email, emailHash: hash, status: settings.doubleOptIn ? 'pending' : 'active',
          categories: [], consent: { status: 'unknown', purpose, source, method: 'csv-import', ts: now, evidence: 'csv row ' + (i + 1), privacyVersion },
          confirmTs: settings.doubleOptIn ? 0 : now, createdAt: now, updatedAt: now,
        };
        await store.put('email:c:' + id, JSON.stringify(rec));
        await store.put(byKey, id);
        imported++;
        if (imported % 200 === 0) { /* bounded; large imports run in chunks by caller */ }
      }
      await audit(store, 'contacts.import', 'imported=' + imported + ' dup=' + duplicates + ' invalid=' + invalid + ' suppressed-skip=' + skippedSuppressed + ' src=' + source);
      return json({ ok: true, imported, duplicates, invalid, skippedSuppressed, note: 'Imported contacts carry NO consent until confirmed/opted in. Suppressed addresses were not reactivated.' });
    }

    if (action === 'set-consent') {
      // Explicit opt-in recorded by admin (e.g. verified signup list). Requires evidence.
      const id = String(body.id || '');
      const evidence = String(body.evidence || '').substring(0, 300);
      if (!id || !evidence) return json({ error: 'id and evidence are required.' }, 400);
      const c = JSON.parse((await store.get('email:c:' + id)) || 'null');
      if (!c) return json({ error: 'Contact not found.' }, 404);
      const suppression = JSON.parse((await store.get('email:suppression')) || '{}');
      if (suppression[c.emailHash]) return json({ error: 'Address is suppressed; reactivation requires new explicit consent via double opt-in.' }, 409);
      c.consent = { status: 'opted-in', purpose: (c.consent || {}).purpose || 'marketing', source: (c.consent || {}).source || 'admin-verified', method: 'admin-verified-opt-in', ts: Date.now(), evidence, privacyVersion: (c.consent || {}).privacyVersion || 'v1' };
      c.status = 'active';
      c.confirmTs = Date.now();
      c.updatedAt = Date.now();
      await store.put('email:c:' + id, JSON.stringify(c));
      await audit(store, 'contacts.consent', id + ' opted-in evidence=' + evidence.substring(0, 80));
      return json({ ok: true });
    }

    if (action === 'confirm-request') {
      // Send double opt-in confirmation email (transactional, allowed pre-consent).
      const id = String(body.id || '');
      const c = JSON.parse((await store.get('email:c:' + id)) || 'null');
      if (!c) return json({ error: 'Contact not found.' }, 404);
      const settings = await getSettings(store);
      if (!settings.senderEmail || !validEmail(settings.senderEmail)) return json({ error: 'Sender identity not configured.' }, 409);
      const token = await tokenFor(env, 'confirm', c.email);
      const url = 'https://younghadene.ca/unsubscribe?mode=confirm&token=' + token + '&email=' + encodeURIComponent(c.email);
      const text = 'Confirm your subscription to ' + (settings.senderName || 'Young Hadene') + ' updates:\n\n' + url + '\n\nIf you did not request this, ignore this message.';
      const html = '<p>Confirm your subscription to ' + (settings.senderName || 'Young Hadene') + ' updates:</p><p><a href="' + url + '">Confirm subscription</a></p><p>If you did not request this, ignore this message.</p>';
      const r = await sendViaSes(env, settings, c.email, 'Confirm your subscription', text, html, null);
      return json({ ok: r.ok, status: r.status, dryRun: r.dryRun, detail: r.detail });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function contactStats(store) {
  let active = 0, pending = 0, unsub = 0, suppressed = 0, total = 0;
  let cursor;
  do {
    const res = await store.list({ prefix: 'email:c:', limit: 1000, cursor });
    for (const k of res.keys) {
      const c = JSON.parse((await store.get(k.name)) || 'null');
      if (!c) continue;
      total++;
      if (c.status === 'unsubscribed') unsub++;
      else if (c.status === 'pending') pending++;
      else if ((c.consent || {}).status === 'opted-in') active++;
      if (c.status === 'unsubscribed' || ((c.bounce || {}).hard) || c.complaint) suppressed++;
    }
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  const suppression = JSON.parse((await store.get('email:suppression')) || '{}');
  return { total, activeConsented: active, pending, unsubscribed: unsub, suppressedContacts: suppressed, suppressionEntries: Object.keys(suppression).length };
}

async function sendViaSes(env, settings, to, subject, text, html, unsub) {
  const accessKey = env && env.AWS_ACCESS_KEY_ID;
  const secretKey = env && env.AWS_SECRET_ACCESS_KEY;
  const region = (env && env.AWS_REGION) || settings.sesRegion || 'us-east-1';
  if (!accessKey || !secretKey) return { ok: false, status: 503, dryRun: true, detail: 'AWS credentials not configured; dry-run only.' };
  const from = (settings.senderName ? settings.senderName + ' <' + settings.senderEmail + '>' : settings.senderEmail);
  const raw = buildRawMime({ from, to, subject, textBody: text, htmlBody: html, unsubHttpsUrl: (unsub && unsub.https) || 'https://younghadene.ca/unsubscribe', unsubMailto: (unsub && unsub.mailto) || ('mailto:' + settings.senderEmail + '?subject=unsubscribe') });
  const r = await sesSendRaw({ region, accessKey, secretKey, rawMime: raw, configSet: settings.sesConfigSet || undefined, testClient: env.YH_SES_TEST_CLIENT });
  return { ok: r.ok, status: r.status, dryRun: false, detail: r.body && (r.body.MessageId || r.body.message || JSON.stringify(r.body)).toString().substring(0, 200) };
}
