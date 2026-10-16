// Shared newsroom config (imported by functions/news/[slug].js, the news
// sitemap, and scripts/check-news.mjs).
//
// TODO(hadene): NEWS_AUTHOR must be replaced with the real, named person who
// writes/edits the news posts BEFORE this ships. Google News requires a real
// byline; do not invent one. The placeholder below is intentionally obvious.
export const NEWS_AUTHOR = 'TODO-hadene-confirm';
export const SITE_URL = 'https://younghadene.ca';
// Publisher reuses the site's existing entity (MusicGroup, an Organization subtype).
export const PUBLISHER_ID = SITE_URL + '/#artist';
export const NEWS_PUBLICATION_NAME = 'Young Hadene';
export const NEWS_LANGUAGE = 'en';
export const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;
