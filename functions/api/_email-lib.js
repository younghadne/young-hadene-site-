// Shared email-marketing core: YoungHadene.ca bulk SES platform.
// Dependency-free (WebCrypto + fetch globals only) so it runs in
// Cloudflare Pages Functions AND in node18+ unit tests.
// This file is imported relatively by functions/api/email-*.js endpoints.
// It intentionally creates NO route itself (underscore prefix).

const enc = new TextEncoder();

export function b64encode(bytes) {
  let s = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  if (typeof btoa !== 'undefined') return btoa(s);
  return Buffer.from(s, 'binary').toString('base64');
}

export function b64decodeToBytes(b64) {
  if (typeof atob !== 'undefined') {
    const s = atob(b64);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export async function sha256hexBytes(data) {
  const buf = typeof data === 'string' ? enc.encode(data) : data;
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function hmacHex(keyBytes, msg) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a, b) {
  a = String(a == null ? '' : a);
  b = String(b == null ? '' : b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export function checkAuth(env, password) {
  const expected = env && env.ADMIN_PASSWORD;
  if (!expected) return { ok: false, status: 500, error: 'ADMIN_PASSWORD not configured on the server' };
  if (!password || !timingSafeEqual(String(password), String(expected))) {
    return { ok: false, status: 401, error: 'Incorrect password' };
  }
  return { ok: true };
}

export function kv(env) {
  return (env && env.YH_POSTS) || null;
}

export function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

export function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail(e));
}

export async function emailHash(email) {
  return sha256hexBytes('yh-email:' + normEmail(email));
}

// ---- Deliverability validation (list hygiene for bounce prevention) ----
// MX lookup via DNS-over-HTTPS (works in Workers and Node; no raw DNS API).
// Returns { mx: true|false|'unknown', domain }. 'unknown' on resolver failure
// (never treated as proof of invalidity).
export async function checkDomainMx(domain, fetchFn, cache) {
  const d = String(domain || '').trim().toLowerCase();
  if (!d || d.indexOf('.') < 0) return { mx: false, domain: d };
  if (cache && cache.has(d)) return cache.get(d);
  const f = fetchFn || fetch;
  try {
    const res = await f('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(d) + '&type=MX', {
      headers: { Accept: 'application/dns-json' },
    });
    if (!res.ok) throw new Error('doh-' + res.status);
    const j = await res.json();
    // Status 0 = NOERROR. MX answers live in Answer with type 15.
    const answers = (j && j.Answer) || [];
    const hasMx = j.Status === 0 && answers.some((a) => a && a.type === 15);
    const out = { mx: hasMx, domain: d };
    if (cache) cache.set(d, out);
    return out;
  } catch (e) {
    return { mx: 'unknown', domain: d, error: String((e && e.message) || e).substring(0, 80) };
  }
}

// ---- Recipient validation statuses ----
// VALIDATED: syntax + domain checks passed, no suppression/eligibility issue found.
// INVALID: malformed address or confirmed invalid domain.
// SUPPRESSED: bounce, complaint, unsubscribe, or other suppression applies.
// INELIGIBLE: required consent or legal eligibility cannot be established.
// UNKNOWN: DNS failure, temporary error, or insufficient evidence.
// DUPLICATE: already present in the same campaign.
// VALIDATED never guarantees mailbox existence or delivery.
export function validationStatus(contact, suppression) {
  if (!contact) return { status: 'INVALID', reason: 'missing-record' };
  const h = contact.emailHash;
  if (h && suppression && suppression[h]) return { status: 'SUPPRESSED', reason: String(suppression[h].reason || 'suppressed') };
  if (contact.status === 'unsubscribed' || ((contact.bounce || {}).hard) || contact.complaint) {
    return { status: 'SUPPRESSED', reason: contact.status === 'unsubscribed' ? 'unsubscribed' : (contact.complaint ? 'complaint' : 'hard-bounce') };
  }
  if (contact.status === 'invalid') return { status: 'INVALID', reason: (contact.validation && contact.validation.mx) || 'invalid-address' };
  const v = contact.validation || {};
  if (!v.mx) return { status: 'UNKNOWN', reason: 'not-validated' };
  if (v.mx !== 'mx-ok') return { status: 'UNKNOWN', reason: v.mx };
  const c = contact.consent || {};
  if (c.status !== 'opted-in') return { status: 'INELIGIBLE', reason: contact.status === 'pending' ? 'unconfirmed' : 'no-consent' };
  return { status: 'VALIDATED', reason: 'ok' };
}

export async function validateDeliverability(email, fetchFn, cache) {
  const e = normEmail(email);
  if (!validEmail(e)) return { valid: false, reason: 'bad-syntax' };
  const domain = e.split('@')[1] || '';
  const r = await checkDomainMx(domain, fetchFn, cache);
  if (r.mx === true) return { valid: true, reason: 'mx-ok', domain };
  if (r.mx === 'unknown') return { valid: true, reason: 'mx-unverified', domain, warning: 'resolver unavailable; not counted as invalid' };
  return { valid: false, reason: 'no-mx', domain };
}

// ---- Tokens (HMAC, no storage; deterministic + idempotent) ----
export async function tokenFor(env, purpose, email) {
  const secret = env && env.EMAIL_SECRET;
  if (!secret) throw new Error('EMAIL_SECRET not configured');
  return hmacHex(enc.encode(String(secret)), purpose + ':' + normEmail(email));
}

export async function tokenValid(env, purpose, email, token) {
  try {
    const expect = await tokenFor(env, purpose, email);
    return timingSafeEqual(expect, String(token || ''));
  } catch {
    return false;
  }
}

// ---- Consent / suppression ----
export const REQUIRED_SETTING_KEYS = ['senderName', 'senderEmail', 'mailingAddress'];

export function settingsChecklist(s) {
  s = s || {};
  const missing = [];
  for (const k of REQUIRED_SETTING_KEYS) {
    if (!String(s[k] || '').trim()) missing.push(k);
  }
  if (!validEmail(s.senderEmail || '')) missing.push('senderEmailValid');
  return { ok: missing.length === 0, missing };
}

// suppression: { [emailHash]: { reason, ts, campaignId } }
export function isSuppressed(suppression, hash) {
  const r = (suppression || {})[hash];
  return r ? r : null;
}

// A contact is mailable only with explicit opt-in consent (never by import alone).
// Quarantined (invalid) addresses are never mailable.
export function consentEligible(contact) {
  if (!contact || contact.status === 'unsubscribed' || contact.status === 'invalid') {
    return { ok: false, reason: contact && contact.status === 'invalid' ? 'invalid-address' : 'unsubscribed' };
  }
  if (contact.bounce && contact.bounce.hard) return { ok: false, reason: 'hard-bounce' };
  if (contact.complaint) return { ok: false, reason: 'complaint' };
  const c = contact.consent || {};
  if (c.status !== 'opted-in') return { ok: false, reason: 'no-consent' };
  if (contact.status === 'pending' && !contact.confirmTs) return { ok: false, reason: 'unconfirmed' };
  return { ok: true };
}

export function recipientEligible(contact, suppression, campaignExclusions) {
  const h = contact && contact.emailHash;
  if (h && suppression && suppression[h]) return { ok: false, reason: 'suppressed:' + suppression[h].reason };
  if (campaignExclusions && campaignExclusions[h]) return { ok: false, reason: 'excluded' };
  // Final gate: only VALIDATED recipients proceed (.unknown/invalid/ineligible excluded).
  const vs = validationStatus(contact, suppression);
  if (vs.status !== 'VALIDATED') return { ok: false, reason: vs.status.toLowerCase() + ':' + vs.reason };
  return { ok: true };
}

// ---- MIME builder (multipart/alternative + List-Unsubscribe) ----
function mimeHeaderEncode(s) {
  s = String(s == null ? '' : s);
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return '=?UTF-8?B?' + b64encode(enc.encode(s)) + '?=';
}

export function buildComplianceFooterText(s, unsubUrl) {
  return (
    '\n\n--\n' + (s.senderName || 'Young Hadene') + '\n' + (s.mailingAddress || '') +
    (s.contactMethod ? '\n' + s.contactMethod : '') +
    '\nUnsubscribe: ' + unsubUrl +
    '\nYou received this because you subscribed at younghadene.ca.'
  );
}

export function buildComplianceFooterHtml(s, unsubUrl) {
  const esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    '<br><br>--<br>' + esc(s.senderName || 'Young Hadene') + '<br>' + esc(s.mailingAddress || '') +
    (s.contactMethod ? '<br>' + esc(s.contactMethod) : '') +
    '<br><a href="' + unsubUrl + '">Unsubscribe</a>' +
    '<br>You received this because you subscribed at younghadene.ca.'
  );
}

