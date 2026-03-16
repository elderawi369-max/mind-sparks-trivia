/**
 * Mind Sparks Trivia – Beat the Streak mode
 *
 * Self-contained game loop.  Registers as TriviaApp.Modes.BeatStreak.
 * Depends on TriviaApp (firebase.js + app.js) and TriviaApp.AI (ai.js).
 */

(function () {
  'use strict';

  /* ── CONSTANTS ──────────────────────────────────────────────── */

  const MODE_KEY       = 'streak';
  const STORAGE_KEY    = 'trivia_streak';        // localStorage namespace
  const FEEDBACK_DELAY = 1500;                  // ms to show feedback before next Q
  const NEXT_Q_DELAY   = 400;                   // brief pause after feedback closes

  /**
   * Map current streak to difficulty tier.
   *  0–5   → easy
   *  6–10  → medium
   *  11–20 → hard
   *  21+   → expert
   *
   * Both online and offline question generation are driven by this
   * value (passed to TriviaApp.AI.generateQuestion), so the AI and
   * any cached questions see a consistent difficulty hint.
   */
  function _getDifficultyFromStreak(streak) {
    if (streak <= 5)  return 'easy';
    if (streak <= 10) return 'medium';
    if (streak <= 20) return 'hard';
    return 'expert';
  }

  /** Categories rotated per question */
  const CATEGORIES = [
    'history', 'science', 'geography', 'sports', 'music',
    'movies', 'literature', 'technology', 'art', 'nature',
    'food', 'mythology', 'animals', 'general',
  ];

  /* ── I18N HELPER ────────────────────────────────────────────── */

  function _t(key, vars) {
    try {
      const i18n = window.TriviaApp && window.TriviaApp.i18n;
      return i18n ? i18n.t(key, vars) : key;
    } catch {
      return key;
    }
  }

  /* ── MODULE STATE ───────────────────────────────────────────── */

  const _s = {
    currentStreak:  0,
    bestStreak:     0,
    questionCount:  0,          // total answered this session
    currentQuestion: null,      // { question, options, correctIndex, hint, category }
    lifelines: {
      fiftyFifty: 1,
      skip:       1,
    },
    answering:      false,      // lock while feedback is showing
    feedbackTimer:  null,
    categoryQueue:  [],         // shuffled queue so categories rotate evenly

    // ── Preload ──────────────────────────────────────────────────
    nextQuestion:   null,       // fully resolved preloaded question, ready to display
    preloadPromise: null,       // the in-flight Promise so we can await it if needed
  };

  /**
   * Monotonically-increasing counter.  Incrementing it invalidates
   * any in-flight preload so a stale result is never applied to a
   * new game round (wrong answer, reset, quit, etc.).
   */
  let _preloadGeneration = 0;

  /* ── PERSISTENCE ────────────────────────────────────────────── */

  function _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        bestStreak:    _s.bestStreak,
        currentStreak: _s.currentStreak,
        questionCount: _s.questionCount,
        lifelines:     _s.lifelines,
        lastSaved:     Date.now(),
      }));
    } catch { /* storage full – ignore */ }
  }

  function _loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);

      _s.bestStreak = saved.bestStreak ?? 0;

      // Only restore mid-game state if it's less than 30 minutes old
      const age = Date.now() - (saved.lastSaved ?? 0);
      if (age < 30 * 60 * 1000 && saved.currentStreak > 0) {
        _s.currentStreak  = saved.currentStreak;
        _s.questionCount  = saved.questionCount ?? 0;
        _s.lifelines      = saved.lifelines ?? { fiftyFifty: 1, skip: 1 };
      }
    } catch { /* corrupt data – ignore */ }
  }

  function _clearSessionState() {
    _s.currentStreak = 0;
    _s.questionCount = 0;
    _s.lifelines     = { fiftyFifty: 1, skip: 1 };
    _s.answering     = false;
    _s.currentQuestion = null;
    _saveState();
  }

  /* ── CATEGORY QUEUE ─────────────────────────────────────────── */

  /** Fisher-Yates shuffle */
  function _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function _nextCategory() {
    if (_s.categoryQueue.length === 0) {
      _s.categoryQueue = _shuffle(CATEGORIES);
    }
    return _s.categoryQueue.pop();
  }

  /* ── PRELOAD MANAGEMENT ─────────────────────────────────────── */

  /**
   * Discard any in-flight or completed preload.
   * Call on wrong answer, game over, reset, or quit so stale data
   * is never served as the "next" question.
   */
  function _cancelPreload() {
    _preloadGeneration++;          // invalidate any .then() still running
    _s.nextQuestion   = null;
    _s.preloadPromise = null;
  }

  /**
   * Kick off a background fetch for the question AFTER the current one.
   *
   * Rules:
   *  - Does nothing if a preload is already in-flight (idempotent).
   *  - Never shows the loading spinner (silent fetch).
   *  - Stores result in _s.nextQuestion only if the generation counter
   *    still matches (i.e., nothing cancelled it mid-flight).
   *  - On failure, clears gracefully — loadQuestion() will fall back
   *    to a synchronous fetch with spinner.
   *
   * NOT called from lifeline handlers (50:50 / skip) directly; only
   * called from _displayQuestion() after a question is shown.
   */
  function _startPreload() {
    if (!TriviaApp.AI) return;
    if (_s.preloadPromise) return;   // already in-flight – don't double-preload

    const myGen  = ++_preloadGeneration;
    const cat    = _nextCategory();
    const diff   = _currentDifficulty();  // based on streak at this moment

    _s.preloadPromise = TriviaApp.AI
      .generateQuestion(cat, diff)        // no callbacks → no spinner
      .then(q => {
        _s.preloadPromise = null;
        if (myGen !== _preloadGeneration) {
          // A cancel/reset happened while we were fetching – discard
          console.info('[BeatStreak] Preload discarded (stale generation)');
          return;
        }
        _s.nextQuestion = q;
        console.info(`[BeatStreak] Preload ready: ${q.category} / ${q.difficulty}`);
      })
      .catch(err => {
        _s.preloadPromise = null;
        // Only clear nextQuestion if this generation is still active
        if (myGen === _preloadGeneration) _s.nextQuestion = null;
        console.warn('[BeatStreak] Preload failed (silent fallback):', err?.message ?? err);
      });
  }

  /* ── DIFFICULTY RAMP ────────────────────────────────────────── */

  function _currentDifficulty() {
    return _getDifficultyFromStreak(_s.currentStreak);
  }

  /* ── DOM HELPERS ────────────────────────────────────────────── */

  function _el(id) { return document.getElementById(id); }

  function _updateStreakDisplay() {
    const countEl = _el('bts-streak-count');
    const bestEl  = _el('bts-best');
    if (countEl) {
      countEl.textContent = _s.currentStreak;
      // Trigger the CSS bump animation
      countEl.classList.remove('bump');
      void countEl.offsetWidth;
      if (_s.currentStreak > 0) countEl.classList.add('bump');
    }
    if (bestEl) bestEl.textContent = _s.bestStreak;
    _updateDifficultyBadge();
  }

  function _updateLifelineButtons() {
    const ffBtn   = _el('bts-lifeline-fifty');
    const skipBtn = _el('bts-lifeline-skip');
    if (ffBtn)   ffBtn.disabled   = _s.lifelines.fiftyFifty === 0;
    if (skipBtn) skipBtn.disabled = _s.lifelines.skip       === 0;
  }

  /* ── BUILD UI ───────────────────────────────────────────────── */

  function _buildUI() {
    const screen = document.getElementById('screen-game');
    screen.innerHTML = `
      <div class="streak-game" id="bts-root">

        <!-- Top bar: home + streak + personal best -->
        <div class="streak-topbar">
          <button class="btn btn-ghost btn-sm btn-icon" id="bts-btn-home"
                  aria-label="Back to home">
            ← Home
          </button>

          <div class="streak-display" aria-live="polite" aria-label="Current streak">
            <span class="streak-flame" aria-hidden="true">🔥</span>
            <span class="streak-count" id="bts-streak-count">0</span>
            <span class="streak-word">streak</span>
            <span class="streak-difficulty-badge" id="bts-difficulty">Easy</span>
          </div>

          <div class="stat-item" style="min-width:52px;text-align:center;">
            <span class="stat-label">Best</span>
            <span class="stat-value" id="bts-best" style="font-size:1.1rem;">0</span>
          </div>
        </div>

        <!-- Difficulty badge + question counter -->
        <div class="question-meta" id="bts-meta">
          <span class="question-category" id="bts-category">General</span>
          <span class="question-number"   id="bts-qnum">Q 1</span>
        </div>

        <!-- Question card -->
        <div class="question-card enter" id="bts-question-card">
          <p class="question-text" id="bts-question-text">&nbsp;</p>
        </div>

        <!-- Answer options -->
        <div class="options-grid" id="bts-options" role="group"
             aria-label="Answer choices">
          <!-- Injected by _renderOptions() -->
        </div>

        <!-- Answer feedback banner -->
        <div class="answer-feedback hidden" id="bts-feedback" aria-live="assertive">
          <span class="feedback-icon" id="bts-feedback-icon"></span>
          <div class="feedback-body">
            <strong id="bts-feedback-title"></strong>
            <p id="bts-feedback-hint"></p>
          </div>
        </div>

        <!-- Lifeline buttons -->
        <div class="lifelines" id="bts-lifelines">
          <button class="lifeline-btn" id="bts-lifeline-fifty"
                  aria-label="50:50 lifeline – remove two wrong answers">
            <span class="lifeline-icon" aria-hidden="true">⚡</span>
            <span class="lifeline-label">50 : 50</span>
          </button>
          <button class="lifeline-btn" id="bts-lifeline-skip"
                  aria-label="Skip this question">
            <span class="lifeline-icon" aria-hidden="true">⏭</span>
            <span class="lifeline-label">Skip</span>
          </button>
        </div>

      </div><!-- /#bts-root -->
    `;
  }

  /* ── RENDER OPTIONS ─────────────────────────────────────────── */

  function _renderOptions(options) {
    const grid = _el('bts-options');
    if (!grid) return;
    grid.innerHTML = '';

    // Use single-column layout for long option text
    const maxLen = Math.max(...options.map(o => o.length));
    grid.classList.toggle('single-col', maxLen > 40);

    options.forEach((text, idx) => {
      const btn = document.createElement('button');
      btn.className     = 'option-btn';
      btn.dataset.index = idx;
      btn.textContent   = text;
      btn.addEventListener('click', () => _onOptionClick(idx));
      grid.appendChild(btn);
    });
  }

  /* ── QUESTION DISPLAY (shared by preload and sync paths) ───── */

  /**
   * Push a question object into the UI.  Called once the question
   * data is definitely available, regardless of how it was obtained.
   * Also fires _startPreload() for the question after this one.
   *
   * @param {Object} q  Resolved question object from TriviaApp.AI
   */
  function _displayQuestion(q) {
    _s.currentQuestion = q;

    // Update meta bar
    const catEl  = _el('bts-category');
    const qnumEl = _el('bts-qnum');
    if (catEl)  catEl.textContent  = `${_cap(q.category)} · ${_cap(q.difficulty)}`;
    if (qnumEl) qnumEl.textContent = `Q ${_s.questionCount + 1}`;

    // Animate question card entry
    const card = _el('bts-question-card');
    if (card) {
      card.classList.remove('enter');
      void card.offsetWidth;
      card.classList.add('enter');
    }

    const questionEl = _el('bts-question-text');
    if (questionEl) questionEl.textContent = q.question;

    _renderOptions(q.options);
    _setLifelinesDisabled(false);
    _updateLifelineButtons();

    // Kick off the background fetch for the question after this one.
    // Lifelines (50:50, skip) never call _startPreload() directly —
    // they route through loadQuestion() which calls _displayQuestion(),
    // so the preload starts exactly once per displayed question.
    _startPreload();
  }

  /* ── QUESTION LOADING ───────────────────────────────────────── */

  /**
   * Loads and displays the next question using a three-path strategy:
   *
   *  Path A – Preload ready:
   *    Use _s.nextQuestion immediately (zero network delay).
   *
   *  Path B – Preload in-flight:
   *    Await the existing promise so we don't start a competing fetch.
   *    If it completes in time, use the result (Path A).
   *    If it fails, fall through to Path C.
   *
   *  Path C – No preload:
   *    Fetch synchronously with loading spinner.
   *
   * After any successful path, _displayQuestion() fires _startPreload()
   * for the question after this one.
   */
  async function loadQuestion() {
    if (!TriviaApp.AI) {
      TriviaApp.showToast(_t('aiNotReady'), 'error');
      return;
    }

    _s.answering = false;
    _hideFeedback();
    _resetOptionStates();
    _setLifelinesDisabled(true);

    // Show placeholder while we figure out which path to take
    const questionEl = _el('bts-question-text');
    if (questionEl) questionEl.textContent = _t('loading');

    // ── PATH B: preload in-flight → await it before deciding ────
    if (_s.preloadPromise && !_s.nextQuestion) {
      console.info('[BeatStreak] Waiting for in-flight preload…');
      await _s.preloadPromise;  // resolves quickly; worst-case = provider timeout
    }

    // ── PATH A: preloaded question is ready ──────────────────────
    if (_s.nextQuestion) {
      const q = _s.nextQuestion;
      _s.nextQuestion   = null;   // consume it
      _s.preloadPromise = null;
      console.info(`[BeatStreak] Using preloaded question (${q.category}/${q.difficulty})`);
      _displayQuestion(q);
      return;
    }

    // ── PATH C: no preload – synchronous fetch with spinner ──────
    const category   = _nextCategory();
    const difficulty = _currentDifficulty();

    // Show badge immediately so the player sees category while waiting
    const catEl  = _el('bts-category');
    const qnumEl = _el('bts-qnum');
    if (catEl)  catEl.textContent  = `${_cap(category)} · ${_cap(difficulty)}`;
    if (qnumEl) qnumEl.textContent = `Q ${_s.questionCount + 1}`;
    if (questionEl) questionEl.textContent = _t('loadingQuestion');

    try {
      const q = await TriviaApp.AI.generateQuestion(category, difficulty, {
        onLoadStart: () => TriviaApp.showLoading(_t('loadingQuestion')),
        onLoadEnd:   () => TriviaApp.hideLoading(),
      });

      _displayQuestion(q);

    } catch {
      // AI module already toasted; offer in-place retry button
      _setLifelinesDisabled(false);
      _updateLifelineButtons();
      _showRetryPrompt();
    }
  }

  /* ── ANSWER CHECKING ────────────────────────────────────────── */

  function _onOptionClick(selectedIndex) {
    if (_s.answering || !_s.currentQuestion) return;
    _s.answering = true;
    _setAllOptionsDisabled(true);
    checkAnswer(selectedIndex);
  }

  function checkAnswer(selectedIndex) {
    const { correctIndex, hint, options } = _s.currentQuestion;
    const isCorrect = selectedIndex === correctIndex;

    // Colour the buttons
    const grid = _el('bts-options');
    if (grid) {
      [...grid.children].forEach((btn, i) => {
        if (i === correctIndex) {
          btn.classList.add('correct');
        } else if (i === selectedIndex && !isCorrect) {
          btn.classList.add('wrong');
        } else {
          btn.classList.add('dimmed');
        }
      });
    }

    if (isCorrect) {
      _s.currentStreak++;
      _s.questionCount++;

      if (_s.currentStreak > _s.bestStreak) {
        _s.bestStreak = _s.currentStreak;
      }

      _saveState();
      _updateStreakDisplay();
      TriviaApp.showToast(_correctMessage(_s.currentStreak), 'correct', 1200);
      _showFeedback(true, _t('correct'), hint ?? '');

      _s.feedbackTimer = setTimeout(() => {
        _hideFeedback();
        setTimeout(loadQuestion, NEXT_Q_DELAY);
      }, FEEDBACK_DELAY);

    } else {
      // Cancel the preload immediately — no next question needed
      _cancelPreload();

      _showFeedback(
        false,
        _t('wrong'),
        _t('streakCorrectAnswerWas', { answer: options[correctIndex] })
      );
      TriviaApp.showToast(_t('wrongAnswer'), 'wrong', 1800);

      _s.feedbackTimer = setTimeout(() => endGame(), FEEDBACK_DELAY + 300);
    }
  }

  /* ── LIFELINES ──────────────────────────────────────────────── */

  function useFiftyFifty() {
    if (_s.lifelines.fiftyFifty === 0 || _s.answering || !_s.currentQuestion) return;

    const { correctIndex, options } = _s.currentQuestion;
    const grid = _el('bts-options');
    if (!grid) return;

    // Pick two wrong indices to remove
    const wrongIndices = options
      .map((_, i) => i)
      .filter(i => i !== correctIndex);

    // Randomly select 2 to eliminate
    const toRemove = _shuffle(wrongIndices).slice(0, 2);

    toRemove.forEach(i => {
      const btn = grid.children[i];
      if (btn) {
        btn.classList.add('dimmed');
        btn.disabled = true;
      }
    });

    _s.lifelines.fiftyFifty = 0;
    _updateLifelineButtons();
    TriviaApp.showToast(_t('lifelineFiftyUsed'), 'info', 1800);
  }

  function useSkip() {
    if (_s.lifelines.skip === 0 || _s.answering || !_s.currentQuestion) return;

    _s.lifelines.skip = 0;
    _s.answering = true;             // block mid-skip clicks
    _updateLifelineButtons();
    TriviaApp.showToast(_t('questionSkipped'), 'info', 1400);

    // Clear the current question UI immediately so the user sees something happening
    const questionEl = _el('bts-question-text');
    if (questionEl) questionEl.textContent = _t('loadingNextQuestion');
    _resetOptionStates();
    _setAllOptionsDisabled(true);

    // Small delay so the toast is readable before the loading overlay appears
    setTimeout(loadQuestion, 400);
  }

  /* ── GAME OVER ──────────────────────────────────────────────── */

  function endGame() {
    clearTimeout(_s.feedbackTimer);
    _cancelPreload();            // discard any preloaded/in-flight question
    TriviaApp.setGameActive(false);

    const finalStreak = _s.currentStreak;

    // Save best score to Firestore (fire-and-forget)
    TriviaApp.recordScore(MODE_KEY, finalStreak, {
      questionsAnswered: _s.questionCount,
    });

    // Local + global leaderboard submission
    try {
      const currentBest =
        parseInt(localStorage.getItem('bestStreak') || '0', 10);

      if (finalStreak > currentBest) {
        localStorage.setItem('bestStreak', String(finalStreak));

        if (TriviaApp.submitHighScore) {
          TriviaApp.submitHighScore('beat-streak', finalStreak)
            .catch(err =>
              console.warn('Failed to submit score', err)
            );
        }
      }
    } catch (err) {
      console.warn('Failed to persist local best streak', err);
    }

    const isNewBest = finalStreak >= _s.bestStreak && finalStreak > 0;

    const screen = document.getElementById('screen-game');
    screen.innerHTML = `
      <div class="result-card">
        <span class="result-icon" aria-hidden="true">
          ${isNewBest ? '🏆' : (_s.currentStreak >= 5 ? '🎯' : '💀')}
        </span>
        <h2 class="result-headline">
          ${isNewBest ? _t('resultNewBest') : _t('resultGameOver')}
        </h2>
        <p class="result-sub">
          ${isNewBest
            ? _t('resultYouCrushedIt', { count: finalStreak })
            : _t('resultStreakEnded', { count: finalStreak })}
        </p>

        <div class="result-stats">
          <div class="result-stat">
            <span class="result-stat-value">${finalStreak}</span>
            <span class="result-stat-label">${_t('statStreak')}</span>
          </div>
          <div class="result-stat">
            <span class="result-stat-value">${_s.bestStreak}</span>
            <span class="result-stat-label">${_t('statBestEver')}</span>
          </div>
          <div class="result-stat">
            <span class="result-stat-value">${_s.questionCount}</span>
            <span class="result-stat-label">${_t('statAnswered')}</span>
          </div>
        </div>

        <div class="result-actions">
          <button class="btn btn-primary" id="bts-play-again">
            🔥 ${_t('btnPlayAgain')}
          </button>
          <button class="btn btn-secondary" id="bts-go-home">
            ← ${_t('btnBackToModes')}
          </button>
        </div>
      </div>
    `;

    _el('bts-play-again')?.addEventListener('click', reset);
    _el('bts-go-home')?.addEventListener('click', () => TriviaApp.showHome());
  }

  /* ── RETRY PROMPT (shown when AI fails) ─────────────────────── */

  function _showRetryPrompt() {
    const grid = _el('bts-options');
    if (!grid) return;
    grid.innerHTML = `
      <button class="btn btn-secondary" id="bts-retry"
              style="grid-column:1/-1; margin-top:8px;">
        ↺ ${_t('btnRetry')}
      </button>
    `;
    _el('bts-retry')?.addEventListener('click', loadQuestion);
    _setLifelinesDisabled(false);
    _updateLifelineButtons();
  }

  /* ── FEEDBACK BANNER ────────────────────────────────────────── */

  function _showFeedback(isCorrect, title, body) {
    const el    = _el('bts-feedback');
    const icon  = _el('bts-feedback-icon');
    const tEl   = _el('bts-feedback-title');
    const bEl   = _el('bts-feedback-hint');
    if (!el) return;
    el.className = `answer-feedback ${isCorrect ? 'correct' : 'wrong'}`;
    if (icon)  icon.textContent  = isCorrect ? '✓' : '✗';
    if (tEl)   tEl.textContent   = title;
    if (bEl)   bEl.textContent   = body;
  }

  function _hideFeedback() {
    const el = _el('bts-feedback');
    if (el) el.className = 'answer-feedback hidden';
  }

  /* ── OPTION STATE HELPERS ───────────────────────────────────── */

  function _resetOptionStates() {
    const grid = _el('bts-options');
    if (!grid) return;
    [...grid.children].forEach(btn => {
      btn.classList.remove('correct', 'wrong', 'dimmed');
      btn.disabled = false;
    });
  }

  function _setAllOptionsDisabled(state) {
    const grid = _el('bts-options');
    if (!grid) return;
    [...grid.children].forEach(btn => { btn.disabled = state; });
  }

  function _setLifelinesDisabled(state) {
    const ff   = _el('bts-lifeline-fifty');
    const skip = _el('bts-lifeline-skip');
    if (ff)   ff.disabled   = state;
    if (skip) skip.disabled = state;
  }

  /* ── MISC HELPERS ───────────────────────────────────────────── */

  function _cap(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function _updateDifficultyBadge() {
    const badge = _el('bts-difficulty');
    if (!badge) return;
    const diff = _currentDifficulty();
    badge.textContent = _cap(diff);
    badge.dataset.diff = diff;
  }

  const STREAK_MESSAGES = [
    [1,  ''],
    [2,  'Nice!'],
    [3,  '3 in a row! 🎯'],
    [5,  'On fire! 🔥'],
    [7,  'Unstoppable! ⚡'],
    [10, 'LEGENDARY! 🏆'],
    [15, 'Are you even human?! 🤖'],
  ];

  function _correctMessage(streak) {
    let msg = _t('correct');
    for (const [threshold, text] of STREAK_MESSAGES) {
      if (streak >= threshold && text) msg = text;
    }
    return msg;
  }

  function _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ── BIND STATIC EVENTS ─────────────────────────────────────── */

  function _bindEvents() {
    _el('bts-btn-home')?.addEventListener('click', () => {
      clearTimeout(_s.feedbackTimer);
      _cancelPreload();
      _saveState();
      TriviaApp.showHome();
    });

    _el('bts-lifeline-fifty')?.addEventListener('click', useFiftyFifty);
    _el('bts-lifeline-skip')?.addEventListener('click',  useSkip);
  }

  /* ── RESET / PLAY AGAIN ─────────────────────────────────────── */

  function reset() {
    clearTimeout(_s.feedbackTimer);
    _cancelPreload();            // discard preload before clearing state
    _clearSessionState();

    // Re-build UI and start fresh
    _buildUI();
    _updateStreakDisplay();
    _bindEvents();
    TriviaApp.setGameActive(true);

    // Clear AI dedup cache so the player gets fresh questions
    TriviaApp.AI?.clearRecentCache?.();

    loadQuestion();
  }

  /* ── INIT ───────────────────────────────────────────────────── */

  async function init() {
    // Load best streak (and maybe mid-game state) from localStorage
    _loadSavedState();

    // Initialise category queue
    _s.categoryQueue = _shuffle(CATEGORIES);

    _buildUI();
    _updateStreakDisplay();
    _bindEvents();
    TriviaApp.setGameActive(true);

    await loadQuestion();
  }

  /* ── REGISTER ───────────────────────────────────────────────── */

  TriviaApp.Modes          = TriviaApp.Modes ?? {};
  TriviaApp.Modes.BeatStreak = Object.freeze({
    init,
    reset,
    loadQuestion,
    checkAnswer,
    useFiftyFifty,
    useSkip,
    endGame,
  });

  console.info('[BeatStreak] Module loaded.');
})();
