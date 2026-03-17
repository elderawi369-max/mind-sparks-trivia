/**
 * Mind Sparks Trivia – Application Controller
 *
 * Single source of truth for app-level state, UI helpers, and
 * screen routing.  All game-mode modules interact with this file
 * through the shared TriviaApp global.
 *
 * Load order (enforced in index.html):
 *   firebase.js  →  ai.js  →  app.js  →  mode scripts
 */

/* ─────────────────────────────────────────────────────────────
   1. APP STATE
   ───────────────────────────────────────────────────────────── */

/**
 * Central state object.
 * firebase.js writes TriviaApp.currentUser; mode scripts write
 * TriviaApp.state.* during gameplay.
 */
TriviaApp.state = {
  /** Which mode is active: 'beat-streak' | 'guess-year' | 'quick-match' | null */
  currentMode: null,

  /** Whether a game is currently in progress */
  gameActive: false,

  /** Tracks whether Firebase auth completed (gate for protected actions) */
  authReady: false,

  /** Best scores per mode, mirrored from Firestore for fast reads */
  highScores: {
    streak:      0,
    yearguess:   0,
    multiplayer: 0,
  },
};

/* ─────────────────────────────────────────────────────────────
   2. DOM REFERENCES
   ───────────────────────────────────────────────────────────── */

const _dom = {
  screenHome:      document.getElementById('screen-home'),
  screenGame:      document.getElementById('screen-game'),
  screenProfile:   document.getElementById('screen-profile'),
  loadingOverlay:  document.getElementById('loading-overlay'),
  loadingMessage:  document.getElementById('loading-message'),
  toast:           document.getElementById('toast'),
  btnProfile:      document.getElementById('btn-profile'),
  modeCards:       [], // populated by _renderHome()
};

/* Small helper for i18n lookups */
function _t(key, vars) {
  try {
    const i18n = window.TriviaApp && window.TriviaApp.i18n;
    return i18n ? i18n.t(key, vars) : key;
  } catch {
    return key;
  }
}

/* ─────────────────────────────────────────────────────────────
   3. SCREEN MANAGEMENT
   ───────────────────────────────────────────────────────────── */

/**
 * Activate one screen element and deactivate all others.
 * Public helper so other modules (e.g. leaderboard) can drive
 * high-level navigation.
 *
 * @param {HTMLElement} screenElement
 */
function showScreen(screenElement) {
  document.querySelectorAll('.screen')
    .forEach(s => s.classList.remove('active'));

  if (screenElement) {
    screenElement.classList.add('active');
  }
}

/**
 * Show the home screen, hide the game screen.
 * Pure visual toggle — does NOT reset state or clear content.
 * Use showHome() when you also want to reset game state.
 */
function showHomeScreen() {
  showScreen(_dom.screenHome);
}

/**
 * Hide the home screen, show the game screen.
 * Pure visual toggle — game content must be built by the caller.
 */
function hideHomeScreen() {
  if (_dom.screenHome) _dom.screenHome.classList.remove('active');
  if (_dom.screenGame) _dom.screenGame.classList.add('active');
}

/**
 * Wipe the game screen's inner HTML, ready for a new mode.
 * Does NOT change which screen is visible.
 */
function clearGameScreen() {
  _dom.screenGame.innerHTML = '';
}

/**
 * Full home-navigation: resets all game state, clears the game
 * screen, and shows the home screen.
 * Exposed on TriviaApp so mode scripts can call it.
 */
function showHome() {
  TriviaApp.state.currentMode = null;
  TriviaApp.state.gameActive  = false;
  clearGameScreen();
  showHomeScreen();
}

/**
 * Render the home screen (mode cards, tagline) dynamically using i18n.
 * Called once on DOMContentLoaded; can be re-used after language change.
 */
