// Which blog slugs may appear in a posts listing (/api/posts-list, the /blog
// live refresh, related-post links). A slug is left out when it 301s
// (BLOG_REDIRECTS key) or is noindexed (BLOG_NOINDEX, NEWS_NOINDEX), so
// listings only link to pages we want indexed. The pages themselves keep
// serving (redirect / noindex) as before.
import { BLOG_REDIRECTS, BLOG_NOINDEX } from './_blog-redirects.js';
import { NEWS_NOINDEX } from './_news-noindex.js';

export function isListable(slug) {
  if (!slug) return false;
  const s = String(slug);
  return !Object.prototype.hasOwnProperty.call(BLOG_REDIRECTS, s) && !BLOG_NOINDEX.has(s) && !NEWS_NOINDEX.has(s);
}

// Slugs a client-side listing must drop (sent with /api/posts-list).
export function unlistedSlugs() {
  return [...new Set([...Object.keys(BLOG_REDIRECTS), ...BLOG_NOINDEX, ...NEWS_NOINDEX])];
}
