/**
 * Mind Sparks Trivia – Guess the Year mode  (single-guess edition)
 *
 * One guess per round.  Use the optional "Show Hint" button (up to 3×)
 * before committing — each hint used deducts 2 pts from the base 10.
 * After guessing, the result + fun fact appears immediately.
 * The round stays paused until the player taps "Next Round".
 *
 * Scoring:
 *   Correct, 0 hints used → 10 pts
 *   Correct, 1 hint used  →  8 pts
 *   Correct, 2 hints used →  6 pts
 *   Correct, 3 hints used →  4 pts  (minimum win score)
 *   Wrong                 →  0 pts
 *
 * Registers as TriviaApp.Modes.GuessYear
 * Depends on TriviaApp (firebase.js + app.js), TriviaApp.AI (ai.js),
 * and TriviaApp.images (utils/images.js).
 */

(function () {
  'use strict';

  function _t(key, vars) {
    try {
      const i18n = window.TriviaApp && window.TriviaApp.i18n;
      return i18n ? i18n.t(key, vars) : key;
    } catch {
      return key;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     1. CONSTANTS
     ═══════════════════════════════════════════════════════════════ */

  const MODE_KEY     = 'yearguess';
  const STORAGE_KEY  = 'trivia_yearguess';

  const MAX_HINTS   = 3;   // maximum hints a player can reveal per round
  const PTS_WIN     = 10;  // base points for a correct guess
  const PTS_HINT    = 2;   // deducted per hint used before guessing
  const PTS_MIN_WIN = 4;   // floor – always earn something for a correct guess

  /* ═══════════════════════════════════════════════════════════════
     2. GAME STATE
     ═══════════════════════════════════════════════════════════════ */

  const _s = {
    score:      0,
    bestScore:  0,
    roundCount: 0,
    stats:      { wins: 0, losses: 0 },

    /**
     * Active round object.  Shape:
     * {
     *   topic:            string,
     *   description:      string,
     *   year:             number,
     *   yearOptions:      number[4],
     *   correctIndex:     number,
     *   hints:            string[3],
     *   funFact:          string,
     *   imageSearchQuery: string,
     *   imageUrl:         string,
     *   hintsShown:       number,   // incremented each time player taps "Show Hint"
     * }
     */
    currentRound: null,
    roundActive:  false,
  };

  /* ═══════════════════════════════════════════════════════════════
     3. PERSISTENCE
     ═══════════════════════════════════════════════════════════════ */

  function _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        score:      _s.score,
        bestScore:  _s.bestScore,
        roundCount: _s.roundCount,
        stats:      _s.stats,
        lastSaved:  Date.now(),
      }));
    } catch { /* storage full – skip */ }
  }

  function _loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d       = JSON.parse(raw);
      _s.bestScore  = d.bestScore  ?? 0;
      _s.score      = d.score      ?? 0;
      _s.roundCount = d.roundCount ?? 0;
      _s.stats      = d.stats      ?? { wins: 0, losses: 0 };
    } catch { /* corrupt – ignore */ }
  }

  /* ═══════════════════════════════════════════════════════════════
     4. IMAGE FETCHING  (delegates to TriviaApp.images service)
     ═══════════════════════════════════════════════════════════════ */

  async function fetchImageForTopic(query) {
    if (TriviaApp.images?.fetchImageForTopic) {
      return TriviaApp.images.fetchImageForTopic(query);
    }
    console.warn('[YearGuess] TriviaApp.images not ready – using placeholder.');
    return `https://picsum.photos/seed/${encodeURIComponent(query)}/800/450`;
  }

  /* ═══════════════════════════════════════════════════════════════
     5. DOM HELPERS
     ═══════════════════════════════════════════════════════════════ */

  const _el = id => document.getElementById(id);

  function _updateScoreDisplay() {
    const scoreEl = _el('yg-score');
    const bestEl  = _el('yg-best');
    if (scoreEl) scoreEl.textContent = _s.score;
    if (bestEl)  bestEl.textContent  = _s.bestScore;
  }

  function _updateRoundDisplay() {
    const el = _el('yg-round');
    if (el) el.textContent = _s.roundCount;
  }

  /** Sync hint-button label and disabled state with current round progress. */
  function _updateHintButton() {
    const btn       = _el('yg-btn-hint');
    const countSpan = _el('yg-hint-count');
    if (!btn) return;

    const shown    = _s.currentRound?.hintsShown ?? 0;
    const allShown = shown >= MAX_HINTS;

    if (countSpan) countSpan.textContent = `(${shown}/${MAX_HINTS})`;
    btn.disabled = allShown || !_s.roundActive;
    btn.setAttribute('aria-label', allShown
      ? _t('yearGuessAllHintsRevealed')
      : _t('yearGuessRevealHint', { index: shown + 1, max: MAX_HINTS }));
  }

  /** Append one hint row with a slide-in animation. */
  function _appendHint(text) {
    const list = _el('yg-hints');
    if (!list) return;
    const el = document.createElement('div');
    el.className = 'year-hint yg-hint-enter';
    el.innerHTML = `<strong>💡</strong><span>${text}</span>`;
    list.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
  }

  /* ═══════════════════════════════════════════════════════════════
     6. BUILD UI
     ═══════════════════════════════════════════════════════════════ */

  function _buildUI() {
    document.getElementById('screen-game').innerHTML = `
      <div class="yg-game" id="yg-root">

        <!-- Top bar: home ← | score stats -->
        <div class="yg-topbar">
          <button class="btn btn-ghost btn-sm btn-icon" id="yg-btn-home"
                  aria-label="Back to home">← Home</button>

          <div class="yg-topbar-stats">
            <div class="stat-item">
              <span class="stat-label">${_t('profileGamesPlayed').replace('Games Played','Score')}</span>
              <span class="stat-value" id="yg-score">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${_t('bestStreak').split(':')[0] || 'Best'}</span>
              <span class="stat-value" id="yg-best">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${_t('yearGuessRoundLabel') || 'Round'}</span>
              <span class="stat-value" id="yg-round">0</span>
            </div>
          </div>
        </div>

        <!-- Historical image (shimmer skeleton until loaded) -->
        <div class="year-image-frame loading" id="yg-image-frame">
          <img id="yg-image" src="" alt="Historical event image"
               style="opacity:0;transition:opacity 0.4s ease;" />
          <div class="yg-image-overlay" id="yg-image-overlay"></div>
        </div>

        <!-- Topic label -->
        <p class="yg-topic" id="yg-topic">${_t('loading')}</p>

        <!-- Progressive hints list (populated on demand) -->
        <div class="yg-hints" id="yg-hints" aria-live="polite"></div>

        <!-- Hint reveal button -->
        <div class="yg-hint-controls">
          <button class="btn btn-ghost yg-hint-btn" id="yg-btn-hint"
                  aria-label="${_t('yearGuessRevealHint', { index: 1, max: MAX_HINTS })}" disabled>
            💡 ${_t('yearGuessHint')} <span id="yg-hint-count">(0/3)</span>
          </button>
        </div>

        <!-- Year options (2 × 2 grid) — single tap commits the guess -->
        <div class="options-grid" id="yg-options" role="group"
             aria-label="Pick the correct year"></div>

        <!-- Round-end result banner (hidden until guess is made) -->
        <div class="yg-result hidden" id="yg-result">
          <span class="yg-result-icon" id="yg-result-icon"></span>
          <div class="yg-result-body">
            <strong id="yg-result-title"></strong>
            <p     id="yg-result-sub"></p>
            <div class="yg-fun-fact hidden" id="yg-fun-fact">
              <span class="yg-fun-fact-label">💡 ${_t('yearGuessFunFactLabel')}</span>
              <p id="yg-fun-fact-text"></p>
            </div>
          </div>
        </div>

        <!-- Next / Back actions (hidden until round ends) -->
        <div class="yg-actions hidden" id="yg-actions">
          <button class="btn btn-primary" id="yg-btn-next">${_t('yearGuessNextRound')} →</button>
          <button class="btn btn-secondary" id="yg-btn-quit">← ${_t('btnBackToModes')}</button>
        </div>

      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════
     7. RENDER YEAR OPTIONS
     ═══════════════════════════════════════════════════════════════ */

  function _renderYearOptions(yearOptions) {
    const grid = _el('yg-options');
    if (!grid) return;
    grid.innerHTML = '';

    yearOptions.forEach((year, idx) => {
      const btn = document.createElement('button');
      btn.className    = 'option-btn yg-year-btn';
      btn.textContent  = year;
      btn.dataset.year = year;
      btn.dataset.idx  = idx;
      btn.addEventListener('click', () => checkGuess(year));
      grid.appendChild(btn);
    });
  }

  function _setOptionsDisabled(disabled) {
    const grid = _el('yg-options');
    if (!grid) return;
    [...grid.children].forEach(btn => { btn.disabled = disabled; });
  }

  /* ═══════════════════════════════════════════════════════════════
     8. IMAGE LOADING HELPERS
     ═══════════════════════════════════════════════════════════════ */

  function _picsumFallback(query) {
    let seed = 0;
    const str = String(query || 'history');
    for (let i = 0; i < str.length; i++) seed = (seed * 31 + str.charCodeAt(i)) >>> 0;
    return `https://picsum.photos/seed/${seed % 1000}/800/450`;
  }

  function _imageTimeoutPromise(ms, fallback) {
    return new Promise(resolve =>
      setTimeout(() => {
        console.warn(`[YearGuess] Image fetch timed out after ${ms} ms – using placeholder.`);
        resolve(fallback);
      }, ms)
    );
  }

  function _setImageLoading(loading) {
    const frame = _el('yg-image-frame');
    if (frame) frame.classList.toggle('loading', loading);
  }

  function _displayImage(url) {
    const frame = _el('yg-image-frame');
    const img   = _el('yg-image');
    if (!frame || !img) return;

    img.style.opacity = '0';
    img.src           = '';

    img.onload = () => {
      frame.classList.remove('loading');
      img.style.opacity = '1';
    };

    img.onerror = () => {
      const fallback = _picsumFallback(img.alt || 'history');
      if (img.src !== fallback) {
        img.src = fallback;
      } else {
        frame.classList.remove('loading');
        img.style.opacity = '1';
      }
    };

    frame.classList.add('loading');
    img.src = url;
    img.alt = _s.currentRound?.topic ?? 'Historical event';
  }

  /* ═══════════════════════════════════════════════════════════════
     9. startNewRound
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Fetch a new AI question + image, then activate the round UI.
   *
   * Phase 1 – AI (shows full-screen loading overlay, handles its own failover).
   * Phase 2 – Image (shimmer skeleton; Promise.race with 5 s hard cap).
   * Both must resolve (or time out) before buttons are enabled.
   */
  async function startNewRound() {
    if (!TriviaApp.AI) {
      TriviaApp.showToast(_t('aiNotReady'), 'error');
      return;
    }

    _s.roundActive  = false;
    _s.roundCount++;

    const topicEl = _el('yg-topic');
    const hints   = _el('yg-hints');
    const options = _el('yg-options');
    const result  = _el('yg-result');
    const actions = _el('yg-actions');

    if (hints)   hints.innerHTML   = '';
    if (options) options.innerHTML = '';
    if (result)  result.classList.add('hidden');
    if (actions) actions.classList.add('hidden');

    _setOptionsDisabled(true);
    _setImageLoading(true);
    _updateRoundDisplay();

    // Reset + disable hint button while loading
    const hintBtn = _el('yg-btn-hint');
    if (hintBtn) {
      hintBtn.disabled = true;
      const count = _el('yg-hint-count');
      if (count) count.textContent = `(0/${MAX_HINTS})`;
    }

    if (topicEl) topicEl.textContent = _t('yearGuessFindingMoment');

    try {
      // ── Phase 1: AI question ────────────────────────────────────
      const aiResult = await TriviaApp.AI.generateYearQuestion({
        onLoadStart: () => TriviaApp.showLoading(_t('yearGuessFindingMoment')),
        onLoadEnd:   () => TriviaApp.hideLoading(),
      });

      // Reveal topic immediately so the player sees something
      if (topicEl) topicEl.textContent = aiResult.topic;

      // ── Phase 2: Image (5 s outer cap) ─────────────────────────
      const fallbackUrl = _picsumFallback(aiResult.imageSearchQuery);
      const imageUrl    = await Promise.race([
        fetchImageForTopic(aiResult.imageSearchQuery),
        _imageTimeoutPromise(5_000, fallbackUrl),
      ]);

      // ── Activate round ─────────────────────────────────────────
      _s.currentRound = {
        ...aiResult,
        imageUrl,
        hintsShown: 0,
      };

      _displayImage(imageUrl);
      _renderYearOptions(aiResult.yearOptions);
      _setOptionsDisabled(false);
      _s.roundActive = true;
      _updateHintButton();

      console.info(
        `[YearGuess] Round ${_s.roundCount} ready: "${aiResult.topic}" (${aiResult.year})` +
        (imageUrl === fallbackUrl ? ' [placeholder image]' : '')
      );

    } catch (err) {
      TriviaApp.hideLoading();
      _setImageLoading(false);
      console.error('[YearGuess] startNewRound failed:', err);
      TriviaApp.showToast(_t('yearGuessLoadFailed'), 'error');
      if (topicEl) topicEl.textContent = _t('yearGuessLoadFailedShort');
      _showRetryButton();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     11. showHint
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Reveal the next progressive hint from the AI's hints array.
   * Can be called up to MAX_HINTS times per round.
   * Each use is tracked in currentRound.hintsShown for scoring.
   */
  function showHint() {
    const round = _s.currentRound;
    if (!round || !_s.roundActive) return;
    if (round.hintsShown >= MAX_HINTS) return;

    const text = round.hints?.[round.hintsShown];
    if (!text) return;

    round.hintsShown++;
    _appendHint(text);
    _updateHintButton();
  }

  /* ═══════════════════════════════════════════════════════════════
     12. checkGuess  (single guess — immediately ends the round)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Called when the player taps a year button.
   * Locks all input, colours the buttons, and calls endRound().
   *
   * @param {number} selectedYear
   */
  function checkGuess(selectedYear) {
    if (!_s.roundActive || !_s.currentRound) return;

    const { year: correctYear, correctIndex } = _s.currentRound;
    const isCorrect = selectedYear === correctYear;

    // Immediately lock ALL input so double-taps are ignored
    _s.roundActive = false;
    _setOptionsDisabled(true);
    const hintBtn = _el('yg-btn-hint');
    if (hintBtn) hintBtn.disabled = true;

    // Colour the buttons: tapped = correct/wrong, correct = always green, rest = dimmed
    const grid = _el('yg-options');
    if (grid) {
      [...grid.children].forEach((btn, i) => {
        const isSelected = Number(btn.dataset.year) === selectedYear;
        const isAnswer   = i === correctIndex;

        if (isSelected) btn.classList.add(isCorrect ? 'correct' : 'wrong');
        if (!isCorrect && isAnswer) btn.classList.add('correct');  // reveal answer on miss
        if (!isAnswer && !isSelected) btn.classList.add('dimmed');
      });
    }

    if (isCorrect) {
      const earned = Math.max(PTS_WIN - _s.currentRound.hintsShown * PTS_HINT, PTS_MIN_WIN);
      _s.score    += earned;
      if (_s.score > _s.bestScore) _s.bestScore = _s.score;
      _s.stats.wins++;
      _saveState();
      _updateScoreDisplay();
      TriviaApp.showToast(`+${earned} pts! ✅`, 'correct', 1800);
      endRound(true, earned);
    } else {
      _s.stats.losses++;
      _saveState();
      endRound(false, 0);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     13. endRound
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Render the result banner, reveal the fun fact, start the auto-next timer.
   *
   * @param {boolean} won
   * @param {number}  pointsEarned
   */
  function endRound(won, pointsEarned) {
    const round   = _s.currentRound;
    const result  = _el('yg-result');
    const icon    = _el('yg-result-icon');
    const title   = _el('yg-result-title');
    const sub     = _el('yg-result-sub');
    const actions = _el('yg-actions');

    if (result) {
      result.className = `yg-result ${won ? 'correct' : 'wrong'}`;

      if (icon) icon.textContent = won ? '✅' : '❌';

      if (title) title.textContent = won
        ? _t('yearGuessTitleCorrect', { year: round.year })
        : _t('yearGuessTitleWrong',   { year: round.year });

      // Subtitle: points + hints note (won), or event description (lost)
      if (sub) {
        if (won) {
          const hintsUsed = round.hintsShown || 0;
          sub.textContent = _t('yearGuessSubtitleWin', {
            points: pointsEarned,
            hints:  hintsUsed,
            desc:   round.description ?? '',
          });
        } else {
          sub.textContent = round.description ?? '';
        }
      }

      // ── Fun fact reveal (staggered slide-in after banner) ──────
      const funFactBox  = _el('yg-fun-fact');
      const funFactText = _el('yg-fun-fact-text');
      const fact        = round.funFact?.trim();

      if (funFactBox && funFactText && fact) {
        funFactText.textContent = fact;
        funFactBox.classList.remove('hidden');
        requestAnimationFrame(() => {
          funFactBox.classList.add('yg-fun-fact-enter');
          requestAnimationFrame(() => funFactBox.classList.add('visible'));
        });
      }
    }

    // Show actions – player controls the pace from here
    if (actions) actions.classList.remove('hidden');

    // Persist to Firestore (fire-and-forget)
    TriviaApp.recordScore(MODE_KEY, _s.score, {
      roundsPlayed: _s.roundCount,
      wins:         _s.stats.wins,
      losses:       _s.stats.losses,
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     14. RETRY PROMPT  (shown when startNewRound throws)
     ═══════════════════════════════════════════════════════════════ */

  function _showRetryButton() {
    const options = _el('yg-options');
    if (!options) return;
    options.innerHTML = `
      <button class="btn btn-secondary" id="yg-retry"
              style="grid-column:1/-1;">↺ ${_t('btnRetry')}</button>
    `;
    _el('yg-retry')?.addEventListener('click', startNewRound);
  }

  /* ═══════════════════════════════════════════════════════════════
     15. EVENT BINDING
     ═══════════════════════════════════════════════════════════════ */

  function _bindEvents() {
    _el('yg-btn-home')?.addEventListener('click', () => {
      _saveState();
      TriviaApp.showHome();
    });

    _el('yg-btn-next')?.addEventListener('click', startNewRound);

    _el('yg-btn-quit')?.addEventListener('click', () => {
      _saveState();
      TriviaApp.showHome();
    });

    _el('yg-btn-hint')?.addEventListener('click', showHint);
  }

  /* ═══════════════════════════════════════════════════════════════
     16. RESET
     ═══════════════════════════════════════════════════════════════ */

  function reset() {
    _s.score        = 0;
    _s.roundCount   = 0;
    _s.stats        = { wins: 0, losses: 0 };
    _s.roundActive  = false;
    _s.currentRound = null;
    _saveState();
    _buildUI();
    _updateScoreDisplay();
    _updateRoundDisplay();
    _bindEvents();
    TriviaApp.setGameActive(true);
    startNewRound();
  }

  /* ═══════════════════════════════════════════════════════════════
     17. INIT
     ═══════════════════════════════════════════════════════════════ */

  async function init() {
    _loadSavedState();
    _buildUI();
    _updateScoreDisplay();
    _updateRoundDisplay();
    _bindEvents();
    TriviaApp.setGameActive(true);
    await startNewRound();
  }

  /* ═══════════════════════════════════════════════════════════════
     18. REGISTER
     ═══════════════════════════════════════════════════════════════ */

  TriviaApp.Modes           = TriviaApp.Modes ?? {};
  TriviaApp.Modes.GuessYear = Object.freeze({
    init,
    reset,
    startNewRound,
    checkGuess,
    showHint,
    /** Convenience passthrough – canonical implementation in TriviaApp.images */
    fetchImageForTopic: q => TriviaApp.images?.fetchImageForTopic(q) ?? fetchImageForTopic(q),
  });

  console.info('[GuessYear] Module loaded.');
})();