function _renderHome() {
  const home = _dom.screenHome;
  if (!home) return;

  home.innerHTML = `
    <section class="home-hero">
      <p class="tagline">${_t('homeTagline')}</p>
    </section>

    <section class="mode-grid" aria-label="Game modes">

      <button class="mode-card" id="btn-beat-streak" data-mode="streak">
        <span class="mode-icon">🔥</span>
        <span class="mode-title">${_t('modeBeatStreak')}</span>
        <span class="mode-desc">${_t('modeBeatStreakDesc')}</span>
        <span class="mode-badge">${_t('lifelinesTitle')}</span>
      </button>

      <button class="mode-card" id="btn-guess-year" data-mode="yearguess">
        <span class="mode-icon">📅</span>
        <span class="mode-title">${_t('modeGuessYear')}</span>
        <span class="mode-desc">${_t('modeGuessYearDesc')}</span>
        <span class="mode-badge">${_t('yearGuessTitle')}</span>
      </button>

      <button class="mode-card" id="btn-quick-match" data-mode="multiplayer">
        <span class="mode-icon">⚔️</span>
        <span class="mode-title">${_t('modeQuickMatch')}</span>
        <span class="mode-desc">${_t('modeQuickMatchDesc')}</span>
        <span class="mode-badge">${_t('quickMatchTitle')}</span>
      </button>

    </section>
  `;

  // Refresh modeCards NodeList for _bindEvents
  _dom.modeCards = Array.from(document.querySelectorAll('.mode-card'));
}

/* ─────────────────────────────────────────────────────────────
   4. LOADING OVERLAY  (with rotating facts ticker)
   ───────────────────────────────────────────────────────────── */

/** Trivia facts / tips shown under the spinner while AI generates. */
const _LOADING_FACTS = [
  // Trivia facts
  '🧠 The human brain can hold roughly 2.5 petabytes of information.',
  '🌍 Vatican City is the world\'s smallest country by area.',
  '🦈 Sharks are older than trees — they\'ve existed for 400 million years.',
  '🍯 Honey never spoils — edible honey was found in Egyptian tombs.',
  '⚡ Lightning strikes the Earth about 100 times every second.',
  '🐙 Octopuses have three hearts and blue blood.',
  '🌙 A day on Venus is longer than a year on Venus.',
  '🎵 "Happy Birthday" was the first song ever played in space.',
  '🐘 Elephants are the only animals that can\'t jump.',
  '🌊 More than 80% of the world\'s oceans remain unexplored.',
  '🦋 Butterflies taste with their feet.',
  '🍕 The world\'s most expensive pizza costs over $12,000.',
  '🎲 The dots on a standard die always add up to 7 on opposite faces.',
  '🌺 Oxford University is older than the Aztec Empire.',
  '🐝 A single bee produces only 1/12 of a teaspoon of honey in its lifetime.',
  '🧊 Hot water can freeze faster than cold water — the Mpemba effect.',
  '🦴 Babies are born with ~270 bones; adults have only 206.',
  '🌿 Cleopatra lived closer in time to the Moon landing than to the pyramids.',
  '🎯 A group of flamingos is called a "flamboyance".',
  '🔭 There are more stars in the universe than grains of sand on Earth.',
  // Game tips
  '💡 Tip: Use 50:50 when you\'ve narrowed it down to two answers.',
  '💡 Tip: The first answer that comes to mind is often correct.',
  '💡 Tip: Difficulty increases after a streak of 5 and 10.',
  '💡 Tip: Use Skip to save your streak when you\'re unsure.',
  '💡 Tip: Questions are cached locally — later rounds load faster.',
];

const _FACT_INTERVAL_MS = 2000;
let _factTimer          = null;
let _factIndex          = -1;

/** Pick the next fact index, never repeating back-to-back. */
function _nextFactIndex() {
  let idx;
  do { idx = Math.floor(Math.random() * _LOADING_FACTS.length); }
  while (idx === _factIndex && _LOADING_FACTS.length > 1);
  return idx;
}

/** Write a new fact into the ticker with a brief fade. */
function _rotateFact() {
  const el = document.getElementById('loading-fact');
  if (!el) return;

  // Fade out, swap text, fade back in
  el.classList.add('fact-exit');
  setTimeout(() => {
    _factIndex      = _nextFactIndex();
    el.textContent  = _LOADING_FACTS[_factIndex];
    el.classList.remove('fact-exit');
  }, 300); // matches CSS transition duration
}

/**
 * Show the full-screen loading overlay and start the facts ticker.
 * @param {string} [message]  Primary status line (e.g. "Generating question…")
 */
