// Shared rule for "would /news/<slug> render this KV post?". Used by
// functions/news/[slug].js (the page itself) and by the feeds/sitemaps that
// link to it, so they never list a KV post the page would 404.

export function isVisible(doc, now) {
  if (!doc) return false;
  if (doc.status === 'published') return true;
  if (doc.status === 'scheduled' && doc.scheduledFor && Number(doc.scheduledFor) <= now) return true;
  return false;
}

// Slugs removed via the KV `deleted` tombstone.
export async function readRemovedNews(store) {
  try {
    const t = await store.get('deleted');
    const tomb = t ? JSON.parse(t) : null;
    return new Set(tomb && Array.isArray(tomb.news) ? tomb.news.map(String) : []);
  } catch {
    return new Set();
  }
}

// The `news:<slug>` doc if /news/<slug> would render it from KV, else null
// (missing or unparsable doc, no slug, or not visible). Tombstones are the
// caller's job (see readRemovedNews).
export async function renderableNewsDoc(store, slug, now) {
  let doc = null;
  try {
    const t = await store.get('news:' + slug);
    doc = t ? JSON.parse(t) : null;
  } catch {
    doc = null;
  }
  return doc && doc.slug && isVisible(doc, now) ? doc : null;
}
