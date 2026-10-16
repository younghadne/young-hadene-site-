// Builds above-the-fold critical CSS for /videos and /videos/shorts from css/style.css.
// Usage: node scripts/critical-videos.cjs http://localhost:8765  (needs playwright resolvable)
const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs');
const base = process.argv[2];
const pages = [['videos.html', '/videos.html'], ['videos/shorts.html', '/videos/shorts.html']];
(async () => {
  const b = await chromium.launch();
  for (const [file, url] of pages) {
    const keep = new Set();
    for (const vp of [{ width: 402, height: 874 }, { width: 1440, height: 900 }]) {
      const p = await b.newPage({ viewport: vp });
      await p.goto(base + url, { waitUntil: 'load' });
      const ids = await p.evaluate((H) => {
        const sheet = [...document.styleSheets].find(s => s.href && s.href.includes('/css/style.css'));
        const vis = (sel) => { let els; try { els = document.querySelectorAll(sel.replace(/::?(hover|focus-visible|focus|active|before|after|placeholder|-webkit-scrollbar)\b/g, '') || '*'); } catch (e) { return true; } for (const el of els) { const r = el.getBoundingClientRect(); if (r.top + scrollY < H) return true; } return false; };
        const ids = []; const walk = (rules, path) => { [...rules].forEach((r, i) => { const id = path + '.' + i;
          if (r instanceof CSSMediaRule) walk(r.cssRules, id);
          else if (r instanceof CSSStyleRule) { if (r.selectorText.split(',').some(x => /^(:root|html|body|\*)/.test(x.trim()) || vis(x.trim()))) ids.push(id); }
          else ids.push(id); }); };
        walk(sheet.cssRules, 'r'); return ids;
      }, vp.height * 1.6);
      ids.forEach(i => keep.add(i));
      await p.close();
    }
    const p = await b.newPage();
    await p.goto(base + url, { waitUntil: 'load' });
    let out = await p.evaluate((keep) => {
      const K = new Set(keep); const sheet = [...document.styleSheets].find(s => s.href && s.href.includes('/css/style.css'));
      const ser = (rules, path) => [...rules].map((r, i) => { const id = path + '.' + i;
        if (r instanceof CSSMediaRule) { const inner = ser(r.cssRules, id); return inner ? '@media ' + r.conditionText + '{' + inner + '}' : ''; }
        return K.has(id) ? r.cssText : ''; }).join('');
      return ser(sheet.cssRules, 'r');
    }, [...keep]);
    await p.close();
    out = out.replace(/url\("?\.\.\/fonts\//g, 'url("/fonts/');
    let html = fs.readFileSync(file, 'utf8');
    html = html.replace(/\n?<style id="critical-css">[\s\S]*?<\/style>/, '');
    const blocking = '<link rel="stylesheet" href="/css/style.css">';
    const asyncTags = '<style id="critical-css">' + out + '</style>\n<link rel="stylesheet" href="/css/style.css" media="print" onload="this.media=\'all\';this.onload=null">\n<noscript><link rel="stylesheet" href="/css/style.css"></noscript>';
    if (html.includes(blocking)) html = html.replace(blocking, asyncTags);
    else html = html.replace(/<link rel="stylesheet" href="\/css\/style.css" media="print"/, '<style id="critical-css">' + out + '</style>\n$&');
    fs.writeFileSync(file, html);
    console.log(file, out.length);
  }
  await b.close();
})();