function showLoading(message = _t('loadingQuestion')) {
  _dom.loadingMessage.textContent = message;
  _dom.loadingOverlay.classList.remove('hidden');

  // Show the first fact immediately
  _rotateFact();

  // Rotate every 2 s while overlay is visible
  clearInterval(_factTimer);
  _factTimer = setInterval(_rotateFact, _FACT_INTERVAL_MS);
}

/**
 * Hide the loading overlay and stop the facts ticker.
 */
function hideLoading() {
  _dom.loadingOverlay.classList.add('hidden');
  clearInterval(_factTimer);
  _factTimer = null;

  // Clear fact text so it doesn't flash old content on next open
  const el = document.getElementById('loading-fact');
  if (el) el.textContent = '';
}

/* ─────────────────────────────────────────────────────────────
   5. TOAST NOTIFICATIONS
   ───────────────────────────────────────────────────────────── */

let _toastTimer      = null;
let _toastFadeTimer  = null;

/**
 * Display a self-dismissing toast notification.
 *
 * @param {string} text
 * @param {'success'|'error'|'info'|'correct'|'wrong'|''} [type]
 * @param {number} [durationMs]  Visible time before fade starts
 */
function showToast(text, type = '', durationMs = 2400) {
  // Cancel any in-flight toast cycle
  clearTimeout(_toastTimer);
  clearTimeout(_toastFadeTimer);

  // Normalise semantic aliases used elsewhere
  const cssType = type === 'success' ? 'correct'
                : type === 'error'   ? 'wrong'
                : type;

  const el = _dom.toast;
  el.textContent = text;
  // Force re-trigger CSS animation by removing and re-adding
  el.className = 'toast';                              // reset
  void el.offsetWidth;                                 // reflow
  if (cssType) el.classList.add(cssType);              // colour variant

  // Begin fade-out after durationMs
  _toastTimer = setTimeout(() => {
    el.classList.add('toast-out');
    _toastFadeTimer = setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('toast-out');
    }, 380); // matches --dur-slow in CSS
  }, durationMs);
}

/* ─────────────────────────────────────────────────────────────
   6. DYNAMIC SCRIPT LOADER
   ───────────────────────────────────────────────────────────── */

/** Track which mode scripts have already been injected. */
const _loadedScripts = new Set();

/**
 * Dynamically injects a <script> tag once and resolves when it
 * fires 'load'.  Subsequent calls for the same src resolve
 * immediately (idempotent).
 *
 * @param {string} src  Path relative to the document root
 * @returns {Promise<void>}
 */
function _loadScript(src) {
  if (_loadedScripts.has(src)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const tag   = document.createElement('script');
    tag.src     = src;
    tag.async   = false; // preserve execution order within a mode
    tag.onload  = () => { _loadedScripts.add(src); resolve(); };
    tag.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.body.appendChild(tag);
  });
}

/* ─────────────────────────────────────────────────────────────
   7. MODE REGISTRY & ROUTING
   ───────────────────────────────────────────────────────────── */

/**
 * Maps each mode key to:
 *   script  – path to the mode's JS file
 *   init    – the global function the mode file must expose
 *   label   – human-readable name for loading messages
 */
const _modeRegistry = {
  streak: {
    script: 'scripts/modes/streak.js',
    init:   () => TriviaApp.Modes?.BeatStreak?.init(),
    label:  'Beat the Streak',
  },
  yearguess: {
    script: 'scripts/modes/yearguess.js',
    init:   () => TriviaApp.Modes?.GuessYear?.init(),
    label:  'Guess the Year',
  },
  multiplayer: {
    script: 'scripts/modes/multiplayer.js',
    init:   () => TriviaApp.Modes?.QuickMatch?.init(),
    label:  'Quick Match',
  },
};

/**
 * Load and initialise a game mode.
 *
 * Flow:
 *   1. Guard: auth ready + not already in this mode
 *   2. hideHomeScreen() → game screen is visible
 *   3. clearGameScreen() → blank canvas for the mode
 *   4. showLoading() while the mode script is fetched (once)
 *   5. hideLoading() then call the mode's init()
 *
 * @param {string} mode  'streak' | 'yearguess' | 'multiplayer'
 * @returns {Promise<void>}
 */
