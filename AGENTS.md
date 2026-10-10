# AGENTS.md — Permanent Project Rules for younghadene.ca

> These rules are permanent. Read and follow them before starting ANY task
> involving https://younghadene.ca. Never replace this stack without asking.

## 1. Approved platforms ONLY

- **Cloudflare** — website hosting (Pages), deployments, Pages Functions,
  security, DNS, and required website infrastructure.
- **GitHub** — source code, version control, commits, repository management
  (`younghadne/young-hadene-site-`).

Do NOT introduce additional hosting providers, databases, auth platforms,
external backends, or third-party infrastructure without explicit permission.
Use existing Cloudflare services (Pages, Functions, env vars/secrets).
No KV / D1 / Workers / external DB unless explicitly approved.

## 2. How this site is actually built (verified 2026-10-10)

- Production origin is **Cloudflare Pages** (proven: live `/api/*` JSON
  responses come from `functions/api/*.js`). Cloudflare also proxies DNS/CDN.
- The repo's `gh-pages` branch + GitHub Pages settings are LEGACY — pushes
  there do not reliably affect the live site. Deploy by pushing the branch
  the Pages project builds as production (confirm in Cloudflare dashboard).
- `server.js` is LOCAL DEV ONLY (never runs in production).
- `functions/api/` runs in production: `auth.js`, `posts.js`, `news.js`,
  `posts-list.js`, `news-list.js`, `proxy.js`. Dynamic article routes:
  `functions/blog/[slug].js`, `functions/news/[slug].js`.
- **Blog storage is Cloudflare KV** (binding `YH_POSTS`), NOT GitHub:
  `blog:index` / `news:index` (doc arrays, newest first),
  `blog:<slug>` / `news:<slug>` (full docs), `deleted` (tombstones so
  deletions 404 instantly), `redirects` (old-slug → new-slug 301s),
  `stats` (viewsTotal, lastPublish). Doc fields: id/title/slug/section/
  category/content/takeaways/faq/excerpt/tags/date/dateNum/featured/
  status(draft|published|scheduled)/scheduledFor/updatedAt/author/image/
  imageAlt/seoTitle/seoDesc/ogTitle/ogDesc/ogImage/canonical/views.
  Public reads show published + past-due scheduled only. Never commit,
  push, or redeploy for routine POST/DELETE. Never use GitHub as post
  storage. GitHub stays for source code only.
- Dynamic routes that MUST keep working: `/api/posts`, `/api/news`
  (CRUD, password per request), `/api/posts-list`, `/api/news-list`
  (public index; authed POST adds includeDrafts/summary), `/api/export`
  + `/api/migrate` (password-protected), `/blog/:slug`, `/news/:slug`
  (KV render + redirects + view counting + static fallback),
  `/sitemap.xml`, `/news-sitemap.xml`, `/news-rss.xml` (dynamic, union
  static + KV — verified to take precedence under Pages routing).
- Required Pages env: `ADMIN_PASSWORD` (no fallback — fail closed).
  One-time setup still needed in Cloudflare dashboard: create the
  `YH_POSTS` KV namespace, bind it, set `ADMIN_PASSWORD`, then run
  `POST /api/migrate` once to seed KV from the deployed static files.
- Admin login gate lives in `admin.html`; writes go through server-verified
  endpoints only. No AI auto-generation, no GitHub publishing in the manager.

## 3. Admin auth rules

- Server-side password verification; never trust client-side checks alone.
- Secrets (`ADMIN_PASSWORD`, `SESSION_SECRET`, `GITHUB_TOKEN`, …) live ONLY
  in Cloudflare Pages environment variables / secrets. NEVER hardcode them
  in the repo — `functions/api/auth.js` must fail closed when env is missing.
- Secure password hashing, protected admin routes, secure sessions
  (HttpOnly, Secure, SameSite, expiry). No plaintext passwords in code.
- Preserve the existing admin account, content, design, SEO, blog, feeds.
  Never delete accounts, wipe data, or rebuild auth unnecessarily.
- Past gotchas in `admin.html`: (a) `sha256Hex()` is async — always `await`
  it; (b) NEVER put a literal `</script>` inside inline JS strings — it
  truncates the whole script block in browsers (use `<\/script>`).

## 4. Workflow

1. Inspect the repo before editing anything.
2. Smallest necessary changes; preserve content, SEO, feeds, sitemaps.
3. Test locally (`wrangler pages dev` works offline; headless-browser login
   test for admin changes), review the diff.
4. Commit/push to GitHub ONLY when authorized.
5. Verify the Cloudflare Pages deployment build, then test the LIVE admin
   login (correct + incorrect password, zero console errors).
6. Never claim a fix is deployed or tested unless it actually was.
7. Never print secret VALUES; names of required env vars are fine.
