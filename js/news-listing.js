// /news listing: repo (static) cards and KV posts as ONE list, deduped by
// slug and sorted by publish date, newest first. Same merge rules as the
// news RSS Function (#21, functions/news-rss.xml.js): a slug in both KV and
// the repo keeps the KV entry, removed (tombstoned) slugs are dropped, and
// items are ordered by date only (no "featured" pinning). Ties keep their
// existing order (static cards in page order, then KV in index order).
//
// Dates use the Toronto rules from functions/_news-dates.js (#22): a
// date-only value means midnight in Toronto (EDT/EST-aware), values with a
// time or offset ("...Z", "...-04:00") are taken as written, and a KV post's
// dateNum may be epoch ms, an ISO string or a date-only value. The helpers
// below are a copy of that file's; scripts/check-news-listing.mjs fails if
// they ever disagree.
//
// Repo cards carry their article's datePublished in data-published; a card
// without it falls back to its visible date ("October 24, 2026"), read as
// that day in Toronto.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YHNewsListing = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TZ = 'America/Toronto';
  var DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  var partsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  function torontoParts(ms) {
    var o = {};
    partsFmt.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  // Toronto's UTC offset in minutes at instant ms (-240 EDT, -300 EST).
  function torontoOffsetMin(ms) {
    var p = torontoParts(ms);
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }
  // Midnight Toronto time on a YYYY-MM-DD date, as epoch ms.
  function torontoMidnightMs(ymd) {
    var a = ymd.split('-').map(Number);
    var utcMid = Date.UTC(a[0], a[1] - 1, a[2]);
    var t = utcMid - torontoOffsetMin(utcMid) * 60000;
    t = utcMid - torontoOffsetMin(t) * 60000;
    return t;
  }
  // Parse a news date: date-only as Toronto midnight, else as written.
  function newsDateMs(value) {
    var v = String(value == null ? '' : value).trim();
    if (!v) return NaN;
    return DATE_ONLY.test(v) ? torontoMidnightMs(v) : Date.parse(v);
  }
  // A KV news post's publish instant (epoch ms, ISO string or date-only in
  // dateNum or date); `fallback` if none of those parse.
  function kvPostMs(p, fallback) {
    if (!p) return fallback;
    var n = Number(p.dateNum);
    if (isFinite(n) && n > 0) return n;
    var vals = [p.dateNum, p.date];
    for (var i = 0; i < vals.length; i++) {
      if (!/^\d{4}-\d{2}-\d{2}/.test(String(vals[i] == null ? '' : vals[i]).trim())) continue;
      var ms = newsDateMs(vals[i]);
      if (isFinite(ms)) return ms;
    }
    return fallback;
  }

  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // "October 24, 2026 · By Young Hadene" -> Toronto midnight on 2026-10-24.
  function displayDateMs(text) {
    var m = String(text || '').match(/([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})/);
    if (!m) return NaN;
    var mi = MONTHS.indexOf(m[1].toLowerCase());
    if (mi < 0) return NaN;
    return torontoMidnightMs(m[3] + '-' + pad(mi + 1) + '-' + pad(+m[2]));
  }
  function slugFromHref(href) {
    var m = String(href || '').trim().match(/\/news\/([^/?#\s]+?)(?:\.html)?\/?(?:[?#].*)?$/);
    return m ? m[1] : null;
  }
  // A repo card's publish instant: data-published, else its visible date.
  function staticCardMs(published, dateText) {
    var ms = newsDateMs(published);
    if (!isFinite(ms)) ms = displayDateMs(dateText);
    return isFinite(ms) ? ms : 0;
  }

  // statics: [{ slug, ms, ... }] in page order; kvPosts: KV index items in
  // index order (later lists may repeat a slug; the last copy wins);
  // removed: tombstoned slugs. Returns one deduped list, newest first, each
  // item { slug, ms, kv, ref } where ref is the static item or KV post.
  function mergeItems(statics, kvPosts, removed) {
    var gone = {};
    (removed || []).forEach(function (s) { gone[String(s)] = true; });
    var bySlug = {};
    var order = [];
    var seq = 0;
    function put(slug, item) {
      if (!slug || gone[slug]) return;
      if (!bySlug[slug]) order.push(slug);
      else item.seq = bySlug[slug].seq; // keep the slot's tie-break position
      bySlug[slug] = item;
    }
    (statics || []).forEach(function (s) {
      if (!s || !s.slug || gone[s.slug] || bySlug[s.slug]) return;
      put(s.slug, { slug: s.slug, ms: Number(s.ms) || 0, kv: false, ref: s, seq: seq++ });
    });
    (kvPosts || []).forEach(function (p) {
      if (!p || !p.slug) return;
      put(String(p.slug), { slug: String(p.slug), ms: kvPostMs(p, 0), kv: true, ref: p, seq: seq++ });
    });
    var out = order.map(function (s) { return bySlug[s]; });
    out.sort(function (a, b) { return (b.ms - a.ms) || (a.seq - b.seq); });
    return out;
  }

  // ── Browser wiring ──
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function kvCardHtml(p) {
    var blurb = p.excerpt || String(p.content || '').replace(/[#*>\-\[\]()`]/g, '').trim().substring(0, 140);
    return '<a class="news-card" href="/news/' + esc(p.slug) + '">'
      + '<div class="news-card-body"><span class="cat">' + esc(p.category || 'News') + '</span>'
      + '<h2>' + esc(p.title) + '</h2><p>' + esc(blurb) + '</p>'
      + '<span class="date">' + esc(p.date || '') + ' · By Young Hadene</span></div></a>';
  }
  function init(doc, baked, fetchFn) {
    var grid = doc.querySelector('.news-grid');
    if (!grid) return;
    var statics = [];
    grid.querySelectorAll('a.news-card').forEach(function (a) {
      var d = a.querySelector('.date');
      statics.push({
        slug: slugFromHref(a.getAttribute('href')),
        ms: staticCardMs(a.getAttribute('data-published'), d ? d.textContent : ''),
        el: a,
      });
    });
    var kv = Array.isArray(baked) ? baked.slice() : [];
    var removed = [];
    var placed = statics.map(function (s) { return s.el; });
    function render() {
      try {
        var items = mergeItems(statics, kv, removed);
        var els = items.map(function (it) {
          if (!it.kv) return it.ref.el;
          if (!it.ref.__el) {
            var tmp = doc.createElement('div');
            tmp.innerHTML = kvCardHtml(it.ref);
            it.ref.__el = tmp.firstChild;
          }
          return it.ref.__el;
        });
        // Cards no longer listed (removed, or a repo card whose slug has a
        // KV copy) leave the grid; the rest are re-appended in order.
        placed.forEach(function (el) { if (els.indexOf(el) < 0 && el.parentNode) el.parentNode.removeChild(el); });
        var frag = doc.createDocumentFragment();
        els.forEach(function (el) { frag.appendChild(el); });
        grid.appendChild(frag);
        placed = els;
      } catch (e) { console.error('news render failed:', e); }
    }
    if (kv.length) render();
    if (!fetchFn) return;
    fetchFn('/api/news-list', { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (!d) return;
      if (Array.isArray(d.removed)) removed = d.removed.map(String);
      if (Array.isArray(d.posts)) kv = kv.concat(d.posts);
      render();
    }).catch(function () { /* baked listing stays */ });
  }

  return {
    TZ: TZ, DATE_ONLY: DATE_ONLY, torontoOffsetMin: torontoOffsetMin, torontoMidnightMs: torontoMidnightMs,
    newsDateMs: newsDateMs, kvPostMs: kvPostMs, displayDateMs: displayDateMs, slugFromHref: slugFromHref,
    staticCardMs: staticCardMs, mergeItems: mergeItems, init: init,
  };
});