async function loadMode(mode) {
  const entry = _modeRegistry[mode];
  if (!entry) {
    console.warn('[App] Unknown mode:', mode);
    showToast(`Unknown game mode: "${mode}"`, 'error');
    return;
  }

  if (!TriviaApp.state.authReady) {
    showToast('Still connecting… please wait.', 'info');
    return;
  }

  // Prevent relaunching a mode that's already running
  if (TriviaApp.state.gameActive && TriviaApp.state.currentMode === mode) return;

  TriviaApp.state.currentMode = mode;
  TriviaApp.state.gameActive  = false; // mode's init() must call setGameActive(true)

  // Transition: home out, game screen in (blank)
  hideHomeScreen();
  clearGameScreen();
  showLoading(`Loading ${entry.label}…`);

  try {
    // Fetch the mode script once; subsequent calls are instant
    await _loadScript(entry.script);
    hideLoading();

    // Explicit dispatch so it's clear which init is being called
    switch (mode) {
      case 'streak':
        await TriviaApp.Modes?.BeatStreak?.init();
        break;
      case 'yearguess':
        await TriviaApp.Modes?.GuessYear?.init();
        break;
      case 'multiplayer':
        await TriviaApp.Modes?.QuickMatch?.init();
        break;
      default:
        throw new Error(`No init handler registered for mode "${mode}".`);
    }

    TriviaApp.state.gameActive = true;

  } catch (err) {
    console.error(`[App] loadMode("${mode}") failed:`, err);
    hideLoading();
    showToast('Could not load game mode. Please try again.', 'error');
    showHome();
  }
}

/* ─────────────────────────────────────────────────────────────
   8. PROFILE PAGE
   ───────────────────────────────────────────────────────────── */

const _PROFILE_AVATARS = ['🙂', '🧠', '🦉', '🧑‍🚀', '🦊', '🐱'];

function _computeLevelFromXp(xp) {
  const base = 100;
  let level = 1;
  let need  = base * level;
  let remaining = xp;
  while (remaining >= need) {
    remaining -= need;
    level++;
    need = base * level;
  }
  return { level, xpIntoLevel: remaining, xpForLevel: need };
}

function showProfileScreen() {
  showScreen(_dom.screenProfile);
}

async function _handleProfileClick() {
  const user = TriviaApp.getCurrentUser();
  if (!user) {
    showToast('Signing you in…', 'info');
    return;
  }

  try {
    const profile = await TriviaApp.getUserProfile(user.uid);
    const merged  = _buildProfileModel(user, profile || {});
    await _maybePersistGeneratedName(user.uid, profile, merged.displayName);
    _renderProfileScreen(merged);
    showProfileScreen();
  } catch (err) {
    console.error('[App] _handleProfileClick failed:', err);
    showToast('Could not load profile.', 'error');
  }
}

function _buildProfileModel(user, profile) {
  const uid   = user.uid;
  const name  = profile.displayName || `Player_${uid.slice(0, 5)}`;
  const avatar = profile.avatar || _PROFILE_AVATARS[0];

  const stats = profile.stats || {};
  const totalGames   = stats.totalGamesPlayed || 0;
  const totalCorrect = stats.totalCorrectAnswers || 0;

  const hsProfile = profile.highScores || {};
  const hsState   = TriviaApp.state.highScores;
  const bestStreak = hsProfile['beat-streak'] ?? hsState.streak ?? 0;

  const xp    = profile.xp || 0;
  const levelField = profile.level || 1;
  const lvl   = _computeLevelFromXp(xp);
  const level = Math.max(levelField, lvl.level);
  const xpIntoLevel = lvl.xpIntoLevel;
  const xpForLevel  = lvl.xpForLevel;
  const xpPercent   = xpForLevel ? Math.min(100, Math.round((xpIntoLevel / xpForLevel) * 100)) : 0;

  const achievements   = profile.achievements || {};
  const badgesUnlocked = profile.badgesUnlocked || [];

  const settings = profile.settings || {
    sound: true,
    notifications: true,
  };

  return {
    uid,
    displayName: name,
    avatar,
    totalGames,
    totalCorrect,
    bestStreak,
    xp,
    level,
    xpIntoLevel,
    xpForLevel,
    xpPercent,
    achievements,
    badgesUnlocked,
    settings,
  };
}