export function buildRawMime({ from, to, subject, textBody, htmlBody, unsubHttpsUrl, unsubMailto }) {
  const boundary = 'yh' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const lines = [
    'From: ' + mimeHeaderEncode(from),
    'To: ' + mimeHeaderEncode(to),
    'Subject: ' + mimeHeaderEncode(subject),
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    'List-Unsubscribe: <' + unsubMailto + '>, <' + unsubHttpsUrl + '>',
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    '',
    '--' + boundary,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    textBody,
    '',
    '--' + boundary,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    '',
    '--' + boundary + '--',
    '',
  ];
  return lines.join('\r\n');
}

// ---- AWS SDK v2 (official): SESv2 SendEmail Raw + GetAccount ----
// Credentials always come from server-side env, never from the repo or browser.
import { SESv2Client, SendEmailCommand, GetAccountCommand } from '@aws-sdk/client-sesv2';

function sesClient(region, accessKey, secretKey) {
  return new SESv2Client({ region, credentials: { accessKeyId: accessKey, secretAccessKey: secretKey } });
}

function sdkErr(e) {
  const status = (e && e.$metadata && e.$metadata.httpStatusCode) || 0;
  const msg = (e && (e.message || e.name)) || 'unknown-error';
  return { ok: false, status, body: { error: String(msg).substring(0, 300), name: e && e.name } };
}

