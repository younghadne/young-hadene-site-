// Guard: every news card in news.html is a well-formed, balanced element with
// the expected structure, and the cards match the news pages one-to-one.
//
//   <div class="news-grid">
//     <a class="news-card" href="/news/<slug>" [data-published="..."]>
//       [<img alt="...">]
//       <div class="news-card-body">
//         <span class="cat">..</span> <h2>..</h2> <p>..</p> <span class="date">Month D, YYYY ..</span>
//       </div>
//     </a>
//     ...
//   </div>
//
// No HTML parser is in the deps, so this uses a small strict tokenizer:
// comments, <script>/<style> raw text, quoted/unquoted attributes and void
// elements are handled; inside the grid every end tag must match the open
// element (no implicit closing), so a dropped </div> or </a> (e.g. from a
// careless news.html merge) fails. data-published is optional (checked for
// format only when present), so this works with or without #28.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FILE = 'news.html';
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const problems = [];
const html = fs.readFileSync(path.join(ROOT, FILE), 'utf8');

const lineAt = (() => {
  const starts = [0];
  for (let i = 0; i < html.length; i++) if (html[i] === '\n') starts.push(i + 1);
  return (pos) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; } return lo + 1; };
})();
const fail = (pos, msg) => problems.push(`${FILE}:${pos == null ? '?' : lineAt(pos)}: ${msg}`);

// ---- tokenizer -------------------------------------------------------------
function tokenize(src) {
  const toks = [];
  let i = 0;
  const pushText = (from, to) => { if (to > from) toks.push({ type: 'text', text: src.slice(from, to), pos: from }); };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { pushText(i, src.length); break; }
    pushText(i, lt);
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end < 0) { fail(lt, 'unterminated <!-- comment'); break; }
      i = end + 3; continue;
    }
    if (src[lt + 1] === '!' || src[lt + 1] === '?') {
      const end = src.indexOf('>', lt);
      if (end < 0) { fail(lt, 'unterminated declaration'); break; }
      i = end + 1; continue;
    }
    const m = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)/.exec(src.slice(lt, lt + 64));
    if (!m) { pushText(lt, lt + 1); i = lt + 1; continue; } // a literal '<'
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    // attributes
    let j = lt + m[0].length;
    const attrs = new Map();
    const dup = [];
    let selfClose = false, ended = false;
    while (j < src.length) {
      while (/\s/.test(src[j])) j++;
      if (src[j] === '>') { j++; ended = true; break; }
      if (src[j] === '/' && src[j + 1] === '>') { selfClose = true; j += 2; ended = true; break; }
      if (src[j] === '<') break; // a tag that never closed its '>'
      const an = /^[^\s"'>\/=<]+/.exec(src.slice(j, j + 256));
      if (!an) { j++; continue; }
      const key = an[0].toLowerCase();
      j += an[0].length;
      while (/\s/.test(src[j])) j++;
      let val = '';
      if (src[j] === '=') {
        j++;
        while (/\s/.test(src[j])) j++;
        const q = src[j];
        if (q === '"' || q === "'") {
          const end = src.indexOf(q, j + 1);
          if (end < 0) { fail(lt, `<${name}>: unterminated ${q} quoted attribute ${key}`); j = src.length; break; }
          val = src.slice(j + 1, end); j = end + 1;
        } else {
          const uv = /^[^\s>]*/.exec(src.slice(j))[0];
          val = uv; j += uv.length;
        }
      }
      if (attrs.has(key)) dup.push(key);
      attrs.set(key, val);
    }
    if (!ended) { fail(lt, `<${closing ? '/' : ''}${name}> tag is missing its closing ">"`); }
    toks.push({ type: closing ? 'end' : 'start', name, attrs, dup, selfClose, pos: lt });
    i = j;
    if (!closing && RAW.has(name) && !selfClose) {
      const re = new RegExp(`</${name}\\s*>`, 'ig');
      re.lastIndex = i;
      const em = re.exec(src);
      if (!em) { fail(lt, `<${name}> never closed`); break; }
      pushText(i, em.index);
      toks.push({ type: 'end', name, attrs: new Map(), dup: [], pos: em.index });
      i = em.index + em[0].length;
    }
  }
  return toks;
}

const classes = (t) => (t.attrs.get('class') || '').split(/\s+/).filter(Boolean);
const hasClass = (t, c) => classes(t).includes(c);
const toks = tokenize(html);

