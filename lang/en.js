// English localisation
// All keys should be mirrored across other language files (es, ar).

const en = {
  // App / meta
  appName: 'Mind Sparks Trivia',
  appSubtitle: 'AI Trivia Challenge',
  homeTagline: 'How sharp is your mind?',

  // Modes
  modeBeatStreak: 'Beat the Streak',
  modeBeatStreakDesc: 'Answer endlessly — keep your streak alive',
  modeGuessYear: 'Guess the Year',
  modeGuessYearDesc: 'Pick the year an event happened from 4 clues',
  modeQuickMatch: 'Quick Match',
  modeQuickMatchDesc: 'Challenge a friend via a share link',

  // Generic buttons
  btnPlay: 'Play',
  btnHome: 'Home',
  btnBack: 'Back',
  btnNext: 'Next',
  btnCancel: 'Cancel',
  btnRetry: 'Try again',

  // Loading / status
  loading: 'Loading…',
  loadingQuestion: 'Generating question…',
  loadingMode: 'Loading {{mode}}…',
  offlineNotice: "You're offline – using saved questions",

  // Streak mode
  streakTitle: 'Beat the Streak',
  streakCounter: 'Streak: {{count}}',
  bestStreak: 'Best streak: {{count}}',
  lifelineFifty: '50:50',
  lifelineSkip: 'Skip',
  lifelinesTitle: 'Lifelines',

  // Guess the Year
  yearGuessTitle: 'Guess the Year',
  yearGuessHint: 'Hint',
  yearGuessNextRound: 'Next round',
  yearGuessFunFactLabel: 'Fun fact',
  yearGuessFindingMoment: 'Finding a historical moment…',
  yearGuessAllHintsRevealed: 'All hints revealed',
  yearGuessRevealHint: 'Reveal hint {{index}} of {{max}}',
  yearGuessLoadFailed: 'Could not load round. Tap to try again.',
  yearGuessLoadFailedShort: 'Failed to load — please try again.',
  yearGuessTitleCorrect: 'Correct! It was {{year}}.',
  yearGuessTitleWrong: 'Wrong! The correct year was {{year}}.',
  yearGuessSubtitleWin: '+{{points}} pts ({{hints}} hints used) · {{desc}}',

  // Quick Match / multiplayer
  quickMatchTitle: 'Quick Match',
  quickMatchCreate: 'Create New Game',
  quickMatchJoin: 'Join Game',
  quickMatchEnterCode: 'Enter Game Code',
  quickMatchWaiting: 'Waiting for players…',
  quickMatchYourName: 'Your Name',
  quickMatchShareCode: 'Share this code or link with friends',
  quickMatchCopyCode: 'Copy Code',
  quickMatchCopyLink: 'Copy Link',
  quickMatchOpponentGenerating: 'Opponent is generating questions…',
  quickMatchStartingSoon: 'Starting soon…',

  // Gameplay feedback
  correct: 'Correct!',
  wrong: 'Wrong!',
  wrongAnswer: 'Wrong answer!',
  streakCorrectAnswerWas: 'The correct answer was: "{{answer}}"',
  lifelineFiftyUsed: '50:50 used – two wrong answers removed',
  questionSkipped: 'Question skipped!',
  loadingNextQuestion: 'Loading next question…',
  gainedPoints: '+{{points}} pts!',
  answerSubmitted: 'Answer submitted — waiting for others…',

  // Results / rematch
  resultsTitle: 'Game Over!',
  resultsWin: 'You Win!',
  resultsLose: 'You Lose!',
  resultsTie: "It\'s a Tie!",
  resultsFinalScore: 'Final score: {{self}} – {{opponent}}',
  resultsRematch: 'Rematch',
  resultsMainMenu: 'Main Menu',

  // Streak results / stats
  resultNewBest: 'New Personal Best!',
  resultGameOver: 'Game Over',
  resultYouCrushedIt: 'You crushed it with a streak of {{count}}!',
  resultStreakEnded: 'Your streak ended at {{count}}.',
  statStreak: 'Streak',
  statBestEver: 'Best Ever',
  statAnswered: 'Answered',

  // Profile
  profileTitle: 'Your Profile',
  profileUsername: 'Username',
  profileGamesPlayed: 'Games Played',
  profileBestStreak: 'Best Streak',
  profileCorrectAnswers: 'Correct Answers',
  profileLevel: 'Level {{level}}',
  profileXpProgress: '{{current}} / {{total}} XP',
  profileBadges: 'Badges',
  profileSettings: 'Settings',
  profileSound: 'Sound effects',
  profileNotifications: 'Notifications',
  profileClearData: 'Clear local data',
  profileLanguageLabel: 'Language',

  // Buttons / generic actions (extras)
  btnPlayAgain: 'Play Again',
  btnBackToModes: 'Back to Modes',

  // Daily rewards / meta (if needed)
  dailyRewardTitle: 'Daily Reward',
  dailyRewardClaimed: 'Reward claimed!',
  dailyRewardStreak: 'Login streak: {{days}} days',

  // Errors
  aiNotReady: 'AI service not ready. Please reload.',
};

export default en;

