// Shared newsroom config (imported by functions/news/[slug].js, the news
// sitemap, and scripts/check-news.mjs).
//
// News byline: an Organization author (team decision, Oct 15 2026). Switch to
// hadene's own name (and @type Person) only if he asks.
export const NEWS_AUTHOR = 'Young Hadene Team';
export const NEWS_AUTHOR_TYPE = 'Organization';
export const SITE_URL = 'https://younghadene.ca';
// Publisher reuses the site's existing entity (MusicGroup, an Organization subtype).
export const PUBLISHER_ID = SITE_URL + '/#artist';
export const NEWS_PUBLICATION_NAME = 'Young Hadene';
export const NEWS_LANGUAGE = 'en';
export const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;