async function _maybePersistGeneratedName(uid, profile, displayName) {
  if (profile && profile.displayName) return;
  try {
    await TriviaApp.updateUserProfile(uid, { displayName });
  } catch (_) { /* non-critical */ }
}

function _renderProfileScreen(model) {
  const root = _dom.screenProfile;
  if (!root) return;

  const levelLabel = _t('profileLevel', { level: model.level });
  const xpLabel    = _t('profileXpProgress', { current: model.xpIntoLevel, total: model.xpForLevel });

  const currentLang = (window.TriviaApp?.i18n?.getLanguage?.() || 'en').toLowerCase();

  root.innerHTML = `
    <div class="profile-page">

      <header class="profile-header">
        <button class="btn btn-ghost btn-sm" id="profile-btn-back" aria-label="Back to home">
          ← ${_t('btnBack')}
        </button>
        <h2 class="profile-title">${_t('profileTitle')}</h2>
      </header>

      <section class="profile-hero">
        <div class="profile-avatar-main" aria-label="Selected avatar">${model.avatar}</div>
        <div class="profile-name-block">
          <p class="profile-label">${_t('profileUsername')}</p>
          <p class="profile-name" id="profile-name">${model.displayName}</p>
          <p class="profile-id">ID: ${model.uid.slice(0, 6)}</p>
        </div>
      </section>

      <section class="profile-section">
        <h3 class="profile-section-title">Avatar</h3>
        <div class="profile-avatar-grid" role="radiogroup" aria-label="Choose avatar">
          ${_PROFILE_AVATARS.map(emoji => `
            <button class="avatar-choice ${emoji === model.avatar ? 'selected' : ''}"
                    data-avatar="${emoji}"
                    aria-pressed="${emoji === model.avatar}">
              <span class="avatar-emoji">${emoji}</span>
            </button>
          `).join('')}
        </div>
      </section>

      <section class="profile-section">
        <h3 class="profile-section-title">${_t('profileSettings')}</h3>
        <div class="profile-settings">
          <label class="toggle-row">
            <input type="checkbox" id="profile-sound" ${model.settings.sound ? 'checked' : ''} />
            <span>${_t('profileSound')}</span>
          </label>
          <label class="toggle-row">
            <input type="checkbox" id="profile-notifications" ${model.settings.notifications ? 'checked' : ''} />
            <span>${_t('profileNotifications')}</span>
          </label>

          <button class="btn btn-secondary btn-sm profile-clear" id="profile-clear-data">
            ${_t('profileClearData')}
          </button>
        </div>
      </section>

      <section class="profile-section">
        <h3 class="profile-section-title">${_t('profileBadges')}</h3>
        <div class="profile-badge-grid">
          ${_renderBadgeTile('streak_master', 'Streak Master', '30-day streak', model)}
          ${_renderBadgeTile('explorer', 'Explorer', 'Play all modes', model)}
          ${_renderBadgeTile('sharer', 'Sharer', 'Share the game', model)}
        </div>
      </section>

      <section class="profile-section">
        <h3 class="profile-section-title">${_t('profileTitle')}</h3>
        <div class="profile-stats-grid">
          <div class="profile-stat-card">
            <span class="stat-label">${_t('profileGamesPlayed')}</span>
            <span class="stat-value">${model.totalGames}</span>
          </div>
          <div class="profile-stat-card">
            <span class="stat-label">${_t('profileBestStreak')}</span>
            <span class="stat-value">${model.bestStreak}</span>
          </div>
          <div class="profile-stat-card">
            <span class="stat-label">${_t('profileCorrectAnswers')}</span>
            <span class="stat-value">${model.totalCorrect}</span>
          </div>
        </div>
      </section>

      <section class="profile-section">
        <h3 class="profile-section-title">${_t('profileLevel', { level: '' }).replace(/\s*\{\{level\}\}\s*/, '').trim() || 'Level'}</h3>
        <div class="profile-level-row">
          <span class="level-label">${levelLabel}</span>
          <span class="level-xp">${xpLabel}</span>
        </div>
        <div class="level-bar">
          <div class="level-bar-fill" style="width:${model.xpPercent}%;"></div>
        </div>
      </section>

    </div>
  `;

  _bindProfileEvents(model);
}

