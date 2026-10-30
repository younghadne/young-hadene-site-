// Repo files that must never be served by the site.
//
// The Pages project's build output directory is the repo root, so every
// committed file is uploaded as a static asset unless something stops it:
// build tooling (scripts/, package.json, server.js, ...), SEO working files
// (seo/), authoring data (posts.json, analytics.json with visitor IPs, ...)
// and the local-dev TLS key pair. _middleware.js answers 404 for these
// before the asset is looked up. Functions that need one of them read it via
// env.ASSETS, which does not go through middleware.
//
// Matching is case-insensitive and runs on the percent-decoded path with
// repeated slashes collapsed, so /Scripts/x, /%73cripts/x and //scripts/x
// are caught too. scripts/check-private-paths.mjs guards this list.

// Top-level directories that are tooling / working files, never site content.
const PRIVATE_DIRS = new Set(['scripts', 'seo', 'functions', 'node_modules', 'logs']);

// Individual files (lowercase, no leading slash).
const PRIVATE_FILES = new Set([
  'package.json', 'package-lock.json',
  'server.js', 'worker.js', 'proxy.js', 'start.sh', 'render.yaml',
  'wrangler.toml', 'wrangler.json', 'wrangler.jsonc',
  'agents.md',
  'posts.json', 'blog/posts.json', 'settings.json', 'analytics.json',
  'yh_blogposts.json', 'yh_newsposts.json',
  'cert.pem', 'key.pem',
]);

// Never public anywhere in the tree.
const PRIVATE_EXT = /\.(pem|key|crt|p12|pfx|env|log|sqlite|db)$/;

export function normalizePath(pathname) {
  let p = String(pathname || '/');
  for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(p); i++) {
    try { p = decodeURIComponent(p); } catch { break; }
  }
  return p.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
}

export function isPrivatePath(pathname) {
  const p = normalizePath(pathname);
  const segs = p.split('/').filter(Boolean);
  if (!segs.length) return false;
  // Dotfiles and dot-directories (.git, .github, .env, .gitignore, ...),
  // except the public /.well-known/ convention.
  if (segs.some((s) => s.startsWith('.') && s !== '.well-known')) return true;
  if (PRIVATE_DIRS.has(segs[0])) return true;
  if (PRIVATE_FILES.has(segs.join('/').replace(/\/$/, ''))) return true;
  return PRIVATE_EXT.test(p);
}
