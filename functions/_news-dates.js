// Toronto-time date formatting for the news Functions (news-rss.xml,
// news-sitemap.xml, /news/<slug> schema). Same rules as the static build's
// scripts/news-feeds.js, which keeps an identical CommonJS copy (the build
// can't import this ES module on every Node version); scripts/check-news-dates.mjs
// fails if the two ever disagree.
//
// News dates are Toronto dates: a date-only "2026-10-23" means midnight in
// Toronto, not midnight UTC. Offsets come from Intl, so EDT (-04:00) and
// EST (-05:00) switch on the right days.
const TZ = 'America/Toronto';
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', weekday: 'short',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function torontoParts(ms) {
  const o = {};
  for (const p of partsFmt.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}
// Toronto's UTC offset in minutes at instant ms (-240 EDT, -300 EST).
export function torontoOffsetMin(ms) {
  const p = torontoParts(ms);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}
const pad = (n) => String(n).padStart(2, '0');
function fmtOffset(min, colon = true) {
  const s = min < 0 ? '-' : '+', a = Math.abs(min);
  return s + pad(Math.floor(a / 60)) + (colon ? ':' : '') + pad(a % 60);
}
// Midnight Toronto time on a YYYY-MM-DD date, as epoch ms.
export function torontoMidnightMs(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const utcMid = Date.UTC(y, m - 1, d);
  let t = utcMid - torontoOffsetMin(utcMid) * 60000;
  t = utcMid - torontoOffsetMin(t) * 60000;
  return t;
}
// Epoch ms -> "2026-10-23T00:00:00-04:00" (Toronto time, ISO 8601).
export function torontoISOFromMs(ms) {
  const p = torontoParts(ms);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${fmtOffset(torontoOffsetMin(ms))}`;
}
// Parse a news date: date-only as Toronto midnight, else as written.
export function newsDateMs(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return NaN;
  return DATE_ONLY.test(v) ? torontoMidnightMs(v) : Date.parse(v);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// RFC 822 RSS date in Toronto time: "Fri, 23 Oct 2026 00:00:00 -0400".
export function rssDate(ms) {
  const p = torontoParts(ms);
  return `${p.weekday}, ${p.day} ${MONTHS[+p.month - 1]} ${p.year} ${p.hour}:${p.minute}:${p.second} ${fmtOffset(torontoOffsetMin(ms), false)}`;
}
// A KV news post's publish instant. dateNum is normally epoch ms; older or
// imported posts may hold an ISO string (e.g. "2026-10-23T14:00:00.000Z")
// or a date-only value there or in `date`. Falls back to `fallback`.
export function kvPostMs(p, fallback = Date.now()) {
  if (!p) return fallback;
  const n = Number(p.dateNum);
  if (Number.isFinite(n) && n > 0) return n;
  for (const v of [p.dateNum, p.date]) {
    // Only ISO-style values; a display date like "October 23, 2026" is left
    // alone rather than guessed at.
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(v == null ? '' : v).trim())) continue;
    const ms = newsDateMs(v);
    if (Number.isFinite(ms)) return ms;
  }
  return fallback;
}