function _renderBadgeTile(id, title, desc, model) {
  const unlocked = model.achievements[id] || model.badgesUnlocked.includes(id);
  const baseIcon = id === 'streak_master' ? '🔥'
                  : id === 'explorer'     ? '🧭'
                  : id === 'sharer'       ? '📤'
                  : '🏅';
  const icon = unlocked ? baseIcon : '🔒';
  return `
    <div class="badge-tile ${unlocked ? 'badge-unlocked' : 'badge-locked'}">
      <div class="badge-icon">${icon}</div>
      <div class="badge-text">
        <span class="badge-title">${title}</span>
        <span class="badge-desc">${desc}</span>
      </div>
    </div>
  `;
}

function _bindProfileEvents(model) {
  const backBtn = document.getElementById('profile-btn-back');
  backBtn?.addEventListener('click', () => {
    showHomeScreen();
  });

  // Avatar selection
  const avatarButtons = _dom.screenProfile.querySelectorAll('.avatar-choice');
  avatarButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const val = btn.dataset.avatar;
      if (!val || val === model.avatar) return;
      avatarButtons.forEach(b => {
        b.classList.toggle('selected', b === btn);
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      const mainAvatar = _dom.screenProfile.querySelector('.profile-avatar-main');
      if (mainAvatar) mainAvatar.textContent = val;
      model.avatar = val;
      try {
        await TriviaApp.updateUserProfile(model.uid, { avatar: val });
      } catch (_) {}
    });
  });

  // Settings toggles
  const soundEl = document.getElementById('profile-sound');
  const notifEl = document.getElementById('profile-notifications');
  const saveSettings = async () => {
    const settings = {
      sound: !!soundEl?.checked,
      notifications: !!notifEl?.checked,
    };
    model.settings = settings;
    try {
      await TriviaApp.updateUserProfile(model.uid, { settings });
    } catch (_) {}
  };
  soundEl?.addEventListener('change', saveSettings);
  notifEl?.addEventListener('change', saveSettings);

  // Clear local data
  const clearBtn = document.getElementById('profile-clear-data');
  clearBtn?.addEventListener('click', () => {
    if (!confirm('Clear local data for Mind Sparks Trivia on this device?')) return;
    try {
      localStorage.clear();
      showToast('Local data cleared. You may need to reload.', 'info');
    } catch {
      showToast('Could not clear local data.', 'error');
    }
  });
}

/* ─────────────────────────────────────────────────────────────
   9. AUTH-READY HANDLER & QUESTION PREWARM
   ───────────────────────────────────────────────────────────── */

/**
 * Generate a small batch of questions up front so the first rounds
 * in each mode can be served instantly from the offline store.
 */
async function prewarmQuestionCache() {
  const ai    = (TriviaApp.AI || TriviaApp.ai);
  const store = TriviaApp.OfflineStore;

  if (!ai?.generateQuestion || !store?.saveQuestions) return;

  const combos = [
    ['general', 'easy'],
    ['general', 'medium'],
    ['history', 'easy'],
    ['history', 'medium'],
    ['science', 'easy'],
    ['science', 'medium'],
  ];

  const warmed = [];

  for (const [category, difficulty] of combos) {
    for (let i = 0; i < 2; i++) {
      try {
        const q = await ai.generateQuestion(category, difficulty);
        warmed.push({ ...q, category, difficulty });
      } catch (err) {
        console.warn('[App] prewarmQuestionCache skipped question:', err.message);
        break;
      }
    }
  }

  if (!warmed.length) return;

  try {
    await store.saveQuestions(warmed);
    console.info(`[App] Prewarmed question cache with ${warmed.length} questions.`);
  } catch (err) {
    console.warn('[App] prewarmQuestionCache save failed:', err.message);
  }
}

/**
 * Fired by firebase.js via a custom 'trivia:ready' event once
 * anonymous sign-in completes (new or restored session).
 */