// ---- locate the grid; every .news-card in the document must be a direct child of it
const gridIdx = toks.flatMap((t, k) => (t.type === 'start' && hasClass(t, 'news-grid') ? [k] : []));
if (gridIdx.length !== 1) fail(gridIdx.length ? toks[gridIdx[1]].pos : null, `expected exactly one .news-grid, found ${gridIdx.length}`);

// ---- strict tree for the grid ------------------------------------------------
function buildStrict(startIdx) {
  const root = { name: toks[startIdx].name, tok: toks[startIdx], children: [], parent: null };
  const stack = [root];
  let k = startIdx + 1;
  for (; k < toks.length && stack.length; k++) {
    const t = toks[k];
    const top = stack[stack.length - 1];
    if (t.type === 'text') { top.children.push({ text: t.text, pos: t.pos }); continue; }
    if (t.type === 'start') {
      for (const d of t.dup) fail(t.pos, `<${t.name}> has duplicate attribute "${d}"`);
      const node = { name: t.name, tok: t, children: [], parent: top };
      top.children.push(node);
      if (!VOID.has(t.name) && !t.selfClose) stack.push(node);
      continue;
    }
    // end tag
    if (VOID.has(t.name)) { fail(t.pos, `stray </${t.name}> (void element)`); continue; }
    if (top.name === t.name) { top.endPos = t.pos; stack.pop(); continue; }
    const at = stack.map((n) => n.name).lastIndexOf(t.name);
    if (at < 0) { fail(t.pos, `stray </${t.name}> while <${top.name}> (line ${lineAt(top.tok.pos)}) is open`); continue; }
    for (let s = stack.length - 1; s > at; s--) fail(stack[s].tok.pos, `<${stack[s].name}${describe(stack[s].tok)}> is never closed (hit </${t.name}> at line ${lineAt(t.pos)})`);
    stack[at].endPos = t.pos;
    stack.length = at;
  }
  if (stack.length) for (const n of stack) fail(n.tok.pos, `<${n.name}${describe(n.tok)}> is never closed (end of file)`);
  return root;
}
function describe(t) {
  const c = t.attrs.get('class'); const h = t.attrs.get('href');
  return (c ? ` class="${c}"` : '') + (h ? ` href="${h}"` : '');
}
const elems = (n) => n.children.filter((c) => c.name);
const textOf = (n) => (n.text != null ? n.text : n.children.map(textOf).join(''));
const clean = (s) => s.replace(/\s+/g, ' ').trim();
function walk(n, fn) { for (const c of n.children || []) if (c.name) { fn(c); walk(c, fn); } }

const cards = [];
if (gridIdx.length >= 1) {
  const grid = buildStrict(gridIdx[0]);
  for (const c of grid.children) {
    if (!c.name) { if (clean(c.text)) fail(c.pos, `stray text in .news-grid: "${clean(c.text).slice(0, 60)}"`); continue; }
    if (!(c.name === 'a' && hasClass(c.tok, 'news-card'))) { fail(c.tok.pos, `.news-grid child must be <a class="news-card">, found <${c.name}${describe(c.tok)}>`); continue; }
    cards.push(c);
  }
  for (const card of cards) checkCard(card);
}

// any .news-card / /news/ link outside the grid's direct children is a swallowed or stray card
const cardToks = new Set(cards.map((c) => c.tok));
for (const t of toks) {
  if (t.type === 'start' && hasClass(t, 'news-card') && !cardToks.has(t)) fail(t.pos, `.news-card${describe(t)} is not a direct child of .news-grid (nested, unclosed sibling, or outside the grid)`);
}

