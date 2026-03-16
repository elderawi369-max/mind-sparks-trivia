/**
 * Mind Sparks Trivia – Quick Match (multiplayer) mode
 *
 * Two-player simultaneous trivia via a shareable 6-character game code.
 *
 * ── Flow ────────────────────────────────────────────────────────
 *  HOST  → name → "Create Game" → lobby with code + share link
 *        → listens for guest via onSnapshot
 *        → detects guest joined → generates 5 questions → game begins
 *
 *  GUEST → name + 6-char code → "Join Game"
 *        → added via transaction → host generates questions → game begins
 *
 * ── Scoring ─────────────────────────────────────────────────────
 *  10 pts per correct answer · 5 questions · max 50 pts per player.
 *  Scores are recalculated from the answers array at results time
 *  (single source of truth — never rely on the incremental Firestore score).
 *
 * ── Race-condition safety ────────────────────────────────────────
 *  All answer submissions use a Firestore transaction that:
 *    1. Reads the current game state atomically.
 *    2. Guards against double-submission (idempotent).
 *    3. Checks if the opponent also answered this question.
 *    4. If so: advances currentQuestionIndex or sets status='finished'
 *       within the SAME transaction — no coordinator / host needed.
 *
 * ── Data model (Firestore 'games' collection) ───────────────────
 *  gameCode             string          6-char human code
 *  hostId / guestId     uid | null
 *  status               'waiting' | 'active' | 'playing' | 'finished'
 *  questions            Question[]      populated by host on startGame
 *  currentQuestionIndex number          0-based
 *  players              PlayerEntry[]   see shape below
 *  createdAt / updatedAt timestamps
 *
 *  PlayerEntry {
 *    id:      string          userId
 *    name:    string
 *    score:   number          updated inside transaction
 *    answers: AnswerEntry[]   sparse: index = question index
 *  }
 *  AnswerEntry { optionIndex: number, correct: boolean }
 *
 * Registers as TriviaApp.Modes.QuickMatch
 * Depends on TriviaApp (firebase.js + app.js) and TriviaApp.AI (ai.js).
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     1. CONSTANTS
     ═══════════════════════════════════════════════════════════════ */

  const MODE_KEY       = 'multiplayer';
  const STORAGE_KEY    = 'trivia_qm_name';
  const QUESTION_COUNT = 5;
  const PTS_CORRECT    = 10;

  const Q_CATEGORIES = ['history', 'science', 'geography', 'movies', 'general'];
  const Q_DIFFS      = ['easy',   'medium',  'medium',    'hard',   'medium'];

  const COL_GAMES = 'games';

  /* ═══════════════════════════════════════════════════════════════
     2. MODULE STATE
     ═══════════════════════════════════════════════════════════════ */

  const _s = {
    gameId:      null,   // Firestore doc ID
    gameCode:    null,   // 6-char human code
    playerName:  null,
    userId:      null,
    role:        null,   // 'host' | 'guest'
    playerIndex: null,   // 0 (host) | 1 (guest) within players[]

    gameData:    null,   // latest Firestore snapshot data
    unsubscribe: null,   // onSnapshot unsubscribe fn
  };

  /* ═══════════════════════════════════════════════════════════════
     3. FIRESTORE SHORTCUTS
     ═══════════════════════════════════════════════════════════════ */

  const _db  = () => TriviaApp.db;
  const _ts  = () => firebase.firestore.FieldValue.serverTimestamp();
  const _ref = () => _db().collection(COL_GAMES).doc(_s.gameId);

  /* ═══════════════════════════════════════════════════════════════
     4. CODE GENERATION
     ═══════════════════════════════════════════════════════════════ */

  function _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  /* ═══════════════════════════════════════════════════════════════
     5. DOM HELPERS
     ═══════════════════════════════════════════════════════════════ */

  const _el   = id  => document.getElementById(id);
  const _setEl = (id, val) => { const e = _el(id); if (e) e.textContent = val; };

  function _setScreen(screenId) {
    ['qm-screen-lobby', 'qm-screen-waiting', 'qm-screen-game', 'qm-screen-results']
      .forEach(id => {
        const el = _el(id);
        if (el) el.classList.toggle('hidden', id !== screenId);
      });
  }

  /* ═══════════════════════════════════════════════════════════════
     6. BUILD UI  (all four screens in one shell)
     ═══════════════════════════════════════════════════════════════ */

  function _buildUI() {
    document.getElementById('screen-game').innerHTML = `
      <div class="qm-game" id="qm-root">

        <!-- Persistent top bar -->
        <div class="qm-topbar">
          <button class="btn btn-ghost btn-sm" id="qm-btn-home"
                  aria-label="Back to home">← Home</button>
          <span class="qm-topbar-title">⚔️ Quick Match</span>
          <!-- Shown only after a game is created/joined -->
          <span class="qm-topbar-code hidden" id="qm-topbar-code"
                aria-label="Current game code" title="Your game code"></span>
        </div>

        <!-- ══ LOBBY ══════════════════════════════════════════ -->
        <div id="qm-screen-lobby" class="qm-screen">

          <div class="qm-section">
            <h2 class="qm-heading">Your Name</h2>
            <input id="qm-input-name" class="qm-input" type="text"
                   maxlength="16" placeholder="Enter your name…"
                   autocomplete="nickname" spellcheck="false" />
          </div>

          <div class="qm-section">
            <button class="btn btn-primary qm-btn-full" id="qm-btn-create">
              🎮 Create New Game
            </button>
          </div>

          <div class="qm-divider"><span>or join one</span></div>

          <div class="qm-section">
            <h2 class="qm-heading">Enter Game Code</h2>
            <div class="qm-input-row">
              <input id="qm-input-code" class="qm-input qm-code-input" type="text"
                     maxlength="6" placeholder="ABC123"
                     autocomplete="off" spellcheck="false" />
              <button class="btn btn-secondary" id="qm-btn-join">Join</button>
            </div>
          </div>

        </div>

        <!-- ══ WAITING ════════════════════════════════════════ -->
        <div id="qm-screen-waiting" class="qm-screen hidden">

          <div class="match-share-card">
            <h2 id="qm-waiting-title">Waiting for opponent…</h2>
            <p  id="qm-waiting-sub">Share this code or link</p>

            <div class="qm-code-display" id="qm-code-display">——————</div>

            <!-- Copy actions row: copy code OR copy full link -->
            <div class="qm-copy-row">
              <button class="btn btn-accent qm-copy-code-btn" id="qm-btn-copy-code"
                      aria-label="Copy game code to clipboard">
                📋 Copy Code
              </button>
              <button class="btn btn-ghost btn-sm" id="qm-btn-copy-link"
                      aria-label="Copy shareable link to clipboard">
                🔗 Copy Link
              </button>
            </div>

            <!-- Compact link preview (no full copy button here) -->
            <div class="share-link-box">
              <span class="share-link-text" id="qm-share-link"></span>
            </div>

            <div class="qm-waiting-row">
              <div class="qm-waiting-dots">
                <span></span><span></span><span></span>
              </div>
              <p class="qm-waiting-label" id="qm-waiting-label">Waiting…</p>
            </div>

            <div class="qm-player-grid" id="qm-player-grid-lobby"></div>
          </div>

        </div>

        <!-- ══ GAME ═══════════════════════════════════════════ -->
        <div id="qm-screen-game" class="qm-screen hidden">

          <!-- Live scoreboard -->
          <div class="match-score-board">
            <div class="player-score">
              <span class="score-name"  id="qm-name-self">You</span>
              <span class="score-value" id="qm-pts-self">0</span>
            </div>
            <span class="score-vs">VS</span>
            <div class="player-score">
              <span class="score-name"  id="qm-name-opp">Opponent</span>
              <span class="score-value" id="qm-pts-opp">0</span>
            </div>
          </div>

          <!-- Progress + opponent status -->
          <div class="qm-q-header">
            <span class="qm-q-progress"      id="qm-q-progress">Question 1 of 5</span>
            <span class="qm-opponent-status" id="qm-opp-status"></span>
          </div>

          <!-- Question -->
          <div class="question-card">
            <p class="question-text" id="qm-question-text">Loading…</p>
          </div>

          <!-- Per-player status (who has answered this question) -->
          <div class="qm-player-grid qm-player-grid-game" id="qm-player-grid-game"></div>

          <!-- Answer buttons -->
          <div class="options-grid" id="qm-options" role="group"
               aria-label="Answer choices"></div>

          <!-- Post-answer waiting badge -->
          <div class="qm-answered-badge hidden" id="qm-answered-badge">
            ✓ Answer submitted — waiting for opponent…
          </div>

        </div>

        <!-- ══ RESULTS ════════════════════════════════════════ -->
        <div id="qm-screen-results" class="qm-screen hidden">

          <!-- Winner banner -->
          <div class="result-card" id="qm-result-card">
            <span class="result-icon"     id="qm-result-icon">🏆</span>
            <h2   class="result-headline" id="qm-result-headline">Game Over!</h2>
            <p    class="result-sub"      id="qm-result-sub"></p>

            <div class="match-score-board" style="margin-top:var(--sp-5)">
              <div class="player-score">
                <span class="score-name"  id="qm-final-name-self">You</span>
                <span class="score-value" id="qm-final-pts-self">0</span>
              </div>
              <span class="score-vs">VS</span>
              <div class="player-score">
                <span class="score-name"  id="qm-final-name-opp">Opponent</span>
                <span class="score-value" id="qm-final-pts-opp">0</span>
              </div>
            </div>
          </div>

          <!-- Per-question breakdown -->
          <div class="qm-breakdown" id="qm-breakdown">
            <div class="qm-breakdown-header">
              <span>#</span>
              <span id="qm-bd-name-self">You</span>
              <span id="qm-bd-name-opp">Opp</span>
            </div>
            <!-- rows injected by showResults() -->
          </div>

          <!-- Dynamic rematch panel (populated by _updateRematchUI) -->
          <div class="qm-rematch-status" id="qm-rematch-status" aria-live="polite"></div>

          <!-- Static action buttons -->
          <div class="qm-result-actions">
            <button class="btn btn-primary"   id="qm-btn-rematch">⚔️ Rematch</button>
            <button class="btn btn-secondary" id="qm-btn-home-end">🏠 Main Menu</button>
          </div>

        </div>

      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════
     7. LOBBY — event binding
     ═══════════════════════════════════════════════════════════════ */

  function _bindLobbyEvents() {
    _el('qm-btn-home')?.addEventListener('click', () => _cleanup());

    _el('qm-btn-create')?.addEventListener('click', () => {
      const name = _el('qm-input-name')?.value.trim();
      if (!name) { TriviaApp.showToast('Enter your name first.', 'info'); return; }
      createGame(name);
    });

    _el('qm-btn-join')?.addEventListener('click', () => {
      const name = _el('qm-input-name')?.value.trim();
      const code = (_el('qm-input-code')?.value ?? '').trim().toUpperCase();
      if (!name)          { TriviaApp.showToast('Enter your name first.',       'info'); return; }
      if (code.length !== 6) { TriviaApp.showToast('Game codes are 6 characters.', 'info'); return; }
      joinGame(code, name);
    });

    _el('qm-input-code')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') _el('qm-btn-join')?.click();
    });

    // Persist name between sessions
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { const ni = _el('qm-input-name'); if (ni) ni.value = saved; }
    _el('qm-input-name')?.addEventListener('input', e => {
      try { localStorage.setItem(STORAGE_KEY, e.target.value.trim()); } catch {}
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     8. createGame
     ═══════════════════════════════════════════════════════════════ */

  async function createGame(name) {
    const user = TriviaApp.getCurrentUser();
    if (!user) { TriviaApp.showToast('Not signed in yet.', 'error'); return; }

    TriviaApp.showLoading('Creating game…');
    try {
      const code = _generateCode();

      const ref = await _db().collection(COL_GAMES).add({
        gameCode:             code,
        hostId:               user.uid,
        guestId:              null,
        status:               'waiting',
        questions:            [],
        currentQuestionIndex: 0,
        players: [
          { id: user.uid, name, score: 0, answers: [] },
        ],
        createdAt: _ts(),
        updatedAt: _ts(),
      });

      _s.gameId       = ref.id;
      _s.gameCode     = code;
      _s.playerName   = name;
      _s.userId       = user.uid;
      _s.role         = 'host';
      _s.playerIndex  = 0;

      TriviaApp.hideLoading();
      _showWaitingScreen();
      _startListener();

      console.info(`[QuickMatch] Created – code: ${code}`);

    } catch (err) {
      TriviaApp.hideLoading();
      console.error('[QuickMatch] createGame failed:', err);
      TriviaApp.showToast('Could not create game. Try again.', 'error');
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     9. joinGame  (transaction — prevents double-join race)
     ═══════════════════════════════════════════════════════════════ */

  async function joinGame(code, name) {
    const user = TriviaApp.getCurrentUser();
    if (!user) { TriviaApp.showToast('Not signed in yet.', 'error'); return; }

    TriviaApp.showLoading('Finding game…');
    try {
      // Query by code only (no status filter) so we can give specific
      // error messages — e.g. "Game is full" vs "Game not found".
      const snap = await _db().collection(COL_GAMES)
        .where('gameCode', '==', code)
        .limit(1)
        .get();

      if (snap.empty) {
        TriviaApp.hideLoading();
        TriviaApp.showToast('Game not found. Double-check the code.', 'error');
        return;
      }

      const existingData = snap.docs[0].data();

      // ── Pre-check: surface a clearer error without entering a transaction ─
      if (existingData.hostId === user.uid) {
        TriviaApp.hideLoading();
        TriviaApp.showToast('You cannot join your own game.', 'info');
        return;
      }
      if ((existingData.players?.length ?? 0) >= 2 || existingData.guestId) {
        TriviaApp.hideLoading();
        TriviaApp.showToast('Game is full — only 2 players allowed.', 'error');
        return;
      }
      if (existingData.status !== 'waiting') {
        TriviaApp.hideLoading();
        TriviaApp.showToast('This game has already started.', 'error');
        return;
      }

      const docRef = snap.docs[0].ref;
      let guestIndex = null;

      // Transaction: final atomic validation + add guest ────────────
      await _db().runTransaction(async tx => {
        const docSnap = await tx.get(docRef);
        if (!docSnap.exists) throw new Error('Game was deleted.');

        const data = docSnap.data();
        // Re-validate inside transaction (prevents TOCTOU race)
        if (data.status !== 'waiting')       throw new Error('Game already started.');
        if (data.guestId)                    throw new Error('Game is full.');
        if (data.hostId === user.uid)        throw new Error('Cannot join your own game.');
        if ((data.players?.length ?? 0) >= 2) throw new Error('Game is full.');

        const updatedPlayers = [
          ...(data.players ?? []),
          { id: user.uid, name, score: 0, answers: [] },
        ];
        guestIndex = updatedPlayers.length - 1;

        tx.update(docRef, {
          guestId:  user.uid,
          status:   'active',
          players:  updatedPlayers,
          updatedAt: _ts(),
        });
      });

      _s.gameId      = docRef.id;
      _s.gameCode    = code;
      _s.playerName  = name;
      _s.userId      = user.uid;
      _s.role        = 'guest';
      _s.playerIndex = guestIndex ?? 1;

      TriviaApp.hideLoading();
      _showWaitingScreen();
      _startListener();

      console.info(`[QuickMatch] Joined – code: ${code}`);

    } catch (err) {
      TriviaApp.hideLoading();
      console.error('[QuickMatch] joinGame failed:', err);
      TriviaApp.showToast(err.message ?? 'Could not join. Check the code.', 'error');
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     10. _showWaitingScreen
     ═══════════════════════════════════════════════════════════════ */

  function _showWaitingScreen() {
    _setScreen('qm-screen-waiting');

    // ── Code display ─────────────────────────────────────────────
    _setEl('qm-code-display', _s.gameCode);

    // Show code badge in top bar (visible throughout the game)
    const topbarCode = _el('qm-topbar-code');
    if (topbarCode) {
      topbarCode.textContent = _s.gameCode;
      topbarCode.classList.remove('hidden');
    }

    const shareUrl = `${location.origin}${location.pathname}?game=${_s.gameCode}`;
    _setEl('qm-share-link', shareUrl);

    // ── Copy Code button — copies just the 6-char code ───────────
    _el('qm-btn-copy-code')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(_s.gameCode)
        .then(()  => TriviaApp.showToast(`Code "${_s.gameCode}" copied! 📋`, 'info', 1800))
        .catch(()  => TriviaApp.showToast('Copy failed – copy manually.', 'info'));
    });

    // ── Copy Link button — copies the full shareable URL ─────────
    _el('qm-btn-copy-link')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(shareUrl)
        .then(()  => TriviaApp.showToast('Link copied! 🔗', 'info', 1600))
        .catch(()  => TriviaApp.showToast('Copy failed – copy manually.', 'info'));
    });

    // ── Role-specific labels ──────────────────────────────────────
    if (_s.role === 'host') {
      _setEl('qm-waiting-title', 'Game created! 🎮');
      _setEl('qm-waiting-sub',   'Share the code or link with a friend');
      _setEl('qm-waiting-label', 'Waiting for opponent to join…');
    } else {
      _setEl('qm-waiting-title', 'Joined! 🎉');
      _setEl('qm-waiting-sub',   'Waiting for questions to be generated…');
      _setEl('qm-waiting-label', 'Starting soon…');
    }

    // ── Initial player list (will refresh via _onGameUpdate) ─────
    if (_s.gameData) _updateWaitingPlayers(_s.gameData);
  }

  /* ═══════════════════════════════════════════════════════════════
     11. _updateWaitingPlayers
         Refreshes the player-slot UI in real time from game.players[].
         Called on every snapshot while the waiting screen is visible.
     ═══════════════════════════════════════════════════════════════ */

  function _updateWaitingPlayers(game) {
    const grid = _el('qm-player-grid-lobby');
    if (!grid) return;

    const players   = game?.players ?? [];
    const maxPlayers = game?.maxPlayers || 4;

    const rows = [];
    for (let i = 0; i < maxPlayers; i++) {
      const p = players[i];
      if (p) {
        const isSelf = p.id === _s.userId;
        rows.push(`
          <div class="qm-player-pill occupied">
            <div class="qm-player-pill-main">
              <span class="qm-player-pill-icon">${i === 0 ? '👑' : '👤'}</span>
              <span class="qm-player-pill-name">
                ${p.name || 'Player'}${isSelf ? ' (you)' : ''}
              </span>
            </div>
            <span class="qm-player-pill-sub">Joined</span>
          </div>
        `);
      } else {
        rows.push(`
          <div class="qm-player-pill empty">
            <div class="qm-player-pill-main">
              <span class="qm-player-pill-icon">➕</span>
              <span class="qm-player-pill-name">Empty slot</span>
            </div>
            <span class="qm-player-pill-sub">Waiting…</span>
          </div>
        `);
      }
    }

    grid.innerHTML = rows.join('');

    // Hide waiting dots when at least 2 players joined
    const dotsRow = document.querySelector('#qm-screen-waiting .qm-waiting-row');
    if (dotsRow) {
      dotsRow.classList.toggle('hidden', players.length >= 2);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     13. startGame  (host-only — generates questions, saves to Firestore)
     ═══════════════════════════════════════════════════════════════ */

  /** Guard: prevents duplicate question generation on rapid snapshots. */
  let _generatingQuestions = false;

  /** Guard: results screen rendered once; subsequent snapshots only update rematch UI. */
  let _resultsRendered = false;

  /** Guard: prevents two simultaneous rematch game-creation attempts. */
  let _creatingRematch = false;

  async function startGame(gameData) {
    if (_s.role !== 'host')              return;
    if (gameData.questions?.length > 0)  return;   // already generated
    if (_generatingQuestions)            return;   // already in-flight
    _generatingQuestions = true;

    TriviaApp.showLoading('Generating questions…');
    try {
      const questions = [];
      for (let i = 0; i < QUESTION_COUNT; i++) {
        TriviaApp.showLoading(`Generating question ${i + 1} of ${QUESTION_COUNT}…`);
        const q = await TriviaApp.AI.generateQuestion(Q_CATEGORIES[i], Q_DIFFS[i]);
        questions.push({
          question:     q.question,
          options:      q.options,
          correctIndex: q.correctIndex,
          hint:         q.hint,
          category:     q.category,
          difficulty:   q.difficulty,
        });
      }

      await _ref().update({
        questions,
        status:    'playing',
        updatedAt: _ts(),
      });

      console.info(`[QuickMatch] ${QUESTION_COUNT} questions saved.`);

    } catch (err) {
      console.error('[QuickMatch] startGame failed:', err);
      TriviaApp.showToast('Could not generate questions. Try again.', 'error');
    } finally {
      _generatingQuestions = false;
      TriviaApp.hideLoading();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     12. Firestore listener
     ═══════════════════════════════════════════════════════════════ */

  function _startListener() {
    if (_s.unsubscribe) { _s.unsubscribe(); _s.unsubscribe = null; }

    _s.unsubscribe = _ref().onSnapshot(
      snap => {
        if (!snap.exists) {
          TriviaApp.showToast('Game was deleted.', 'error');
          _cleanup();
          return;
        }
        _s.gameData = { id: snap.id, ...snap.data() };
        _onGameUpdate(_s.gameData);
      },
      err => {
        console.error('[QuickMatch] Snapshot error:', err);
        TriviaApp.showToast('Connection lost. Please reload.', 'error');
      }
    );
  }

  function _onGameUpdate(game) {
    const { status, questions = [], players = [] } = game;

    // ── 'waiting': host alone, waiting for someone to join ───────
    if (status === 'waiting') {
      _updateWaitingPlayers(game);
      return;
    }

    // ── 'active': second player just joined, questions not ready yet
    if (status === 'active') {
      _updateWaitingPlayers(game);   // refresh player list in real time

      if (_s.role === 'host' && questions.length === 0) {
        // Trigger question generation — guard inside startGame prevents dupes
        startGame(game);
        // Update label to reflect that generation is in progress
        _setEl('qm-waiting-label', 'Generating questions for both players…');
      } else if (_s.role === 'guest') {
        _setEl('qm-waiting-label',
          questions.length === 0
            ? 'Opponent is generating questions…'
            : 'Almost ready…'
        );
      }
      return;
    }

    // ── 'playing': all questions ready, game is live ─────────────
    if (status === 'playing' && questions.length > 0) {
      loadQuestion(game.currentQuestionIndex ?? 0);
      return;
    }

    // ── 'finished' ───────────────────────────────────────────────
    if (status === 'finished') {
      // A rematch game was created — switch both players to it
      if (game.nextGameId) {
        _switchToGame(game.nextGameId);
        return;
      }

      if (!_resultsRendered) {
        _resultsRendered = true;
        showResults();
      } else {
        // Subsequent snapshots only update the live rematch panel
        _updateRematchUI(game);
      }
      return;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     13. loadQuestion  (PUBLIC — renders the question at index qi)
     ═══════════════════════════════════════════════════════════════ */

  /** Prevent re-rendering the same question index redundantly. */
  let _lastRenderedQi = -1;

  /**
   * Display question `qi` from the current game document.
   * Called by `_onGameUpdate` on every snapshot and can be called
   * directly for testing.
   *
   * Responsibilities:
   *  - Switch to the game screen on first call for a new qi.
   *  - Render question text and four answer buttons.
   *  - If this player already answered: show coloured buttons + badge.
   *  - Update the live scoreboard and opponent status label.
   *
   * @param {number} qi  0-based question index
   */
  function loadQuestion(qi) {
    const game = _s.gameData;
    if (!game) return;

    const q = game.questions?.[qi];
    if (!q) return;

    const myPlayer  = game.players?.[_s.playerIndex];
    const myAnswer  = myPlayer?.answers?.[qi];    // undefined if not yet answered

    // ── Full re-render only when moving to a new question ────────
    if (qi !== _lastRenderedQi) {
      _lastRenderedQi = qi;

      _setScreen('qm-screen-game');
      _updateScoreBoard(game);

      _setEl('qm-q-progress', `Question ${qi + 1} of ${QUESTION_COUNT}`);
      _setEl('qm-question-text', q.question);

      _renderOptions(q, myAnswer);

      // Answered badge
      const badge = _el('qm-answered-badge');
      if (badge) badge.classList.toggle('hidden', !myAnswer);
    }

    // ── Per-player status indicators (who has answered) ───────────
    _renderGamePlayerStatus(game, qi);

    // ── Update live scores (they change as others answer) ────────
    _updateScoreBoard(game);
  }

  /* ═══════════════════════════════════════════════════════════════
     14. _renderOptions
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Populate the answer grid.
   * If `existingAnswer` is provided the buttons are rendered in their
   * post-answer coloured/disabled state (correct=green, wrong=red, rest=dimmed).
   *
   * @param {{ options: string[], correctIndex: number }} question
   * @param {{ optionIndex: number, correct: boolean }|undefined} existingAnswer
   */
  function _renderOptions(question, existingAnswer) {
    const grid = _el('qm-options');
    if (!grid) return;
    grid.innerHTML = '';

    question.options.forEach((text, idx) => {
      const btn = document.createElement('button');
      btn.className   = 'option-btn';
      btn.textContent = text;

      if (existingAnswer !== undefined) {
        btn.disabled = true;
        if (idx === question.correctIndex)         btn.classList.add('correct');
        else if (idx === existingAnswer.optionIndex) btn.classList.add('wrong');
        else                                       btn.classList.add('dimmed');
      } else {
        btn.addEventListener('click', () => _submitAnswer(idx));
      }

      grid.appendChild(btn);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     15. _renderGamePlayerStatus
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Render the per-player status grid during gameplay.
   * Shows each player's name, score, and whether they have
   * answered the current question.
   */
  function _renderGamePlayerStatus(game, qi) {
    const grid = _el('qm-player-grid-game');
    if (!grid || !Array.isArray(game.players)) return;

    const players    = game.players;
    const maxPlayers = players.length;

    const answeredRow = Array.isArray(game.playerAnswered?.[qi])
      ? game.playerAnswered[qi]
      : [];

    const rows = players.map((p, idx) => {
      const isSelf   = p.id === _s.userId;
      const hasAns   = !!answeredRow[idx] || (p.answers && p.answers[qi] !== undefined);
      const icon     = hasAns ? '✅' : '⏳';
      const status   = hasAns ? 'Answered' : 'Thinking…';
      const pillCls  = hasAns ? 'answered' : 'pending';

      return `
        <div class="qm-player-pill ${pillCls}">
          <div class="qm-player-pill-main">
            <span class="qm-player-pill-icon">${icon}</span>
            <span class="qm-player-pill-name">
              ${p.name || 'Player'}${isSelf ? ' (you)' : ''}
            </span>
          </div>
          <span class="qm-player-pill-sub">${status}</span>
        </div>
      `;
    });

    // If fewer than 4 players, show placeholder slots to stabilise layout
    for (let i = players.length; i < Math.min(4, maxPlayers || 4); i++) {
      rows.push(`
        <div class="qm-player-pill empty">
          <div class="qm-player-pill-main">
            <span class="qm-player-pill-icon">➕</span>
            <span class="qm-player-pill-name">Empty slot</span>
          </div>
          <span class="qm-player-pill-sub">Waiting…</span>
        </div>
      `);
    }

    grid.innerHTML = rows.join('');
  }

  /* ═══════════════════════════════════════════════════════════════
     16. _submitAnswer  (Firestore transaction — race-condition safe)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Record this player's answer for the current question.
   *
   * The transaction atomically:
   *   1. Re-reads the document (prevents stale writes).
   *   2. Guards idempotency (ignores double-tap / double-submit).
   *   3. Writes the answer + updates the player's score.
   *   4. Checks if the opponent has also answered.
   *   5. If both answered AND more questions remain → advances qi.
   *   6. If both answered AND last question → sets status='finished'.
   *
   * No host-only coordinator needed — either player's transaction
   * will trigger the advance as soon as both answers are present.
   *
   * @param {number} optionIndex  0-based index of the option the player tapped
   */
  async function _submitAnswer(optionIndex) {
    if (!_s.gameData || !_s.gameId) return;

    const qi = _s.gameData.currentQuestionIndex ?? 0;
    const q  = _s.gameData.questions?.[qi];
    if (!q) return;

    const isCorrect = optionIndex === q.correctIndex;

    // Immediate local feedback — colour buttons before round-trip completes
    const grid = _el('qm-options');
    if (grid) {
      [...grid.children].forEach((btn, idx) => {
        btn.disabled = true;
        if (idx === q.correctIndex)               btn.classList.add('correct');
        else if (idx === optionIndex && !isCorrect) btn.classList.add('wrong');
        else                                      btn.classList.add('dimmed');
      });
    }
    const badge = _el('qm-answered-badge');
    if (badge) badge.classList.remove('hidden');

    if (isCorrect) TriviaApp.showToast('+10 pts! ✅', 'correct', 1400);
    else           TriviaApp.showToast('Wrong! ❌',   'wrong',   1400);

    // ── Firestore transaction ────────────────────────────────────
    try {
      await _db().runTransaction(async tx => {
        const snap = await tx.get(_ref());
        if (!snap.exists) throw new Error('Game not found.');

        const data    = snap.data();
        const txQi    = data.currentQuestionIndex ?? 0;
        const txQ     = data.questions?.[txQi];
        if (!txQ) return;   // questions not yet written – shouldn't happen

        // Deep-clone players array so we can mutate safely
        const players = (data.players ?? []).map(p => ({
          ...p,
          answers: Array.isArray(p.answers) ? [...p.answers] : [],
        }));

        const myPi = players.findIndex(p => p.id === _s.userId);
        if (myPi === -1) throw new Error('Player not in game.');

        // Idempotency guard — don't overwrite an existing answer
        if (players[myPi].answers[txQi] !== undefined) return;

        const txCorrect = optionIndex === txQ.correctIndex;
        players[myPi].answers[txQi] = { optionIndex, correct: txCorrect };
        if (txCorrect) players[myPi].score += PTS_CORRECT;

        // Check if the other player also answered this question
        const oppPi      = 1 - myPi;
        const oppAnswered = players[oppPi]?.answers?.[txQi] !== undefined;

        let nextQi     = data.currentQuestionIndex ?? 0;
        let nextStatus = data.status;

        if (oppAnswered) {
          if (txQi + 1 < QUESTION_COUNT) {
            nextQi = txQi + 1;          // advance to next question
          } else {
            nextStatus = 'finished';    // last question → end game
          }
        }

        tx.update(_ref(), {
          players,
          currentQuestionIndex: nextQi,
          status:    nextStatus,
          updatedAt: _ts(),
        });
      });

    } catch (err) {
      console.error('[QuickMatch] submitAnswer transaction failed:', err);
      TriviaApp.showToast('Answer may not have saved – check connection.', 'error');
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     16. _updateScoreBoard
     ═══════════════════════════════════════════════════════════════ */

  function _updateScoreBoard(game) {
    const myPlayer  = game.players?.[_s.playerIndex];
    const oppPlayer = game.players?.[1 - _s.playerIndex];

    _setEl('qm-name-self', myPlayer?.name  ?? _s.playerName ?? 'You');
    _setEl('qm-pts-self',  myPlayer?.score ?? 0);
    _setEl('qm-name-opp',  oppPlayer?.name ?? 'Opponent');
    _setEl('qm-pts-opp',   oppPlayer?.score ?? 0);
  }

  /* ═══════════════════════════════════════════════════════════════
     17. showResults  (PUBLIC)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Render the results screen.
   *
   * Scores are RECALCULATED from the answers array (correct answers × PTS_CORRECT)
   * rather than trusting the incremental `score` field, which guards against any
   * edge-case double-counting from transaction retries.
   */
  function showResults() {
    const game = _s.gameData;
    if (!game) return;

    _setScreen('qm-screen-results');

    const myPlayer  = game.players?.[_s.playerIndex]  ?? {};
    const oppPlayer = game.players?.[1 - _s.playerIndex] ?? {};

    // Recalculate scores from answers
    const _calcScore = player => (player.answers ?? [])
      .filter(Boolean)                        // skip sparse gaps
      .filter(a => a.correct).length * PTS_CORRECT;

    const selfPts = _calcScore(myPlayer);
    const oppPts  = _calcScore(oppPlayer);
    const won     = selfPts > oppPts;
    const tied    = selfPts === oppPts;

    // Winner banner
    _setEl('qm-result-icon',     won ? '🏆' : tied ? '🤝' : '😔');
    _setEl('qm-result-headline', won ? 'You Win!' : tied ? "It's a Tie!" : 'You Lose!');

    _setEl('qm-final-name-self', myPlayer.name  ?? _s.playerName ?? 'You');
    _setEl('qm-final-pts-self',  selfPts);
    _setEl('qm-final-name-opp',  oppPlayer.name ?? 'Opponent');
    _setEl('qm-final-pts-opp',   oppPts);

    // Highlight winner's score
    if (!tied) {
      _el(won ? 'qm-final-pts-self' : 'qm-final-pts-opp')?.classList.add('score-winner');
    }

    // Per-question breakdown
    _setEl('qm-bd-name-self', myPlayer.name  ?? 'You');
    _setEl('qm-bd-name-opp',  oppPlayer.name ?? 'Opp');
    _renderBreakdown(game, myPlayer, oppPlayer);

    // ── Action buttons ───────────────────────────────────────────
    _el('qm-btn-rematch')?.addEventListener('click', sendRematchRequest);
    _el('qm-btn-home-end')?.addEventListener('click', () => _cleanup());

    // ── Initial rematch panel render ─────────────────────────────
    _updateRematchUI(game);

    // ── Persist score to Firestore ───────────────────────────────
    TriviaApp.recordScore(MODE_KEY, selfPts, {
      opponent:    oppPlayer.name,
      opponentPts: oppPts,
      outcome:     won ? 'win' : tied ? 'tie' : 'loss',
    });
  }

  /**
   * Build the per-question breakdown rows.
   *
   * Columns: Q# | My result (✓/✗/–) | Opponent result (✓/✗/–)
   */
  function _renderBreakdown(game, myPlayer, oppPlayer) {
    const container = _el('qm-breakdown');
    if (!container) return;

    // Remove old rows but keep the header
    const header = container.querySelector('.qm-breakdown-header');
    container.innerHTML = '';
    if (header) container.appendChild(header);

    const questions = game.questions ?? [];
    questions.forEach((q, i) => {
      const myA  = myPlayer.answers?.[i];
      const oppA = oppPlayer.answers?.[i];

      const row = document.createElement('div');
      row.className = 'qm-breakdown-row';

      const _cell = (answer) => {
        if (!answer) return '<span class="qm-bd-pending">–</span>';
        return answer.correct
          ? '<span class="qm-bd-check">✓</span>'
          : '<span class="qm-bd-cross">✗</span>';
      };

      row.innerHTML = `
        <span class="qm-bd-num">${i + 1}</span>
        <div class="qm-bd-cell">
          ${_cell(myA)}
          <span class="qm-bd-answer">${myA ? q.options[myA.optionIndex] : '—'}</span>
        </div>
        <div class="qm-bd-cell">
          ${_cell(oppA)}
          <span class="qm-bd-answer">${oppA ? q.options[oppA.optionIndex] : '—'}</span>
        </div>
      `;

      container.appendChild(row);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     18. _updateRematchUI
         Reflects the live state of game.rematchRequests[].
         Called from showResults() initially, then on every subsequent
         'finished' snapshot via _onGameUpdate.
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Reactively update the rematch panel on the results screen.
   *
   * States handled:
   *  • Neither has requested  → panel empty, Rematch btn active
   *  • I requested only       → "Waiting for opponent…", btn disabled
   *  • Opponent requested only → banner with Accept / Decline
   *  • Both requested         → host silently calls acceptRematch(),
   *                             guest sees "Starting rematch…"
   *
   * @param {object} game  Latest Firestore game data
   */
  function _updateRematchUI(game) {
    const requests   = game?.rematchRequests ?? [];
    const oppPlayer  = game?.players?.[1 - _s.playerIndex];
    const myId       = _s.userId;
    const oppId      = oppPlayer?.id;
    const oppName    = oppPlayer?.name ?? 'Opponent';

    const iRequested   = requests.includes(myId);
    const oppRequested = !!oppId && requests.includes(oppId);

    // ── Rematch button state ─────────────────────────────────────
    const rematchBtn = _el('qm-btn-rematch');
    if (rematchBtn) {
      if (iRequested) {
        rematchBtn.textContent = '✓ Rematch Requested';
        rematchBtn.disabled    = true;
        rematchBtn.classList.add('qm-btn-requested');
      } else {
        rematchBtn.textContent = '⚔️ Rematch';
        rematchBtn.disabled    = false;
        rematchBtn.classList.remove('qm-btn-requested');
      }
    }

    // ── Status panel ─────────────────────────────────────────────
    const statusArea = _el('qm-rematch-status');
    if (!statusArea) return;

    if (iRequested && oppRequested) {
      // Both want a rematch — the host creates the new game atomically;
      // the guest sees a holding message until nextGameId appears.
      if (_s.role === 'host') {
        acceptRematch();   // guarded by _creatingRematch
      }
      statusArea.innerHTML = `
        <p class="qm-rematch-waiting">
          <span class="qm-rematch-spinner"></span>
          Both ready — starting rematch…
        </p>`;

    } else if (oppRequested && !iRequested) {
      // Opponent is waiting for our decision
      statusArea.innerHTML = `
        <div class="qm-rematch-banner">
          <p class="qm-rematch-banner-msg">⚔️ ${oppName} wants a rematch!</p>
          <div class="qm-rematch-banner-btns">
            <button class="btn btn-correct  qm-rematch-action" id="qm-btn-accept">Accept ✓</button>
            <button class="btn btn-ghost btn-sm qm-rematch-action" id="qm-btn-decline">Decline ✗</button>
          </div>
        </div>`;
      _el('qm-btn-accept')?.addEventListener('click',  () => acceptRematch());
      _el('qm-btn-decline')?.addEventListener('click', () => declineRematch());

    } else if (iRequested) {
      // I requested, waiting for opponent
      statusArea.innerHTML = `
        <p class="qm-rematch-waiting">
          <span class="qm-rematch-spinner"></span>
          Waiting for ${oppName} to accept…
        </p>`;

    } else {
      statusArea.innerHTML = '';
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     19. sendRematchRequest  (PUBLIC)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Adds the current player's userId to the game document's
   * `rematchRequests` array (arrayUnion — idempotent).
   * The Firestore snapshot triggers `_updateRematchUI` on both sides.
   */
  async function sendRematchRequest() {
    if (!_s.gameId) return;
    try {
      await _ref().update({
        rematchRequests: firebase.firestore.FieldValue.arrayUnion(_s.userId),
        updatedAt:       _ts(),
      });
    } catch (err) {
      console.error('[QuickMatch] sendRematchRequest failed:', err);
      TriviaApp.showToast('Could not send rematch request.', 'error');
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     20. acceptRematch  (PUBLIC)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Creates a brand-new game document with the same two players,
   * then writes `nextGameId` to the CURRENT (finished) game document.
   *
   * Both players' existing `onSnapshot` listeners will see `nextGameId`
   * and call `_switchToGame(newId)` — no direct navigation needed.
   *
   * Only one call will run at a time (`_creatingRematch` guard).
   */
  async function acceptRematch() {
    if (_creatingRematch || !_s.gameId || !_s.gameData) return;
    _creatingRematch = true;

    try {
      const players = _s.gameData.players ?? [];
      if (players.length < 2) {
        TriviaApp.showToast('Cannot start rematch — player data missing.', 'error');
        return;
      }

      // Swap roles so the old guest becomes the new host for variety
      const newHost  = players[1];
      const newGuest = players[0];
      const newCode  = _generateCode();

      const newRef = await _db().collection(COL_GAMES).add({
        gameCode:             newCode,
        hostId:               newHost.id,
        guestId:              newGuest.id,
        status:               'active',    // both players already known
        questions:            [],
        currentQuestionIndex: 0,
        rematchRequests:      [],
        players: [
          { id: newHost.id,  name: newHost.name,  score: 0, answers: [] },
          { id: newGuest.id, name: newGuest.name, score: 0, answers: [] },
        ],
        createdAt: _ts(),
        updatedAt: _ts(),
      });

      // Write nextGameId to the old document — both listeners detect it
      await _ref().update({ nextGameId: newRef.id, updatedAt: _ts() });

      console.info(`[QuickMatch] Rematch created – new code: ${newCode}`);

    } catch (err) {
      console.error('[QuickMatch] acceptRematch failed:', err);
      TriviaApp.showToast('Could not create rematch game. Try again.', 'error');
    } finally {
      _creatingRematch = false;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     21. declineRematch  (PUBLIC)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Clears the entire `rematchRequests` array so the opponent's
   * button reverts to the active "⚔️ Rematch" state.
   */
  async function declineRematch() {
    if (!_s.gameId) return;
    try {
      await _ref().update({
        rematchRequests: [],
        updatedAt:       _ts(),
      });
    } catch (err) {
      console.error('[QuickMatch] declineRematch failed:', err);
      TriviaApp.showToast('Could not decline rematch.', 'error');
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     22. _switchToGame  (triggered when nextGameId appears on old doc)
     ═══════════════════════════════════════════════════════════════ */

  /** Prevents re-entrant calls if snapshot fires twice before countdown ends. */
  let _switching = false;

  /**
   * Gracefully transitions the player from the finished game to a new one.
   *
   * 1. Shows a 3-second countdown overlay (bonus polish).
   * 2. Tears down the old Firestore listener.
   * 3. Loads the new game document and resolves the player's new index/role.
   * 4. Calls `_showWaitingScreen()` + `_startListener()` for the new game.
   *
   * @param {string} newGameId  Firestore document ID of the rematch game
   */
  async function _switchToGame(newGameId) {
    if (_switching) return;
    _switching = true;

    // ── Countdown overlay ────────────────────────────────────────
    await _startRematchCountdown(3);

    // ── Tear down old listener ───────────────────────────────────
    if (_s.unsubscribe) { _s.unsubscribe(); _s.unsubscribe = null; }

    // ── Load new game document ───────────────────────────────────
    try {
      const newSnap = await _db().collection(COL_GAMES).doc(newGameId).get();
      if (!newSnap.exists) throw new Error('Rematch game not found.');

      const newGame = { id: newSnap.id, ...newSnap.data() };

      // Resolve this player's index in the NEW game's players array
      const newPi = (newGame.players ?? []).findIndex(p => p.id === _s.userId);
      if (newPi === -1) throw new Error('Player not found in rematch game.');

      // Reset all game-phase state
      _generatingQuestions = false;
      _lastRenderedQi      = -1;
      _resultsRendered     = false;
      _creatingRematch     = false;

      // Update module identity for the new game
      _s.gameId      = newGameId;
      _s.gameCode    = newGame.gameCode;
      _s.playerIndex = newPi;
      _s.role        = newPi === 0 ? 'host' : 'guest';
      _s.gameData    = newGame;

      // Show waiting screen and subscribe to the new game
      _showWaitingScreen();
      _startListener();

      console.info(`[QuickMatch] Switched to rematch – code: ${newGame.gameCode}`);

    } catch (err) {
      console.error('[QuickMatch] _switchToGame failed:', err);
      TriviaApp.showToast('Could not load rematch. Returning to menu.', 'error');
      _cleanup();
    } finally {
      _switching = false;
    }
  }

  /**
   * Injects a full-screen countdown overlay into `#qm-root` and
   * counts down from `seconds` to 0, then removes itself.
   *
   * @param  {number} seconds
   * @returns {Promise<void>}  Resolves when the countdown completes
   */
  function _startRematchCountdown(seconds) {
    return new Promise(resolve => {
      const root = _el('qm-root');
      if (!root) { resolve(); return; }

      // Build overlay
      const overlay = document.createElement('div');
      overlay.className    = 'qm-rematch-overlay';
      overlay.id           = 'qm-rematch-overlay';
      overlay.innerHTML    = `
        <div class="qm-rematch-launch">
          <div class="qm-launch-icon">⚔️</div>
          <h2 class="qm-launch-title">Rematch!</h2>
          <div class="qm-launch-countdown" id="qm-launch-num">${seconds}</div>
        </div>`;
      root.appendChild(overlay);

      // Animate the number down
      let remaining = seconds;
      const numEl   = overlay.querySelector('#qm-launch-num');

      const tick = setInterval(() => {
        remaining--;
        if (numEl) {
          numEl.textContent = remaining > 0 ? remaining : 'Go!';
          numEl.classList.add('qm-countdown-pop');
          setTimeout(() => numEl.classList.remove('qm-countdown-pop'), 300);
        }
        if (remaining <= 0) {
          clearInterval(tick);
          // Brief pause on "Go!" before resolving
          setTimeout(() => {
            overlay.remove();
            resolve();
          }, 500);
        }
      }, 1000);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     19. CLEANUP
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Tear down the Firestore listener and reset module state.
   *
   * @param {boolean} [goHome=true]  Navigate to home screen after cleanup.
   */
  function _cleanup(goHome = true) {
    if (_s.unsubscribe) { _s.unsubscribe(); _s.unsubscribe = null; }
    _generatingQuestions = false;
    _lastRenderedQi      = -1;
    _resultsRendered     = false;
    _creatingRematch     = false;
    _switching           = false;
    // Remove any lingering countdown overlay
    _el('qm-rematch-overlay')?.remove();
    _s.gameId      = null;
    _s.gameCode    = null;
    _s.role        = null;
    _s.gameData    = null;
    _s.playerIndex = null;
    // Intentionally keep _s.playerName so rematch can reuse it
    if (goHome) TriviaApp.showHome();
  }

  /* ═══════════════════════════════════════════════════════════════
     20. INIT
     ═══════════════════════════════════════════════════════════════ */

  function init() {
    _s.userId = TriviaApp.getCurrentUser()?.uid ?? null;
    _buildUI();
    _bindLobbyEvents();
    TriviaApp.setGameActive(true);

    // Auto-fill code from URL ?game=CODE (share-link deep-link)
    const urlCode = new URLSearchParams(location.search).get('game');
    if (urlCode) {
      const ci = _el('qm-input-code');
      if (ci) ci.value = urlCode.toUpperCase();
      TriviaApp.showToast(
        `Code "${urlCode}" detected — enter your name to join.`,
        'info', 3500
      );
    }

    console.info('[QuickMatch] Module initialised.');
  }

  /* ═══════════════════════════════════════════════════════════════
     21. REGISTER
     ═══════════════════════════════════════════════════════════════ */

  TriviaApp.Modes            = TriviaApp.Modes ?? {};
  TriviaApp.Modes.QuickMatch = Object.freeze({
    init,
    createGame,
    joinGame,
    startGame,
    loadQuestion,
    showResults,
    sendRematchRequest,
    acceptRematch,
    declineRematch,
  });

  console.info('[QuickMatch] Module loaded.');
})();
