// Firebase config: CONFIG (local config.js) first, then process.env / NETLIFY_CONFIG for Netlify

/**
 * Mind Sparks Trivia – Firebase Service Layer
 *
 * Exposes a single global `TriviaApp` object consumed by every
 * other script.  Must be loaded AFTER the Firebase compat CDN
 * scripts and config.js, and BEFORE app.js / game modules.
 *
 * Load order in index.html:
 *   1. firebase-app-compat.js
 *   2. firebase-auth-compat.js
 *   3. firebase-firestore-compat.js
 *   4. scripts/config.js
 *   5. scripts/firebase.js   ← this file
 *   6. scripts/app.js
 */

/* ── 1. CONFIGURATION ──────────────────────────────────────── */
// Resolve each key: local CONFIG (config.js) → process.env → window.NETLIFY_CONFIG (Netlify inject)
function _env(key) {
  const c = typeof window !== 'undefined' && window.CONFIG ? window.CONFIG[key] : undefined;
  const e = typeof process !== 'undefined' && process.env && process.env[key];
  const n = typeof window !== 'undefined' && window.NETLIFY_CONFIG && window.NETLIFY_CONFIG[key];
  const v = c ?? e ?? n ?? '';
  return typeof v === 'string' ? v : String(v || '');
}

const firebaseConfig = {
  apiKey:            _env('FIREBASE_API_KEY'),
  authDomain:        _env('FIREBASE_AUTH_DOMAIN'),
  projectId:         _env('FIREBASE_PROJECT_ID'),
  storageBucket:     _env('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: _env('FIREBASE_MESSAGING_SENDER_ID'),
  appId:             _env('FIREBASE_APP_ID'),
};

/* ── 2. SDK INITIALISATION ─────────────────────────────────── */
firebase.initializeApp(firebaseConfig);

const _auth = firebase.auth();
const _db   = firebase.firestore();

// Persist auth state across tabs/reloads
_auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// Optional: point to local Firestore emulator during development
// _db.useEmulator('localhost', 8080);

/* ── 3. FIRESTORE COLLECTION KEYS ──────────────────────────── */
const COL = Object.freeze({
  USERS:    'users',
  SCORES:   'scores',
  GAMES:    'games',
  QUESTIONS:'questions',
});

/* ── 4. INTERNAL HELPERS ───────────────────────────────────── */

/**
 * Returns a safe reference to `showToast` regardless of whether
 * app.js has been loaded yet.  Falls back to console.warn.
 */
function _toast(message, type = 'wrong') {
  if (typeof showToast === 'function') {
    showToast(message, type);
  } else {
    console.warn('[TriviaApp]', message);
  }
}

/**
 * Normalise a Firestore error into a friendly one-liner.
 */
function _friendlyError(err) {
  const map = {
    'permission-denied':    'You don\'t have permission to do that.',
    'unavailable':          'You appear to be offline. Check your connection.',
    'not-found':            'That record no longer exists.',
    'already-exists':       'This entry already exists.',
    'resource-exhausted':   'Too many requests – please wait a moment.',
    'unauthenticated':      'You need to be signed in.',
    'cancelled':            'The operation was cancelled.',
  };
  return map[err?.code?.replace('auth/', '').replace('firestore/', '')] ||
         err?.message ||
         'Something went wrong. Please try again.';
}

/**
 * Server timestamp shorthand.
 */
function _ts() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

/**
 * Persist a personal-best score into the user's document.
 * Only overwrites the existing highScores[mode] value if the
 * new score is strictly higher.
 *
 * @param {string} mode
 * @param {number} score
 */
async function submitHighScore(mode, score) {
  const user = TriviaApp.getCurrentUser?.();
  if (!user || !mode || typeof score !== 'number') return;

  const userRef = _db.collection(COL.USERS).doc(user.uid);
  const snap    = await userRef.get();

  let current = 0;
  if (snap.exists) {
    const data = snap.data();
    if (data?.highScores && typeof data.highScores[mode] === 'number') {
      current = data.highScores[mode];
    }
  }

  if (score > current) {
    await userRef.set(
      { highScores: { [mode]: score }, updatedAt: _ts() },
      { merge: true }
    );
  }
}

/**
 * Read the leaderboard for a given mode from the users collection,
 * ordered by their stored personal best for that mode.
 *
 * @param {string} mode
 * @param {number} [limit=10]
 * @returns {Promise<Array<{userId:string, displayName:string, score:number}>>}
 */
async function getLeaderboard(mode, limit = 10) {
  if (!mode) return [];

  const snapshot = await _db.collection(COL.USERS)
    .orderBy(`highScores.${mode}`, 'desc')
    .limit(limit)
    .get();

  const results = [];

  snapshot.forEach(doc => {
    const data = doc.data() || {};
    const hs   = data.highScores || {};
    results.push({
      userId:      doc.id,
      displayName: data.displayName || 'Anonymous',
      score:       typeof hs[mode] === 'number' ? hs[mode] : 0,
    });
  });

  return results;
}

/* ── 5. PUBLIC TriviaApp NAMESPACE ─────────────────────────── */
const TriviaApp = {

  /** The currently signed-in user object (populated after sign-in) */
  currentUser: null,

  /* ── AUTH ── */

  /**
   * Signs the visitor in anonymously (or reuses an existing
   * anonymous session).  Populates TriviaApp.currentUser and
   * ensures a user document exists in Firestore.
   *
   * @returns {Promise<firebase.User>}
   */
  async signInAnonymously() {
    try {
      const result = await _auth.signInAnonymously();
      const user   = result.user;

      TriviaApp.currentUser = user;

      // Ensure a user document exists without overwriting existing data
      const userRef = _db.collection(COL.USERS).doc(user.uid);
      await userRef.set(
        {
          uid:       user.uid,
          createdAt: _ts(),
          lastSeen:  _ts(),
          // Default profile – game modules can enrich this
          displayName: `Player_${user.uid.slice(0, 5)}`,
          highScores: {
            'beat-streak': 0,
            'guess-year':  0,
            'quick-match': 0,
          },
        },
        { merge: true }   // won't overwrite highScores already set
      );

      console.info('[TriviaApp] Signed in:', user.uid);
      return user;

    } catch (err) {
      console.error('[TriviaApp] signInAnonymously failed:', err);
      _toast(_friendlyError(err));
      throw err;
    }
  },

  /**
   * Returns the currently authenticated user, or null.
   * Useful for quick checks without awaiting.
   *
   * @returns {firebase.User|null}
   */
  getCurrentUser() {
    return _auth.currentUser;
  },

  /**
   * Registers a callback that fires whenever auth state changes.
   * Returns the unsubscribe function.
   *
   * @param {function} callback
   * @returns {function} unsubscribe
   */
  onAuthStateChanged(callback) {
    return _auth.onAuthStateChanged(callback);
  },

  /* ── USER PROFILE ── */

  /**
   * Merges arbitrary data into the user's Firestore document.
   *
   * @param {string} userId
   * @param {Object} data   Plain object – will be shallow-merged
   * @returns {Promise<void>}
   */
  async updateUserProfile(userId, data) {
    if (!userId) throw new Error('updateUserProfile: userId is required');

    try {
      await _db.collection(COL.USERS).doc(userId).set(
        { ...data, updatedAt: _ts() },
        { merge: true }
      );
    } catch (err) {
      console.error('[TriviaApp] updateUserProfile failed:', err);
      _toast(_friendlyError(err));
      throw err;
    }
  },

  /**
   * Fetches the user document from Firestore.
   *
   * @param {string} userId
   * @returns {Promise<Object|null>}
   */
  async getUserProfile(userId) {
    if (!userId) throw new Error('getUserProfile: userId is required');

    try {
      const snap = await _db.collection(COL.USERS).doc(userId).get();
      return snap.exists ? { id: snap.id, ...snap.data() } : null;
    } catch (err) {
      console.error('[TriviaApp] getUserProfile failed:', err);
      _toast(_friendlyError(err));
      throw err;
    }
  },

  /* ── SCORES ── */

  /**
   * Saves a completed game score.
   * Also updates the user's personal high score if this beats it.
   *
   * @param {string} userId
   * @param {string} mode    One of 'beat-streak' | 'guess-year' | 'quick-match'
   * @param {number} score
   * @param {Object} [meta]  Extra data (e.g. { roundsPlayed, accuracy })
   * @returns {Promise<string>} The new score document ID
   */
  async saveUserScore(userId, mode, score, meta = {}) {
    if (!userId) throw new Error('saveUserScore: userId is required');
    if (!mode)   throw new Error('saveUserScore: mode is required');
    if (typeof score !== 'number' || isNaN(score)) {
      throw new Error('saveUserScore: score must be a number');
    }

    try {
      // 1. Write the individual score entry
      const scoreRef = await _db.collection(COL.SCORES).add({
        userId,
        mode,
        score,
        ...meta,
        createdAt: _ts(),
      });

      // 2. Update the personal high score (only if higher)
      const userRef  = _db.collection(COL.USERS).doc(userId);
      const userSnap = await userRef.get();

      if (userSnap.exists) {
        const existing = userSnap.data().highScores?.[mode] ?? 0;
        if (score > existing) {
          await userRef.set(
            { highScores: { [mode]: score }, updatedAt: _ts() },
            { merge: true }
          );
        }
      }

      return scoreRef.id;

    } catch (err) {
      console.error('[TriviaApp] saveUserScore failed:', err);
      _toast(_friendlyError(err));
      throw err;
    }
  },

  /**
   * Multiplayer helpers (Quick Match).
   */

  /* ── MULTIPLAYER GAMES ── */

  /**
   * Creates a new Quick Match game document and returns its ID.
   * The caller shares the ID as a URL parameter to the opponent.
   *
   * @param {string} hostId
   * @returns {Promise<string>} gameId
   */
  async createGame(hostId) {
    try {
      const ref = await _db.collection(COL.GAMES).add({
        hostId,
        guestId:    null,
        status:     'waiting',   // waiting | active | finished
        scores:     { [hostId]: 0 },
        questions:  [],
        currentQ:   0,
        createdAt:  _ts(),
        updatedAt:  _ts(),
      });
      return ref.id;
    } catch (err) {
      console.error('[TriviaApp] createGame failed:', err);
      _toast(_friendlyError(err));
      throw err;
    }
  },

  /**
   * Joins an existing game as guest.
   *
   * @param {string} gameId
   * @param {string} guestId
   * @returns {Promise<void>}
   */
  async joinGame(gameId, guestId) {
    try {
      await _db.collection(COL.GAMES).doc(gameId).update({
        guestId,
        status:    'active',
        [`scores.${guestId}`]: 0,
        updatedAt: _ts(),
      });
    } catch (err) {
      console.error('[TriviaApp] joinGame failed:', err);
      _toast(_friendlyError(err));
      throw err;
    }
  },

  /**
   * Subscribes to real-time game updates.
   * Returns the unsubscribe function.
   *
   * @param {string}   gameId
   * @param {function} callback  Receives the game data object
   * @returns {function} unsubscribe
   */
  listenToGame(gameId, callback) {
    return _db.collection(COL.GAMES).doc(gameId)
      .onSnapshot(
        snap => callback(snap.exists ? { id: snap.id, ...snap.data() } : null),
        err  => {
          console.error('[TriviaApp] listenToGame error:', err);
          _toast(_friendlyError(err));
        }
      );
  },

  /**
   * Updates the game document (used for submitting answers, etc.).
   *
   * @param {string} gameId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async updateGame(gameId, data) {
    try {
      await _db.collection(COL.GAMES).doc(gameId).update({
        ...data,
        updatedAt: _ts(),
      });
    } catch (err) {
      console.error('[TriviaApp] updateGame failed:', err);
      _toast(_friendlyError(err));
      throw err;
    }
  },

  /* ── QUESTION CACHE ── */

  /**
   * Caches an AI-generated question so it can be reused later
   * without burning another API call.
   *
   * @param {Object} question  { text, options, answer, category, mode, ... }
   * @returns {Promise<string>} The stored document ID
   */
  async cacheQuestion(question) {
    try {
      const ref = await _db.collection(COL.QUESTIONS).add({
        ...question,
        usageCount: 0,
        createdAt:  _ts(),
      });
      return ref.id;
    } catch (err) {
      // Non-critical: log but don't surface to player
      console.warn('[TriviaApp] cacheQuestion failed (non-fatal):', err);
    }
  },

  /**
   * Fetches a random cached question for a given mode/category.
   * Returns null if the cache is empty.
   *
   * @param {string} mode
   * @param {string} [category]
   * @returns {Promise<Object|null>}
   */
  async getCachedQuestion(mode, category) {
    try {
      let query = _db.collection(COL.QUESTIONS).where('mode', '==', mode);
      if (category) query = query.where('category', '==', category);

      // Fetch a small batch and pick one at random (Firestore has no ORDER BY RAND)
      const snap = await query.limit(20).get();
      if (snap.empty) return null;

      const docs  = snap.docs;
      const picked = docs[Math.floor(Math.random() * docs.length)];

      // Increment usage counter asynchronously
      picked.ref.update({ usageCount: firebase.firestore.FieldValue.increment(1) });

      return { id: picked.id, ...picked.data() };

    } catch (err) {
      console.warn('[TriviaApp] getCachedQuestion failed (non-fatal):', err);
      return null;
    }
  },

  /* ── EXPOSE INTERNALS (read-only) ── */

  /** Direct Firestore reference for advanced game-module queries */
  get db()   { return _db;   },
  /** Direct Auth reference */
  get auth() { return _auth; },
  /** Collection name constants */
  get COL()  { return COL;   },
};

// Attach leaderboard helpers onto TriviaApp namespace
TriviaApp.submitHighScore = submitHighScore;
TriviaApp.getLeaderboard  = getLeaderboard;

/* ── 6. AUTO SIGN-IN ON LOAD ───────────────────────────────── */

/**
 * Listen for auth state first so we reuse an existing session
 * (localStorage persistence) instead of creating a new anon user
 * every page load.
 */
_auth.onAuthStateChanged(async user => {
  if (user) {
    TriviaApp.currentUser = user;

    // Refresh lastSeen timestamp silently
    try {
      await _db.collection(COL.USERS).doc(user.uid).set(
        { lastSeen: _ts() },
        { merge: true }
      );
    } catch (_) { /* non-critical */ }

    console.info('[TriviaApp] Restored session:', user.uid);

    // Notify other scripts the app is ready
    document.dispatchEvent(new CustomEvent('trivia:ready', { detail: { user } }));

  } else {
    // No existing session – sign in fresh
    try {
      await TriviaApp.signInAnonymously();
      document.dispatchEvent(
        new CustomEvent('trivia:ready', { detail: { user: TriviaApp.currentUser } })
      );
    } catch (err) {
      // signInAnonymously already toasts; nothing more to do here
      console.error('[TriviaApp] Auto sign-in failed:', err);
    }
  }
});

/* Make TriviaApp available globally */
window.TriviaApp = TriviaApp;