function checkCard(card) {
  const t = card.tok;
  const where = `card ${t.attrs.get('href') || '(no href)'}`;
  if (card.endPos == null) fail(t.pos, `${where}: missing </a>`);
  const href = t.attrs.get('href');
  const m = /^\/news\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(href || '');
  if (!m) fail(t.pos, `${where}: href must be /news/<slug> (lowercase, no .html)`);
  card.slug = m ? m[1] : null;
  if (t.attrs.has('data-published') && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/.test(t.attrs.get('data-published'))) {
    fail(t.pos, `${where}: data-published "${t.attrs.get('data-published')}" is not an ISO date/time`);
  }
  // nothing link-like or card-like inside a card
  walk(card, (n) => {
    if (n.name === 'a') fail(n.tok.pos, `${where}: nested <a${describe(n.tok)}> inside a card`);
    else if (hasClass(n.tok, 'news-card')) fail(n.tok.pos, `${where}: nested .news-card inside a card`);
  });
  for (const x of card.children) if (!x.name && clean(x.text)) fail(x.pos, `${where}: stray text directly in the card`);
  const kids = elems(card);
  let k = 0;
  if (kids[k] && kids[k].name === 'img') {
    if (!clean(kids[k].tok.attrs.get('alt') || '')) fail(kids[k].tok.pos, `${where}: <img> without alt text`);
    if (!kids[k].tok.attrs.get('src')) fail(kids[k].tok.pos, `${where}: <img> without src`);
    k++;
  }
  const body = kids[k];
  if (!body || body.name !== 'div' || !hasClass(body.tok, 'news-card-body')) {
    fail(body ? body.tok.pos : t.pos, `${where}: expected <div class="news-card-body"> ${k ? 'after the <img>' : 'as first child'}`);
  } else {
    if (body.endPos == null) fail(body.tok.pos, `${where}: .news-card-body missing </div>`);
    if (kids.length > k + 1) for (const x of kids.slice(k + 1)) fail(x.tok.pos, `${where}: unexpected <${x.name}${describe(x.tok)}> after .news-card-body`);
    const want = [
      ['span', 'cat', (s) => s.length > 0, 'category'],
      ['h2', null, (s) => s.length > 0, 'title'],
      ['p', null, (s) => s.length > 0, 'summary'],
      ['span', 'date', (s) => /^[A-Z][a-z]+ \d{1,2}, \d{4}\b/.test(s), 'date ("Month D, YYYY ...")'],
    ];
    const bk = elems(body);
    if (bk.length !== want.length) fail(body.tok.pos, `${where}: .news-card-body has ${bk.length} elements (${bk.map((x) => x.name + (classes(x.tok).length ? '.' + classes(x.tok).join('.') : '')).join(', ')}), expected span.cat, h2, p, span.date`);
    want.forEach(([name, cls, ok, label], i) => {
      const x = bk[i];
      if (!x || x.name !== name || (cls && !hasClass(x.tok, cls))) { fail(x ? x.tok.pos : body.tok.pos, `${where}: element ${i + 1} of .news-card-body should be ${name}${cls ? '.' + cls : ''} (${label})`); return; }
      if (x.endPos == null) fail(x.tok.pos, `${where}: <${name}> ${label} is not closed`);
      if (!ok(clean(textOf(x)))) fail(x.tok.pos, `${where}: ${label} is empty or malformed: "${clean(textOf(x)).slice(0, 60)}"`);
    });
  }
}

// ---- cards <-> news pages, one-to-one ----------------------------------------
const seen = new Map();
for (const c of cards) {
  if (!c.slug) continue;
  if (seen.has(c.slug)) fail(c.tok.pos, `duplicate card for /news/${c.slug} (first at line ${lineAt(seen.get(c.slug))})`);
  else seen.set(c.slug, c.tok.pos);
}
const newsDir = path.join(ROOT, 'news');
const pages = new Set();
for (const f of fs.existsSync(newsDir) ? fs.readdirSync(newsDir) : []) {
  if (!f.endsWith('.html')) continue;
  const slug = f.slice(0, -5);
  const src = fs.readFileSync(path.join(newsDir, f), 'utf8');
  const redirect = /<meta[^>]+http-equiv=["']?refresh/i.test(src);
  const noindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(src);
  const canon = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(src);
  if (redirect || noindex) continue; // not a published article
  if (!canon || !canon[1].replace(/\/$/, '').endsWith(`/news/${slug}`)) { problems.push(`news/${f}: canonical should end with /news/${slug}`); }
  pages.add(slug);
}
for (const [slug, pos] of seen) {
  if (!fs.existsSync(path.join(newsDir, `${slug}.html`))) fail(pos, `card /news/${slug} has no page news/${slug}.html`);
  else if (!pages.has(slug)) fail(pos, `card /news/${slug} points at a redirect/noindex page`);
}
for (const slug of pages) if (!seen.has(slug)) problems.push(`news/${slug}.html has no card in ${FILE}`);
if (cards.length !== pages.size) problems.push(`${FILE} has ${cards.length} cards but news/ has ${pages.size} published pages`);

if (problems.length) {
  console.error(`NEWS-CARDS-CHECK: ${problems.length} problem(s)\n  ✗ ` + problems.join('\n  ✗ '));
  process.exit(1);
}
console.log(`NEWS-CARDS-CHECK OK: ${cards.length} well-formed news cards in ${FILE}, one per news/ page, no duplicates.`);