export async function sesSendRaw({ region, accessKey, secretKey, rawMime, configSet, testClient }) {
  try {
    const input = { Content: { Raw: { Data: enc.encode(rawMime) } } };
    if (configSet) input.ConfigurationSetName = configSet;
    // testClient is honored only when explicitly passed (unit tests); production always builds a real client.
    const client = testClient || sesClient(region, accessKey, secretKey);
    const out = await client.send(new SendEmailCommand(input));
    return { ok: true, status: 200, body: { MessageId: out.MessageId } };
  } catch (e) {
    return sdkErr(e);
  }
}

// ---- SES GetAccount (quota/health; read-only) ----
export async function sesGetAccount({ region, accessKey, secretKey, testClient }) {
  try {
    const client = testClient || sesClient(region, accessKey, secretKey);
    const out = await client.send(new GetAccountCommand({}));
    return { ok: true, status: 200, body: out };
  } catch (e) {
    return sdkErr(e);
  }
}

// ---- SNS signature verification (bounce/complaint ingestion) ----
export function snsStringToSign(msg) {
  const f = (k) => (msg && msg[k] != null ? String(msg[k]) : '');
  if (msg && msg.SignatureVersion === '2') {
    if (msg.Type === 'Notification') {
      return 'Message\n' + f('Message') + '\nMessageId\n' + f('MessageId') + '\nSubject\n' + f('Subject') + '\nTimestamp\n' + f('Timestamp') + '\nTopicArn\n' + f('TopicArn') + '\nType\n' + f('Type') + '\n';
    }
    return 'Message\n' + f('Message') + '\nMessageId\n' + f('MessageId') + '\nSubscribeURL\n' + f('SubscribeURL') + '\nTimestamp\n' + f('Timestamp') + '\nToken\n' + f('Token') + '\nTopicArn\n' + f('TopicArn') + '\nType\n' + f('Type') + '\n';
  }
  return null;
}

