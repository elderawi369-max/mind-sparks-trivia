/**
 * Mind Sparks Trivia – Image Service
 *
 * Single source of truth for fetching topic images via the Unsplash API.
 * Any game mode that needs a historical image should call:
 *   TriviaApp.images.fetchImageForTopic(topic)
 *
 * Resolution order (fastest first):
 *   1. localStorage cache  – 7-day TTL, zero network cost
 *   2. Unsplash Search API – 5 s timeout, random pick from top-5 results
 *   3. Picsum placeholder  – deterministic seed, never throws
 *
 * Load order in index.html:
 *   firebase.js → ai.js → images.js → app.js → [mode scripts loaded lazily]
 *
 * ⚠️  SECURITY  ─────────────────────────────────────────────────────────
 * The Access Key below is visible to anyone who opens DevTools.
 * In your Unsplash app settings, set "Allowed Referrer Domains" to your
 * production domain so the key cannot be used on other sites.
 * For production deployments, proxy image requests through a server-side
 * function and remove the key from this file entirely.
 * ────────────────────────────────────────────────────────────────────────
 */

(function attachImages() {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     1. CONFIGURATION
     ═══════════════════════════════════════════════════════════════ */

  const CONFIG = {
    // ⚠️  Keep out of version control. Restrict to your domain in the
    //     Unsplash developer dashboard: https://unsplash.com/oauth/applications
    accessKey:   'rne6-XWK9fsYb5kLBLTv5vIB2nGnjPZqZPw0ZOTBkaM',

    endpoint:    'https://api.unsplash.com/search/photos',
    timeoutMs:   5_000,
    resultsPool: 5,   // fetch top-N then pick one at random for variety
  };

  /* ═══════════════════════════════════════════════════════════════
     2. CACHE SETTINGS
     ═══════════════════════════════════════════════════════════════ */

  const CACHE_PREFIX = 'unsplash_';
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days

  /* ═══════════════════════════════════════════════════════════════
     3. FALLBACK  (Picsum – always available, zero auth required)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Derives a stable numeric seed from the topic string so the same
   * topic always produces the same placeholder (no confusing layout
   * shifts on retry or reconnect).
   *
   * @param {string} topic
   * @returns {string}  Full URL to a 800×450 Picsum image
   */
  function _fallbackUrl(topic) {
    let seed = 0;
    const str = String(topic || 'default');
    for (let i = 0; i < str.length; i++) {
      seed = (seed * 31 + str.charCodeAt(i)) >>> 0;
    }
    return `https://picsum.photos/seed/${seed % 1000}/800/450`;
  }

  /* ═══════════════════════════════════════════════════════════════
     4. LOCALSTORAGE CACHE HELPERS
     ═══════════════════════════════════════════════════════════════ */

  /** Normalise a topic into a safe localStorage key. */
  function _cacheKey(topic) {
    return CACHE_PREFIX + topic.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 80);
  }

  /**
   * Return the cached URL if present and fresh, otherwise null.
   * @param {string} topic
   * @returns {string|null}
   */
  function _cacheGet(topic) {
    try {
      const raw = localStorage.getItem(_cacheKey(topic));
      if (!raw) return null;
      const { url, savedAt } = JSON.parse(raw);
      return (Date.now() - savedAt < CACHE_TTL_MS) ? url : null;
    } catch {
      return null;
    }
  }

  /**
   * Persist a URL for the given topic.
   * Silently ignores localStorage quota errors.
   *
   * @param {string} topic
   * @param {string} url
   */
  function _cacheSet(topic, url) {
    try {
      localStorage.setItem(_cacheKey(topic), JSON.stringify({ url, savedAt: Date.now() }));
    } catch { /* storage full – skip */ }
  }

  /* ═══════════════════════════════════════════════════════════════
     5. CORE: fetchImageForTopic
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Fetch a representative landscape image URL for the given topic.
   *
   * This function **never rejects** – it always resolves to a URL
   * (real image or placeholder), so callers don't need try/catch.
   *
   * @param {string} topic   Natural-language search phrase,
   *                          e.g. "First Moon Landing" or "Fall of Berlin Wall"
   * @returns {Promise<string>}  Always resolves to an image URL string
   */
  async function fetchImageForTopic(topic) {
    const cleanTopic = (typeof topic === 'string' ? topic.trim() : '') || 'history';

    // ── 1. localStorage cache ────────────────────────────────────
    const cached = _cacheGet(cleanTopic);
    if (cached) {
      console.info(`[Images] Cache hit: "${cleanTopic}"`);
      return cached;
    }

    // ── 2. Unsplash Search API ───────────────────────────────────
    if (!CONFIG.accessKey || CONFIG.accessKey === 'YOUR_UNSPLASH_ACCESS_KEY') {
      console.warn('[Images] Unsplash key not configured – using placeholder.');
      return _fallbackUrl(cleanTopic);
    }

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), CONFIG.timeoutMs);

    try {
      const params = new URLSearchParams({
        query:          cleanTopic,
        per_page:       String(CONFIG.resultsPool),
        orientation:    'landscape',
        content_filter: 'high',
      });

      const res = await fetch(`${CONFIG.endpoint}?${params}`, {
        signal:  controller.signal,
        headers: { Authorization: `Client-ID ${CONFIG.accessKey}` },
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[Images] Unsplash HTTP ${res.status} for "${cleanTopic}" – using placeholder.`);
        return _fallbackUrl(cleanTopic);
      }

      const data    = await res.json();
      const results = data?.results ?? [];

      if (!results.length) {
        console.warn(`[Images] No Unsplash results for "${cleanTopic}" – using placeholder.`);
        return _fallbackUrl(cleanTopic);
      }

      // Pick randomly from the result pool so repeated queries vary
      const pick = results[Math.floor(Math.random() * results.length)];
      const url  = pick?.urls?.regular ?? _fallbackUrl(cleanTopic);

      _cacheSet(cleanTopic, url);
      console.info(`[Images] ✓ Unsplash "${cleanTopic}" → ${url.slice(0, 60)}…`);
      return url;

    } catch (err) {
      clearTimeout(timer);
      const reason = err.name === 'AbortError' ? 'Timeout (5 s)' : err.message;
      console.warn(`[Images] Fetch failed (${reason}) for "${cleanTopic}" – using placeholder.`);
      return _fallbackUrl(cleanTopic);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     6. ATTACH TO TriviaApp
     ═══════════════════════════════════════════════════════════════ */

  function _attach() {
    if (!window.TriviaApp) {
      setTimeout(_attach, 50);
      return;
    }

    TriviaApp.images = Object.freeze({
      fetchImageForTopic,

      /**
       * Clear cached image URL(s) from localStorage.
       * Pass a topic string to clear that one entry,
       * or call with no argument to clear every unsplash_* entry.
       *
       * @param {string} [topic]
       */
      clearCache(topic) {
        if (topic) {
          localStorage.removeItem(_cacheKey(topic));
          console.info(`[Images] Cache cleared for "${topic}".`);
        } else {
          Object.keys(localStorage)
            .filter(k => k.startsWith(CACHE_PREFIX))
            .forEach(k => localStorage.removeItem(k));
          console.info('[Images] Full image cache cleared.');
        }
      },
    });

    console.info('[Images] Service ready.');
  }

  _attach();

})();
