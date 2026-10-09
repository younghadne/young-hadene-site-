# Young Hadene Site — Session Log (pick up here every time)

> Last updated: 2026-10-09. Read this file first in any new session about
> the younghadene site, then check `git log --oneline -5` and `git status`.

## The site
- Artist site for **Young Hadene** (Haitian-Toronto drill / dark trap).
  Goal: rank as a top rapper in Canada + drill music (keywords: younghadene).
- Folder: `/Users/hadene/Downloads/young-hadene-site`
- Repo: `younghadne/young-hadene-site-`, branch `main`
- Live: https://younghadene.ca (Cloudflare Pages + Functions, auto-deploys on
  push in ~2-5 min). Local dev: `node server.js` → http://localhost:3456/
- NEVER edit SEO titles/meta casually — owner said don't change SEO (Oct 9),
  except targeted ranking work explicitly requested.

## How publishing works (instant, no rebuild wait)
- Admin (`admin.html`) → `POST /api/posts` → `functions/api/posts.js`
  commits to GitHub in order: **blog/posts.json FIRST** (listing),
  article file, then blog.html baked listing + sitemap (best-effort).
- Listing reads live: `/api/posts-list` ← blog/posts.json via GitHub API.
- Articles served instantly: `functions/blog/[slug].js` reads from GitHub.
- Delete mirrors this: `DELETE /api/posts?slug=<slug>` (query-style ONLY —
  path-style `/api/posts/<slug>` has NO function route live and 404s).
- Local `server.js` also has `/api/posts-list` and syncs
  `yh_blogPosts.json` <-> `blog/posts.json` on publish/delete.
- Admin All Posts reads `/api/posts-list` first, baked blog.html fallback.
- Blog page: 6 posts/page, working pager (`gotoPage`), category resets to p1.

## What's done (Oct 9)
1. Local server running; fixed missing `/api/posts-list` (was 404 locally).
2. Deleted test posts: cas, vdsvd, die, fsvffs, sddddv (+ scsc, dfvff, dfsdfs,
   1, debug etc. removed by owner online).
3. Removed 25 duplicate "Best Toronto Rappers" filler posts (kept original
   May-31 `top-toronto-rappers`).
4. Fixed dead blog pagination (6/page, prev/next, tested via node harness).
5. SEO pass (Google starter guide): unique titles+descs on 28 pages, deleted
   16 empty `hat-to-know` pages + 32 301s in `_redirects`, canonicals,
   sitemap rebuild, homepage retargeted to Toronto Drill / Canadian Hip-Hop.
6. E-E-A-T: Person schema on about.html, foundingMember on index.html.
7. Wrote 5 ranking posts cloning top-toronto-rappers format, all with
   `younghadene` keyword: top-canadian-rappers-2026,
   top-toronto-drill-artists-2026, best-underground-canadian-hip-hop-2026,
   top-haitian-canadian-musicians-2026, best-dark-trap-artists-2026.

## Standing quirks / watch-outs
- Cloudflare deploys lag pushes by several minutes; always hard-refresh
  (`Cmd+Shift+R`) before retesting live.
- `git pull --no-rebase` often needed before push: owner publishes/deletes
  from live admin constantly (commits as younghadne bot).
- `blog.html` baked SERVER_POSTS can drift from posts.json; `node
  scripts/build-static.js` reconciles (self-heals from disk files).
- Root legacy articles (top-toronto-rappers.html, what-to-know-*.html)
  canonicalize to /blog/ versions; sitemap intentionally lists /blog/ only.
- `yh_blogPosts.json` + `analytics.json` are local-only (gitignored but
  still tracked — don't force-push removals).
- Live admin auth = Cloudflare `ADMIN_PASSWORD` env (fallback in code);
  never print or commit secrets.

## Possible next steps (owner's goals)
- More ranking-clone posts (songs, venues, producers batch).
- Search Console + sitemap submit; backlinks/press for authority.
