(function() {
  'use strict';

  let leaderboardContentEl = null;

  function init() {
    leaderboardContentEl = document.getElementById('leaderboard-content');

    const backBtn = document.getElementById('btn-leaderboard-back');

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        TriviaApp.showHomeScreen();
      });
    }
  }

  async function show() {

    const screen = document.getElementById('screen-leaderboard');

    if (!screen) return;

    TriviaApp.showScreen(screen);

    await loadLeaderboard();
  }

  async function loadLeaderboard() {

    if (!leaderboardContentEl)
      leaderboardContentEl = document.getElementById('leaderboard-content');

    leaderboardContentEl.innerHTML =
      '<div class="loading">Loading leaderboard...</div>';

    try {

      const entries =
        await TriviaApp.getLeaderboard('beat-streak', 20);

      renderLeaderboard(entries);

    } catch (err) {

      console.error(err);

      leaderboardContentEl.innerHTML =
        '<div class="error">Failed to load leaderboard</div>';
    }
  }

  function renderLeaderboard(entries) {

    if (!entries || entries.length === 0) {
      leaderboardContentEl.innerHTML =
        '<div>No scores yet.</div>';
      return;
    }

    let html = '';

    entries.forEach((entry, index) => {

      const rank = index + 1;

      html += `
        <div class="leaderboard-entry">
          <span class="leaderboard-rank">#${rank}</span>
          <span class="leaderboard-name">${entry.displayName}</span>
          <span class="leaderboard-score">${entry.score}</span>
        </div>
      `;
    });

    leaderboardContentEl.innerHTML = html;
  }

  TriviaApp.Leaderboard = {
    init,
    show,
    loadLeaderboard
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