export async function verifySnsSignature(msg, fetchFn) {
  const f = fetchFn || fetch;
  try {
    if (!msg || msg.SignatureVersion !== '2' || !msg.SigningCertURL || !msg.Signature) return false;
    const u = new URL(msg.SigningCertURL);
    if (u.protocol !== 'https:') return false;
    if (!/\.amazonaws\.com(\.|$)/.test(u.hostname)) return false;
    const toSign = snsStringToSign(msg);
    if (!toSign) return false;
    const pem = await (await f(msg.SigningCertURL)).text();
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const der = b64decodeToBytes(b64);
    const certBuf = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength);
    // Minimal X.509 parse: find the subjectPublicKeyInfo BIT STRING and import it.
    const spki = extractSpkiFromCert(new Uint8Array(certBuf));
    if (!spki) return false;
    const key = await crypto.subtle.importKey('spki', spki.buffer.slice(spki.byteOffset, spki.byteOffset + spki.byteLength), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64decodeToBytes(msg.Signature), enc.encode(toSign));
  } catch {
    return false;
  }
}

// Tiny DER walk to locate subjectPublicKeyInfo inside a Certificate.
export function extractSpkiFromCert(der) {
  try {
    let o = 0;
    const readLen = () => {
      let l = der[o++];
      if (l < 128) return l;
      const n = l & 127;
      l = 0;
      for (let i = 0; i < n; i++) l = (l << 8) | der[o++];
      return l;
    };
    const readTlv = () => {
      const t = der[o++];
      const l = readLen();
      const v = der.subarray(o, o + l);
      o += l;
      return { t, v };
    };
    const outer = readTlv(); // Certificate SEQUENCE
    if (outer.t !== 0x30) return null;
    let p = 0;
    const sub = (buf) => {
      let q = 0;
      const rl = () => {
        let l = buf[q++];
        if (l < 128) return l;
        const n = l & 127;
        l = 0;
        for (let i = 0; i < n; i++) l = (l << 8) | buf[q++];
        return l;
      };
      const rt = () => {
        const t = buf[q++];
        const l = rl();
        const v = buf.subarray(q, q + l);
        q += l;
        return { t, v, start: q - l, total: (q - l) + l, hdrLen: (q - l) - (q - l - 0) };
      };
      return { rt };
    };
    void p; void sub;
    // Walk: Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
    // tbsCertificate ::= SEQUENCE { ... subjectPublicKeyInfo ... } — find nested SEQUENCE with BIT STRING child.
    const seq = outer.v;
    let q = 0;
    const gLen = () => {
      let l = seq[q++];
      if (l < 128) return l;
      const n = l & 127;
      l = 0;
      for (let i = 0; i < n; i++) l = (l << 8) | seq[q++];
      return l;
    };
    const gTlv = () => {
      const start = q;
      const t = seq[q++];
      const l = gLen();
      const v = seq.subarray(q, q + l);
      q += l;
      return { t, v, start, end: q };
    };
    const tbs = gTlv(); // tbsCertificate
    if (tbs.t !== 0x30) return null;
    // Inside tbs, scan for subjectPublicKeyInfo: SEQUENCE { SEQUENCE(alg), BIT STRING }
    const walk = (buf) => {
      let i = 0;
      const il = () => {
        let l = buf[i++];
        if (l < 128) return l;
        const n = l & 127;
        l = 0;
        for (let j = 0; j < n; j++) l = (l << 8) | buf[i++];
        return l;
      };
      const it = () => {
        const s = i;
        const t = buf[i++];
        const l = il();
        const v = buf.subarray(i, i + l);
        i += l;
        return { t, v, s, e: i };
      };
      const out = [];
      while (i < buf.length) {
        try { out.push(it()); } catch { break; }
      }
      return out;
    };
    const kids = walk(tbs.v);
    for (const k of kids) {
      if (k.t !== 0x30) continue;
      const gk = walk(k.v);
      if (gk.length >= 2 && gk[0].t === 0x30 && gk[1].t === 0x03) {
        // Return the full SPKI SEQUENCE bytes (from k.s to k.e within tbs.v)
        return tbs.v.subarray(k.s, k.e);
      }
    }
    return null;
  } catch {
    return null;
  }
}