async function _onAuthReady({ detail }) {
  const user = detail?.user;
  if (!user) return;

  TriviaApp.state.authReady = true;
  console.info('[App] Auth ready – uid:', user.uid);

  // Mirror high scores into local state so mode scripts can read them fast
  try {
    const profile = await TriviaApp.getUserProfile(user.uid);
    if (profile?.highScores) {
      Object.assign(TriviaApp.state.highScores, profile.highScores);
    }
  } catch (err) {
    console.warn('[App] Could not prefetch high scores:', err.message);
  }

  // Warm up local question cache in the background for snappier first rounds
  prewarmQuestionCache().catch(err => {
    console.warn('[App] prewarmQuestionCache failed:', err.message);
  });

  // Unlock mode cards (they may have been visually disabled while auth resolved)
  _dom.modeCards.forEach(card => card.removeAttribute('disabled'));
}

/* ─────────────────────────────────────────────────────────────
   10. EVENT LISTENERS
   ───────────────────────────────────────────────────────────── */

function _bindEvents() {
  // Mode selection cards
  _dom.modeCards.forEach(card => {
    // Disable taps until auth is confirmed
    if (!TriviaApp.state.authReady) card.setAttribute('disabled', '');

    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      if (mode) loadMode(mode);
    });

    // Support keyboard activation (Enter / Space) for accessibility
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });

  // Profile icon
  _dom.btnProfile.addEventListener('click', _handleProfileClick);

  // Allow mode scripts to navigate home via a custom event
  document.addEventListener('trivia:show-home', showHome);

  // Firebase auth resolved
  document.addEventListener('trivia:ready', _onAuthReady);
}

/* ─────────────────────────────────────────────────────────────
   11. PUBLIC API — attach to TriviaApp
   ───────────────────────────────────────────────────────────── */

/**
 * Everything game-mode scripts need from the controller layer.
 * Assigned here so firebase.js and ai.js (loaded before us)
 * can reference TriviaApp.showToast / showLoading safely.
 */
Object.assign(TriviaApp, {
  // Loading overlay
  showLoading,
  hideLoading,

  // Toast
  showToast,

  // Screen helpers (granular)
  showScreen,
  showHomeScreen,
  hideHomeScreen,
  clearGameScreen,

  // Composite navigation
  showHome,
  showProfileScreen,
  loadMode,

  /**
   * Convenience: update a high-score in local state AND Firestore.
   * Called by mode scripts when a game ends.
   *
   * @param {string} mode
   * @param {number} score
   * @param {Object} [meta]  Extra data forwarded to saveUserScore
   */
  async recordScore(mode, score, meta = {}) {
    const user = TriviaApp.getCurrentUser();
    if (!user) return;

    // Update in-memory mirror
    if (score > (TriviaApp.state.highScores[mode] ?? 0)) {
      TriviaApp.state.highScores[mode] = score;
    }

    try {
      await TriviaApp.saveUserScore(user.uid, mode, score, meta);
    } catch (err) {
      console.warn('[App] recordScore Firestore write failed:', err.message);
    }
  },

  /**
   * Let mode scripts mark the game as started/stopped without
   * importing state directly.
   */
  setGameActive(val) {
    TriviaApp.state.gameActive = Boolean(val);
  },
});

/* ─────────────────────────────────────────────────────────────
   12. BOOT
   ───────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  _renderHome();
  _bindEvents();
  showScreen(_dom.screenHome);

  const leaderboardBtn =
    document.getElementById('btn-leaderboard');

  if (leaderboardBtn) {
    leaderboardBtn.addEventListener('click', () => {
      if (TriviaApp.Leaderboard) {
        TriviaApp.Leaderboard.show();
      } else {
        console.warn('Leaderboard module missing');
      }
    });
  }

  // firebase.js auto-signs-in on load and dispatches 'trivia:ready'.
  // If the page loaded with an existing session that resolved before
  // DOMContentLoaded (unlikely but possible), check right away.
  if (TriviaApp.getCurrentUser()) {
    _onAuthReady({ detail: { user: TriviaApp.getCurrentUser() } });
  }

  console.info('[App] Controller initialised.');
});
