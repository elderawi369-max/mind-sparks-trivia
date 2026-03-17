/**
 * Mind Sparks Trivia – AI Service Module
 *
 * Generates trivia questions via a chain of AI providers:
 *   DeepSeek  →  OpenRouter  →  OpenAI
 * Each provider is tried up to MAX_RETRIES times with exponential
 * backoff before falling through to the next.  If every provider
 * fails, a built-in offline question bank is used as a last resort.
 *
 * Exposes its public API via  TriviaApp.AI
 *
 * Load order in index.html:
 *   config.js  →  firebase.js  →  ai.js  →  app.js  →  mode scripts
 *
 * ⚠️  SECURITY WARNING ─────────────────────────────────────────
 * API keys stored in client-side JS are visible to anyone who
 * opens DevTools.  These keys should be rotated regularly and
 * have usage limits / allowed-domain restrictions set in each
 * provider's dashboard.  For production, proxy all AI requests
 * through a server-side function (Firebase Cloud Functions, etc.)
 * and remove the keys from this file entirely.
 * ──────────────────────────────────────────────────────────────
 */

// API keys: CONFIG (local config.js) first, then process.env / NETLIFY_CONFIG for Netlify

(function attachAI() {
  'use strict';

  // Resolve key: local CONFIG → process.env → window.NETLIFY_CONFIG (Netlify inject)
  function _env(key) {
    const c = typeof window !== 'undefined' && window.CONFIG ? window.CONFIG[key] : undefined;
    const e = typeof process !== 'undefined' && process.env && process.env[key];
    const n = typeof window !== 'undefined' && window.NETLIFY_CONFIG && window.NETLIFY_CONFIG[key];
    const v = c ?? e ?? n ?? '';
    return (typeof v === 'string' ? v : String(v || '')).trim();
  }

  /* ═══════════════════════════════════════════════════════════════
     1. PROVIDER CONFIGURATION
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Providers are tried left-to-right.  Set any key to '' to skip
   * that provider entirely (it will be filtered out at runtime).
   *
   * Current order (most reliable first based on quotas):
   *   1. OpenRouter – free Gemini router
   *   2. OpenAI     – quota-limited backup
   *   3. DeepSeek   – balance-limited backup
   *
   * ⚠️  Do NOT commit real keys to version control.
   */
  const PROVIDERS = [
    {
      name:       'OpenRouter',
      endpoint:   'https://openrouter.ai/api/v1/chat/completions',
      model:      'google/gemini-2.0-flash-lite-preview-02-05:free',
      apiKey:     _env('OPENROUTER_API_KEY'),
      headers:    {
        'HTTP-Referer': 'https://mindsparkstrivia.com',
        'X-Title':      'Mind Sparks Trivia',
      },
      // maxRetries omitted → falls back to MAX_RETRIES (2)
    },
    {
      name:       'OpenAI',
      endpoint:   'https://api.openai.com/v1/chat/completions',
      model:      'gpt-3.5-turbo',
      apiKey:     _env('OPENAI_API_KEY'),
      headers:    {},
      // maxRetries omitted → falls back to MAX_RETRIES (2)
    },
    {
      name:       'DeepSeek',
      endpoint:   'https://api.deepseek.com/v1/chat/completions',
      model:      'deepseek-chat',
      apiKey:     _env('DEEPSEEK_API_KEY'),
      headers:    {},
      maxRetries: 1,   // fail fast – move to next provider immediately on first failure
    },
  ].filter(p => p.apiKey.trim() !== '');   // skip any provider with a blank key

  // Providers that have been rate-limited / payment-required this session.
  const _disabledProviders = new Set();

  function _disableProvider(name, reason) {
    if (_disabledProviders.has(name)) return;
    _disabledProviders.add(name);
    console.warn(`[AI] Disabling provider for this session: ${name} – ${reason}`);
  }

  /* ═══════════════════════════════════════════════════════════════
     3. TUNING CONSTANTS
     ═══════════════════════════════════════════════════════════════ */

  const MAX_RETRIES       = 2;      // default per-provider retry cap (was 3)
  const BACKOFF_BASE_MS   = 1000;   // 1 s → 2 s per provider
  const FETCH_TIMEOUT_MS  = 5_000;  // abort after 5 s (was 10 s)
  const MAX_TOKENS        = 400;
  const TEMPERATURE       = 0.8;
  const RECENT_CACHE_SIZE = 10;     // dedup window per category+difficulty (was 5)

  // localStorage question cache (trivia / Beat-the-Streak)
  const LS_CACHE_KEY      = 'trivia_question_cache';
  const LS_CACHE_MAX      = 20;     // max entries stored
  const LS_CACHE_TTL_MS   = 60 * 60 * 1000; // 1 hour

  // localStorage year-question cache (Guess the Year)
  const LS_YEAR_CACHE_KEY    = 'trivia_year_cache';
  const LS_YEAR_CACHE_MAX    = 10;                  // up to 10 rounds cached
  const LS_YEAR_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (history is stable)

  // In-memory dedup window for year questions (separate from trivia dedup)
  const RECENT_YEAR_CACHE_SIZE = 5;

  /* ═══════════════════════════════════════════════════════════════
     4. VALID INPUTS
     ═══════════════════════════════════════════════════════════════ */

  const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'expert']);

  const VALID_CATEGORIES = new Set([
    'history', 'science', 'geography', 'sports', 'music',
    'movies', 'literature', 'technology', 'art', 'nature',
    'food', 'politics', 'mythology', 'animals', 'general',
  ]);

  /* ═══════════════════════════════════════════════════════════════
     5. OFFLINE FALLBACK QUESTION BANK
     Last resort when every provider fails.
     ═══════════════════════════════════════════════════════════════ */

  const OFFLINE_QUESTIONS = [
    {
      question:     'What is the capital of France?',
      options:      ['Berlin', 'Madrid', 'Paris', 'Rome'],
      correctIndex: 2,
      hint:         "It's known as the City of Light.",
    },
    {
      question:     'How many sides does a hexagon have?',
      options:      ['Five', 'Six', 'Seven', 'Eight'],
      correctIndex: 1,
      hint:         'Think of a honeycomb cell.',
    },
    {
      question:     'Which planet is closest to the Sun?',
      options:      ['Venus', 'Earth', 'Mars', 'Mercury'],
      correctIndex: 3,
      hint:         'It has no moons and extreme surface temperatures.',
    },
    {
      question:     'Who painted the Mona Lisa?',
      options:      ['Michelangelo', 'Raphael', 'Leonardo da Vinci', 'Caravaggio'],
      correctIndex: 2,
      hint:         'He was also an inventor and scientist.',
    },
    {
      question:     'What is the chemical symbol for water?',
      options:      ['WO', 'HO', 'H₂O', 'O₂H'],
      correctIndex: 2,
      hint:         'Two hydrogen atoms bonded to one oxygen atom.',
    },
    {
      question:     'In which year did World War II end?',
      options:      ['1943', '1944', '1945', '1946'],
      correctIndex: 2,
      hint:         'It ended with surrenders in both Europe and the Pacific.',
    },
    {
      question:     'What is the largest ocean on Earth?',
      options:      ['Atlantic', 'Indian', 'Arctic', 'Pacific'],
      correctIndex: 3,
      hint:         'It borders Asia, Australia, and the Americas.',
    },
    {
      question:     'Which element has the atomic number 1?',
      options:      ['Helium', 'Oxygen', 'Hydrogen', 'Carbon'],
      correctIndex: 2,
      hint:         'It is the lightest and most abundant element in the universe.',
    },
  ];

  let _offlineIndex = Math.floor(Math.random() * OFFLINE_QUESTIONS.length);

  /** Returns the next offline question in a rotating fashion. */
  function _nextOfflineQuestion(category, difficulty) {
    const q = OFFLINE_QUESTIONS[_offlineIndex % OFFLINE_QUESTIONS.length];
    _offlineIndex++;
    return { ...q, category, difficulty, offline: true };
  }

  /* ── Offline year-question bank (Guess the Year mode) ───────────
     5 well-known events spanning different eras and continents.
     Each entry is a superset: yearguess.js uses all fields;
     a simpler consumer can ignore description/yearOptions/etc.
  ─────────────────────────────────────────────────────────────── */
  const OFFLINE_YEAR_QUESTIONS = [
    {
      topic:            'First Moon Landing',
      description:      'Apollo 11 astronauts became the first humans to walk on the lunar surface.',
      year:             1969,
      yearOptions:      [1965, 1969, 1972, 1975],
      correctIndex:     1,
      hints: [
        'Contemporary era — late 20th century.',
        '20th century — 1960s.',
        'Neil Armstrong said "one small step for man…"',
      ],
      funFact:          'The Apollo 11 guidance computer had less processing power than a modern USB stick, yet it successfully navigated 384,000 km to the Moon.',
      imageSearchQuery: 'moon landing astronaut lunar surface 1969',
    },
    {
      topic:            'Fall of the Berlin Wall',
      description:      'The barrier dividing East and West Berlin was opened and dismantled.',
      year:             1989,
      yearOptions:      [1985, 1989, 1991, 1993],
      correctIndex:     1,
      hints: [
        'Contemporary era — late Cold War period.',
        '20th century — 1980s.',
        'The event symbolised the end of the Iron Curtain.',
      ],
      funFact:          'The fall was partly triggered by a spokesman misreading a press release live on TV — he said the new travel regulations would take effect "immediately, without delay," causing thousands to rush to the checkpoints.',
      imageSearchQuery: 'Berlin Wall fall crowd celebration 1989',
    },
    {
      topic:            'First Powered Aeroplane Flight',
      description:      'The Wright Brothers made the first successful sustained powered flight at Kitty Hawk.',
      year:             1903,
      yearOptions:      [1899, 1903, 1908, 1911],
      correctIndex:     1,
      hints: [
        'Modern era — early 20th century.',
        '20th century — Edwardian period.',
        'Orville flew 120 feet in 12 seconds at Kitty Hawk, North Carolina.',
      ],
      funFact:          'The entire first flight covered just 37 metres — shorter than the wingspan of a modern Boeing 747.',
      imageSearchQuery: 'Wright Brothers biplane first flight Kitty Hawk',
    },
    {
      topic:            'Discovery of Penicillin',
      description:      'Alexander Fleming observed that mould (Penicillium) killed surrounding bacteria in a petri dish.',
      year:             1928,
      yearOptions:      [1921, 1928, 1935, 1940],
      correctIndex:     1,
      hints: [
        'Modern era — early 20th century.',
        '20th century — the interwar years.',
        'It was a lab accident involving a contaminated petri dish.',
      ],
      funFact:          'Fleming almost discarded the contaminated dish before noticing the mould. His reluctance to tidy up may have saved hundreds of millions of lives.',
      imageSearchQuery: 'Alexander Fleming penicillin laboratory microscope',
    },
    {
      topic:            'Signing of the Magna Carta',
      description:      'King John of England sealed the Great Charter limiting royal power.',
      year:             1215,
      yearOptions:      [1199, 1215, 1265, 1307],
      correctIndex:     1,
      hints: [
        'Medieval era — 13th century.',
        '13th century — High Middle Ages.',
        'Signed at Runnymede, England — a landmark document for civil liberties.',
      ],
      funFact:          'Only four original copies of the 1215 Magna Carta survive today — two are held by the British Library, one by Salisbury Cathedral, and one by Lincoln Cathedral.',
      imageSearchQuery: 'Magna Carta medieval parchment document scroll',
    },
  ];

  let _offlineYearIndex = Math.floor(Math.random() * OFFLINE_YEAR_QUESTIONS.length);

  /** Returns the next offline year-question in a rotating fashion. */
  function _nextOfflineYearQuestion() {
    const q = OFFLINE_YEAR_QUESTIONS[_offlineYearIndex % OFFLINE_YEAR_QUESTIONS.length];
    _offlineYearIndex++;
    return { ...q, offline: true };
  }

  /* ═══════════════════════════════════════════════════════════════
     6. IN-MEMORY DEDUP CACHE
     ═══════════════════════════════════════════════════════════════ */

  /** @type {Map<string, string[]>} */
  const _recentQuestions = new Map();

  function _recentKey(cat, diff)         { return `${cat}:${diff}`; }
  function _recentList(cat, diff)        { return _recentQuestions.get(_recentKey(cat, diff)) ?? []; }

  function _trackQuestion(cat, diff, text) {
    const key  = _recentKey(cat, diff);
    const list = _recentQuestions.get(key) ?? [];
    list.push(text);
    if (list.length > RECENT_CACHE_SIZE) list.shift();
    _recentQuestions.set(key, list);
  }

  function _isDuplicate(cat, diff, text) {
    return _recentList(cat, diff).includes(text);
  }

  /* ── Year-question in-memory dedup (separate window, keyed by topic) ── */

  /** @type {string[]} Rolling list of recently generated year topics. */
  const _recentYearTopics = [];

  function _trackYearTopic(topic) {
    _recentYearTopics.push(topic);
    if (_recentYearTopics.length > RECENT_YEAR_CACHE_SIZE) _recentYearTopics.shift();
  }

  function _isDuplicateYear(topic) {
    return _recentYearTopics.includes(topic);
  }

  /* ═══════════════════════════════════════════════════════════════
     7. LOCALSTORAGE QUESTION CACHE
     Persists up to LS_CACHE_MAX questions across page reloads.
     Entries older than LS_CACHE_TTL_MS (1 h) are ignored.
     ═══════════════════════════════════════════════════════════════ */

  /** Read the full cache array from localStorage (empty array on any error). */
  function _lsRead() {
    try {
      return JSON.parse(localStorage.getItem(LS_CACHE_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  /** Persist the cache array to localStorage, silently ignoring quota errors. */
  function _lsWrite(entries) {
    try {
      localStorage.setItem(LS_CACHE_KEY, JSON.stringify(entries));
    } catch { /* storage full – skip */ }
  }

  /**
   * Look up a fresh cached question matching category + difficulty.
   * Returns the question object, or null if nothing usable is found.
   *
   * @param {string} cat
   * @param {string} diff
   * @returns {Object|null}
   */
  function _lsGet(cat, diff) {
    const now     = Date.now();
    const entries = _lsRead();
    // Walk backwards so newest entries are checked first
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (
        entry.category   === cat  &&
        entry.difficulty === diff &&
        now - entry.cachedAt < LS_CACHE_TTL_MS
      ) {
        console.info(`[AI] localStorage cache hit (${cat}/${diff})`);
        return entry.question;
      }
    }
    return null;
  }

  /**
   * Save a question to the localStorage cache.
   * Trims to LS_CACHE_MAX entries by dropping the oldest first.
   *
   * @param {string} cat
   * @param {string} diff
   * @param {Object} question  The full question object
   */
  function _lsSet(cat, diff, question) {
    const entries = _lsRead();
    entries.push({ category: cat, difficulty: diff, cachedAt: Date.now(), question });
    // Keep only the newest LS_CACHE_MAX entries
    if (entries.length > LS_CACHE_MAX) entries.splice(0, entries.length - LS_CACHE_MAX);
    _lsWrite(entries);
  }

  /** Remove all entries for a specific category+difficulty (e.g. after a game reset). */
  function _lsClear(cat, diff) {
    _lsWrite(_lsRead().filter(e => !(e.category === cat && e.difficulty === diff)));
  }

  /* ── Year-question localStorage cache ──────────────────────────────
     A flat array of up to LS_YEAR_CACHE_MAX year-question objects,
     each stamped with { cachedAt, ...questionFields }.
     TTL is 24 h (history doesn't change).
  ─────────────────────────────────────────────────────────────────── */

  function _lsYearRead() {
    try {
      return JSON.parse(localStorage.getItem(LS_YEAR_CACHE_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  function _lsYearWrite(entries) {
    try {
      localStorage.setItem(LS_YEAR_CACHE_KEY, JSON.stringify(entries));
    } catch { /* storage full – skip */ }
  }

  /**
   * Return a random non-duplicate year question from the localStorage cache,
   * or null if the cache is empty / all entries are stale / all are duplicates.
   */
  function _lsYearGet() {
    const now     = Date.now();
    const entries = _lsYearRead().filter(
      e => now - e.cachedAt < LS_YEAR_CACHE_TTL_MS && !_isDuplicateYear(e.topic)
    );
    if (!entries.length) return null;
    // Return a random entry for variety
    return entries[Math.floor(Math.random() * entries.length)];
  }

  /**
   * Persist a year-question object to the localStorage cache.
   * Oldest entries are dropped when the cache exceeds LS_YEAR_CACHE_MAX.
   *
   * @param {Object} question  Full year-question object
   */
  function _lsYearSet(question) {
    const entries = _lsYearRead();
    entries.push({ cachedAt: Date.now(), ...question });
    if (entries.length > LS_YEAR_CACHE_MAX) entries.splice(0, entries.length - LS_YEAR_CACHE_MAX);
    _lsYearWrite(entries);
  }

  /* ═══════════════════════════════════════════════════════════════
     8. UTILITY
     ═══════════════════════════════════════════════════════════════ */

  const _sleep = ms => new Promise(r => setTimeout(r, ms));

  /**
   * Simple per-provider latency stats.
   * Stored as { [providerName]: { calls, totalMs, minMs, maxMs } }
   * Read via TriviaApp.AI.providerStats for debugging / future reordering.
   */
  const _providerStats = {};

  function _recordProviderStat(name, elapsedMs) {
    if (!_providerStats[name]) {
      _providerStats[name] = { calls: 0, totalMs: 0, minMs: Infinity, maxMs: 0 };
    }
    const s = _providerStats[name];
    s.calls++;
    s.totalMs += elapsedMs;
    if (elapsedMs < s.minMs) s.minMs = elapsedMs;
    if (elapsedMs > s.maxMs) s.maxMs = elapsedMs;
  }

  function _toast(msg, type = 'wrong') {
    if (typeof TriviaApp?.showToast === 'function') TriviaApp.showToast(msg, type);
    else console.warn('[AI]', msg);
  }

  function _validateInputs(category, difficulty) {
    const cat  = (category  ?? 'general').toLowerCase().trim();
    const diff = (difficulty ?? 'medium').toLowerCase().trim();
    if (!VALID_CATEGORIES.has(cat))    throw new Error(`Unknown category "${cat}".`);
    if (!VALID_DIFFICULTIES.has(diff)) throw new Error(`Unknown difficulty "${diff}".`);
    return { category: cat, difficulty: diff };
  }

  /** Strip markdown fences, then JSON.parse. */
  function _parseJSON(raw) {
    const cleaned = raw.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '');
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error(`JSON parse failed on: ${cleaned.slice(0, 120)}`);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     9. SCHEMA VALIDATORS
     ═══════════════════════════════════════════════════════════════ */

  function _validateQuestionSchema(obj) {
    if (typeof obj.question !== 'string' || !obj.question.trim())
      throw new Error('Schema: "question" must be a non-empty string.');
    if (!Array.isArray(obj.options) || obj.options.length !== 4)
      throw new Error('Schema: "options" must be an array of exactly 4 strings.');
    if (obj.options.some(o => typeof o !== 'string' || !o.trim()))
      throw new Error('Schema: every option must be a non-empty string.');
    if (typeof obj.correctIndex !== 'number' || obj.correctIndex < 0 || obj.correctIndex > 3)
      throw new Error('Schema: "correctIndex" must be 0–3.');
    if (typeof obj.hint !== 'string')
      throw new Error('Schema: "hint" must be a string.');
  }

  function _validateYearSchema(obj) {
    if (typeof obj.topic !== 'string' || !obj.topic.trim())
      throw new Error('Schema: "topic" must be a non-empty string.');

    if (typeof obj.year !== 'number' || !Number.isInteger(obj.year) ||
        obj.year < 1000 || obj.year > 2015)
      throw new Error('Schema: "year" must be a 4-digit integer between 1000 and 2015.');

    if (!Array.isArray(obj.yearOptions) || obj.yearOptions.length !== 4)
      throw new Error('Schema: "yearOptions" must have exactly 4 numbers.');
    if (obj.yearOptions.some(y => typeof y !== 'number' || !Number.isInteger(y)))
      throw new Error('Schema: all entries in "yearOptions" must be integers.');
    if (!obj.yearOptions.includes(obj.year))
      throw new Error('Schema: "year" must appear in "yearOptions".');

    if (typeof obj.correctIndex !== 'number' || obj.correctIndex < 0 || obj.correctIndex > 3)
      throw new Error('Schema: "correctIndex" must be 0–3.');
    if (obj.yearOptions[obj.correctIndex] !== obj.year)
      throw new Error('Schema: yearOptions[correctIndex] must equal "year".');

    if (!Array.isArray(obj.hints) || obj.hints.length !== 3)
      throw new Error('Schema: "hints" must be an array of exactly 3 strings.');
    if (obj.hints.some(h => typeof h !== 'string' || !h.trim()))
      throw new Error('Schema: every hint must be a non-empty string.');

    if (typeof obj.funFact !== 'string' || !obj.funFact.trim())
      throw new Error('Schema: "funFact" must be a non-empty string.');

    if (typeof obj.imageSearchQuery !== 'string' || !obj.imageSearchQuery.trim())
      throw new Error('Schema: "imageSearchQuery" must be a non-empty string.');
  }

  /* ═══════════════════════════════════════════════════════════════
     10. SINGLE PROVIDER CALL  (with timeout + exponential backoff)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Attempts to call one provider, retrying on transient failures.
   *
   * Retry triggers:
   *   - Network / DNS errors
   *   - Fetch timeout (AbortError)
   *   - HTTP 429 (rate limit) or 5xx (server error)
   *   - Invalid JSON response
   *
   * Non-retry triggers (thrown immediately, skips to next provider):
   *   - HTTP 401 / 403 (auth failure – bad key)
   *   - HTTP 400 (bad request – prompt issue)
   *
   * @param {Object}   provider   Entry from PROVIDERS array
   * @param {Object[]} messages   OpenAI-format messages array
   * @param {Object}   [opts]     { max_tokens, temperature }
   * @returns {Promise<string>}   Raw assistant message content
   */
  async function tryProvider(provider, messages, opts = {}) {
    // Per-provider retry cap: DeepSeek uses 1, others use MAX_RETRIES (2)
    const retries = provider.maxRetries ?? MAX_RETRIES;
    let lastErr;
    const t0 = Date.now(); // response-time tracker start

    for (let attempt = 1; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const res = await fetch(provider.endpoint, {
          method:  'POST',
          signal:  controller.signal,
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${provider.apiKey}`,
            ...provider.headers,
          },
          body: JSON.stringify({
            model:           provider.model,
            messages,
            max_tokens:      opts.max_tokens  ?? MAX_TOKENS,
            temperature:     opts.temperature ?? TEMPERATURE,
            response_format: { type: 'json_object' },
          }),
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const msg     = errBody?.error?.message ?? `HTTP ${res.status}`;

          // Payment required or rate-limited → disable for rest of the session
          if (res.status === 402 || res.status === 429) {
            _disableProvider(provider.name, `HTTP ${res.status}`);
            throw Object.assign(new Error(msg), { fatal: true });
          }

          // Auth or bad-request errors won't improve with retries
          if (res.status === 401 || res.status === 403 || res.status === 400) {
            throw Object.assign(new Error(msg), { fatal: true });
          }

          // Rate-limit or server error → backoff and retry
          if (res.status === 429 || res.status >= 500) {
            const wait = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
            console.warn(`[AI:${provider.name}] HTTP ${res.status} – retry ${attempt}/${retries} in ${wait} ms`);
            lastErr = new Error(msg);
            await _sleep(wait);
            continue;
          }

          throw new Error(msg);
        }

        const data    = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) throw new Error('Empty content in provider response.');

        // ── Response-time log (useful for reordering providers later) ──
        const elapsed = Date.now() - t0;
        _recordProviderStat(provider.name, elapsed);
        console.info(`[AI:${provider.name}] ✓ ${elapsed} ms`);

        return content;

      } catch (err) {
        clearTimeout(timeoutId);

        if (err.fatal) throw err;

        const isTimeout = err.name === 'AbortError';
        const wait      = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        const label     = isTimeout ? 'Timeout (5 s)' : 'Network error';

        console.warn(
          `[AI:${provider.name}] ${label} – retry ${attempt}/${retries} in ${wait} ms:`,
          err.message
        );
        lastErr = err;

        if (attempt < retries) await _sleep(wait);
      }
    }

    throw lastErr ?? new Error(`${provider.name}: all ${retries} attempts failed.`);
  }

  /* ═══════════════════════════════════════════════════════════════
     11. PROVIDER FAILOVER CHAIN
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Iterates through PROVIDERS in order, returning the first
   * successful raw content string.
   *
   * @param {Object[]} messages
   * @param {Object}   [opts]
   * @returns {Promise<string>}
   */
  async function _callWithFailover(messages, opts = {}) {
    const errors = [];

    for (const provider of PROVIDERS) {
      if (_disabledProviders.has(provider.name)) {
        console.info(`[AI] Skipping disabled provider: ${provider.name}`);
        continue;
      }
      try {
        console.info(`[AI] Trying provider: ${provider.name}`);
        const content = await tryProvider(provider, messages, opts);
        console.info(`[AI] ✓ ${provider.name} succeeded.`);
        return content;
      } catch (err) {
        console.warn(`[AI] ✗ ${provider.name} failed:`, err.message);
        errors.push(`${provider.name}: ${err.message}`);
      }
    }

    // All providers exhausted
    throw new Error(`All providers failed.\n${errors.join('\n')}`);
  }

  /* ═══════════════════════════════════════════════════════════════
     12. PROMPT BUILDERS
     ═══════════════════════════════════════════════════════════════ */

  function _buildQuestionMessages(cat, diff, recentList) {
    const avoidBlock = recentList.length
      ? `Do NOT reuse any of these recent questions:\n${recentList.map((q, i) => `${i + 1}. "${q}"`).join('\n')}\n\n`
      : '';

    const diffGuide = {
      easy:   'basic fact – suitable for a child or casual player',
      medium: 'moderate – requires general knowledge',
      hard:   'challenging – requires specialist knowledge or precise recall',
    }[diff];

    return [
      {
        role: 'system',
        content:
          'You are a trivia question writer for a mobile game. ' +
          'Always respond with a single valid JSON object matching the schema exactly. ' +
          'Never include markdown, prose, or extra keys.',
      },
      {
        role: 'user',
        content:
          `Generate one ${diff} (${diffGuide}) multiple-choice trivia question ` +
          `about the category: "${cat}".\n\n` +
          avoidBlock +
          'Return ONLY a JSON object with this exact schema:\n' +
          '{\n' +
          '  "question":     "<question text>",\n' +
          '  "options":      ["<A>", "<B>", "<C>", "<D>"],\n' +
          '  "correctIndex": <0|1|2|3>,\n' +
          '  "hint":         "<one sentence hinting at the answer without revealing it>"\n' +
          '}\n\n' +
          'Rules:\n' +
          '- All four options must be plausible and similar in length.\n' +
          '- Exactly one option is correct.\n' +
          '- correctIndex is the 0-based index of the correct option.\n' +
          '- The hint must not contain the answer word(s).',
      },
    ];
  }

  function _buildYearMessages() {
    // Build an avoidance block so the AI doesn't repeat recent topics
    const avoidBlock = _recentYearTopics.length
      ? `Do NOT reuse any of these recently used topics:\n` +
        _recentYearTopics.map((t, i) => `${i + 1}. "${t}"`).join('\n') + '\n\n'
      : '';

    return [
      {
        role: 'system',
        content:
          'You are a history expert writing questions for a "Guess the Year" mobile trivia game. ' +
          'Always respond with a single valid JSON object matching the schema exactly. ' +
          'No markdown, no prose, no extra keys.',
      },
      {
        role: 'user',
        content:
          'Generate one "Guess the Year" question about a historical event, ' +
          'a famous person\'s birth or death, an invention, or a cultural milestone. ' +
          'Choose events that happened between 1000 AD and 2015 (4-digit years only).\n\n' +
          avoidBlock +
          'Return ONLY a JSON object with this exact schema:\n' +
          '{\n' +
          '  "topic":            "<short descriptive title, e.g. First Moon Landing>",\n' +
          '  "description":      "<1–2 neutral sentences about the event>",\n' +
          '  "year":             <the exact year as a 4-digit integer, e.g. 1969>,\n' +
          '  "yearOptions":      [<four distinct 4-digit integers>],\n' +
          '  "correctIndex":     <0-based index of the correct year in yearOptions>,\n' +
          '  "hints": [\n' +
          '    "<hint1: the era — one of: Ancient, Medieval, Early Modern, Modern, Contemporary>",\n' +
          '    "<hint2: the specific century, e.g. 20th century>",\n' +
          '    "<hint3: a short fact that strongly implies the year without stating it>"\n' +
          '  ],\n' +
          '  "funFact":          "<one surprising, specific, little-known fact about this event — revealed after the round ends>",\n' +
          '  "imageSearchQuery": "<safe 4–6 word phrase for finding a period photograph>"\n' +
          '}\n\n' +
          'Rules:\n' +
          '- "year" must be between 1000 and 2015 inclusive.\n' +
          '- yearOptions must include exactly 4 distinct integers, one of which equals "year".\n' +
          '- Decoy years must be plausible: within ±20 years of the real year.\n' +
          '- Hints must be ordered from least to most revealing.\n' +
          '- No hint may contain the 4-digit year number.\n' +
          '- funFact must be genuinely surprising and specific — not a restatement of the description.\n' +
          '- imageSearchQuery must be safe for a general-audience image search.',
      },
    ];
  }

  /* ═══════════════════════════════════════════════════════════════
     13. PUBLIC: generateQuestion
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Generates a multiple-choice trivia question.
   * Tries DeepSeek → OpenRouter → OpenAI, then falls back to an
   * offline question if every provider fails.
   *
   * @param {string}   category    e.g. 'history', 'science'
   * @param {string}   difficulty  'easy' | 'medium' | 'hard'
   * @param {Object}   [callbacks]
   * @param {function} [callbacks.onLoadStart]
   * @param {function} [callbacks.onLoadEnd]
   * @returns {Promise<{question, options, correctIndex, hint, category, difficulty}>}
   */
  async function generateQuestion(category, difficulty, callbacks = {}) {
    const { category: cat, difficulty: diff } = _validateInputs(category, difficulty);

    callbacks.onLoadStart?.();

    try {

      // ── 1. localStorage cache check (fastest path, no network) ──
      const cached = _lsGet(cat, diff);
      if (cached && !_isDuplicate(cat, diff, cached.question)) {
        _trackQuestion(cat, diff, cached.question);
        console.info(`[AI] Serving from localStorage cache (${cat}/${diff})`);
        return cached;
      }

      // ── 2. Live API call with provider failover ──────────────────
      const messages = _buildQuestionMessages(cat, diff, _recentList(cat, diff));
      let obj;

      try {
        const raw = await _callWithFailover(messages);
        obj = _parseJSON(raw);
        _validateQuestionSchema(obj);

        // Reject duplicates – one extra attempt before accepting
        if (_isDuplicate(cat, diff, obj.question)) {
          console.info('[AI] Duplicate detected – regenerating…');
          const raw2 = await _callWithFailover(messages);
          obj = _parseJSON(raw2);
          _validateQuestionSchema(obj);
        }

      } catch (apiErr) {
        // ── 3. All providers failed – use offline bank ───────────
        console.error('[AI] All providers failed, using offline question:', apiErr.message);
        _toast('Using offline questions – check your connection.', 'info');
        return _nextOfflineQuestion(cat, diff);
      }

      const result = { ...obj, category: cat, difficulty: diff };

      _trackQuestion(cat, diff, result.question);

      // Persist to localStorage for next time (non-blocking)
      _lsSet(cat, diff, result);

      // Opportunistically cache in Firestore (fire-and-forget, non-critical)
      TriviaApp?.cacheQuestion?.({ ...result, mode: 'streak' })
        ?.catch(err => console.warn('[AI] Firestore cache skipped:', err.message));

      return result;

    } finally {
      callbacks.onLoadEnd?.();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     14. PUBLIC: generateYearQuestion
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Generates one "Guess the Year" question.
   *
   * Pipeline (fastest path first):
   *   1. localStorage cache  – instant, no network
   *   2. Live API call       – DeepSeek → OpenRouter → OpenAI failover
   *   3. Duplicate detected  – one automatic regeneration attempt
   *   4. All providers fail  – rotating offline bank of 5 events
   *
   * Deduplication uses a rolling window of the last 5 topics
   * (separate from the trivia-question dedup cache).
   *
   * The returned object is a superset so both simple consumers
   * (only need topic / year / hints) and the full Guess-the-Year UI
   * (needs yearOptions, correctIndex, imageSearchQuery) work unchanged.
   *
   * @param {Object}   [callbacks]
   * @param {Function} [callbacks.onLoadStart]
   * @param {Function} [callbacks.onLoadEnd]
   * @returns {Promise<{
   *   topic: string,
   *   description: string,
   *   year: number,
   *   yearOptions: number[],
   *   correctIndex: number,
   *   hints: string[],
   *   funFact: string,
   *   imageSearchQuery: string,
   *   offline?: boolean,
   * }>}
   */
  async function generateYearQuestion(callbacks = {}) {
    callbacks.onLoadStart?.();

    try {

      // ── 1. localStorage cache (fastest path, no network) ────────
      const cached = _lsYearGet();
      if (cached) {
        _trackYearTopic(cached.topic);
        console.info(`[AI] Serving year question from localStorage cache: "${cached.topic}"`);
        // Strip the internal cachedAt stamp before returning
        const { cachedAt: _dropped, ...question } = cached;
        return question;
      }

      // ── 2. Live API call with provider failover ──────────────────
      const messages = _buildYearMessages();   // includes avoidance block
      let obj;

      try {
        const raw = await _callWithFailover(messages, { max_tokens: 550 });
        obj = _parseJSON(raw);
        _validateYearSchema(obj);

        // ── 3. Duplicate check – one extra attempt ─────────────────
        if (_isDuplicateYear(obj.topic)) {
          console.info(`[AI] Year duplicate detected ("${obj.topic}") – regenerating…`);
          const raw2 = await _callWithFailover(messages, { max_tokens: 550 });
          obj = _parseJSON(raw2);
          _validateYearSchema(obj);
        }

      } catch (apiErr) {
        // ── 4. All providers failed – use offline bank ─────────────
        console.error('[AI] generateYearQuestion – all providers failed:', apiErr.message);
        _toast('Using offline questions – check your connection.', 'info');
        const offlineQ = _nextOfflineYearQuestion();
        _trackYearTopic(offlineQ.topic);
        return offlineQ;
      }

      // Track to prevent back-to-back repeats
      _trackYearTopic(obj.topic);

      // Persist to localStorage for next session (non-blocking, best-effort)
      _lsYearSet(obj);

      // Opportunistic Firestore cache (fire-and-forget, non-critical)
      TriviaApp?.cacheQuestion?.({ ...obj, mode: 'yearguess' })
        ?.catch(err => console.warn('[AI] Firestore cache skipped:', err.message));

      return obj;

    } finally {
      callbacks.onLoadEnd?.();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     15. PUBLIC: generateQuickMatchQuestions
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Generates a batch of questions for Quick Match mode.
   * Questions escalate in difficulty across the set.
   *
   * @param {number}  [count=5]
   * @param {Object}  [callbacks]
   * @returns {Promise<Array>}
   */
  async function generateQuickMatchQuestions(count = 5, callbacks = {}) {
    callbacks.onLoadStart?.();

    const cats  = [...VALID_CATEGORIES];
    const diffs = ['easy', 'medium', 'medium', 'hard', 'hard'];

    try {
      const questions = [];
      for (let i = 0; i < count; i++) {
        const cat  = cats[Math.floor(Math.random() * cats.length)];
        const diff = diffs[Math.min(i, diffs.length - 1)];
        // Sequential to avoid hammering the provider simultaneously
        questions.push(await generateQuestion(cat, diff));
      }
      return questions;
    } catch (err) {
      console.error('[AI] generateQuickMatchQuestions failed:', err);
      _toast("Couldn't build the question set. Tap to retry.", 'error');
      throw err;
    } finally {
      callbacks.onLoadEnd?.();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     16. ATTACH TO TriviaApp
     ═══════════════════════════════════════════════════════════════ */

  function _attach() {
    if (!window.TriviaApp) {
      setTimeout(_attach, 50);
      return;
    }

    TriviaApp.config = TriviaApp.config ?? {};

    /**
     * Unsplash image API key for Guess the Year mode.
     * Free tier: 50 req/hour. Get one at https://unsplash.com/developers
     * Resolved via same order as providers: CONFIG → process.env → NETLIFY_CONFIG.
     */
    TriviaApp.config.unsplashKey =
      TriviaApp.config.unsplashKey ||
      _env('UNSPLASH_ACCESS_KEY') ||
      '';

    TriviaApp.AI = Object.freeze({
      generateQuestion,
      generateYearQuestion,
      generateQuickMatchQuestions,

      /** All categories the AI accepts */
      get categories() { return [...VALID_CATEGORIES]; },

      /** Clear the per-session in-memory dedup cache (call at the start of each game) */
      clearRecentCache() { _recentQuestions.clear(); },

      /**
       * Clear the localStorage trivia-question cache.
       * Pass category + difficulty to clear a specific slot,
       * or call with no args to wipe everything.
       */
      clearLocalCache(cat, diff) {
        if (cat && diff) _lsClear(cat, diff);
        else             localStorage.removeItem(LS_CACHE_KEY);
        console.info('[AI] Trivia localStorage cache cleared.');
      },

      /**
       * Clear the localStorage year-question cache (Guess the Year).
       * Useful after a session reset or when debugging.
       */
      clearYearCache() {
        localStorage.removeItem(LS_YEAR_CACHE_KEY);
        _recentYearTopics.length = 0;
        console.info('[AI] Year localStorage cache cleared.');
      },

      /**
       * Per-provider latency stats collected this session.
       * Shape: { ProviderName: { calls, totalMs, minMs, maxMs } }
       * Useful for manually reordering providers based on real performance.
       */
      get providerStats() {
        return JSON.parse(JSON.stringify(_providerStats)); // return a snapshot copy
      },

      /** Exposed for testing / debugging */
      tryProvider,
    });

    const providerNames = PROVIDERS.map(p => p.name).join(' → ');
    console.info(`[AI] Service ready. Failover chain: ${providerNames}`);
  }

  _attach();

})();
