// Mind Sparks Trivia – simple i18n service (no modules, file:// friendly)
// This script defines language dictionaries inline and attaches
// a small i18n helper to window.TriviaApp.i18n.

(function () {
  'use strict';

  const en = {
    appName: 'Mind Sparks Trivia',
    appSubtitle: 'AI Trivia Challenge',
    homeTagline: 'How sharp is your mind?',

    modeBeatStreak: 'Beat the Streak',
    modeBeatStreakDesc: 'Answer endlessly — keep your streak alive',
    modeGuessYear: 'Guess the Year',
    modeGuessYearDesc: 'Pick the year an event happened from 4 clues',
    modeQuickMatch: 'Quick Match',
    modeQuickMatchDesc: 'Challenge a friend via a share link',

    btnPlay: 'Play',
    btnHome: 'Home',
    btnBack: 'Back',
    btnNext: 'Next',
    btnCancel: 'Cancel',
    btnRetry: 'Try again',
    btnPlayAgain: 'Play Again',
    btnBackToModes: 'Back to Modes',

    loading: 'Loading…',
    loadingQuestion: 'Generating question…',
    loadingMode: 'Loading {{mode}}…',
    offlineNotice: "You're offline – using saved questions",

    // Streak
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

    // Quick Match
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

    dailyRewardTitle: 'Daily Reward',
    dailyRewardClaimed: 'Reward claimed!',
    dailyRewardStreak: 'Login streak: {{days}} days',

    // Errors
    aiNotReady: 'AI service not ready. Please reload.',
  };

  const es = {
    appName: 'Mind Sparks Trivia',
    appSubtitle: 'Desafío de Trivia IA',
    homeTagline: '¿Qué tan aguda es tu mente?',

    modeBeatStreak: 'Racha Imparable',
    modeBeatStreakDesc: 'Responde sin parar — mantén viva tu racha',
    modeGuessYear: 'Adivina el Año',
    modeGuessYearDesc: 'Elige el año en que ocurrió el evento',
    modeQuickMatch: 'Partida Rápida',
    modeQuickMatchDesc: 'Reta a un amigo con un enlace',

    btnPlay: 'Jugar',
    btnHome: 'Inicio',
    btnBack: 'Atrás',
    btnNext: 'Siguiente',
    btnCancel: 'Cancelar',
    btnRetry: 'Intentar de nuevo',
    btnPlayAgain: 'Jugar de nuevo',
    btnBackToModes: 'Volver a los modos',

    loading: 'Cargando…',
    loadingQuestion: 'Generando pregunta…',
    loadingMode: 'Cargando {{mode}}…',
    offlineNotice: 'Estás sin conexión — usando preguntas guardadas',

    streakTitle: 'Racha Imparable',
    streakCounter: 'Racha: {{count}}',
    bestStreak: 'Mejor racha: {{count}}',
    lifelineFifty: '50:50',
    lifelineSkip: 'Saltar',
    lifelinesTitle: 'Comodines',

    yearGuessTitle: 'Adivina el Año',
    yearGuessHint: 'Pista',
    yearGuessNextRound: 'Siguiente ronda',
    yearGuessFunFactLabel: 'Dato curioso',
    yearGuessFindingMoment: 'Buscando un momento histórico…',
    yearGuessAllHintsRevealed: 'Todas las pistas reveladas',
    yearGuessRevealHint: 'Mostrar pista {{index}} de {{max}}',
    yearGuessLoadFailed: 'No se pudo cargar la ronda. Toca para intentarlo de nuevo.',
    yearGuessLoadFailedShort: 'Error al cargar — inténtalo de nuevo.',
    yearGuessTitleCorrect: '¡Correcto! Fue en {{year}}.',
    yearGuessTitleWrong: '¡Incorrecto! El año correcto era {{year}}.',
    yearGuessSubtitleWin: '+{{points}} pts ({{hints}} pistas) · {{desc}}',

    quickMatchTitle: 'Partida Rápida',
    quickMatchCreate: 'Crear Partida',
    quickMatchJoin: 'Unirse a Partida',
    quickMatchEnterCode: 'Código de partida',
    quickMatchWaiting: 'Esperando jugadores…',
    quickMatchYourName: 'Tu nombre',
    quickMatchShareCode: 'Comparte este código o enlace con tus amigos',
    quickMatchCopyCode: 'Copiar código',
    quickMatchCopyLink: 'Copiar enlace',
    quickMatchOpponentGenerating: 'Tu oponente está generando preguntas…',
    quickMatchStartingSoon: 'Comienza pronto…',

    correct: '¡Correcto!',
    wrong: '¡Incorrecto!',
    wrongAnswer: '¡Respuesta incorrecta!',
    streakCorrectAnswerWas: 'La respuesta correcta era: "{{answer}}"',
    lifelineFiftyUsed: '50:50 usado — se eliminaron dos respuestas erróneas',
    questionSkipped: 'Pregunta omitida',
    loadingNextQuestion: 'Cargando la siguiente pregunta…',
    gainedPoints: '+{{points}} pts',
    answerSubmitted: 'Respuesta enviada — esperando a los demás…',

    resultsTitle: '¡Fin de la partida!',
    resultsWin: '¡Has ganado!',
    resultsLose: 'Has perdido',
    resultsTie: 'Empate',
    resultsFinalScore: 'Puntuación final: {{self}} – {{opponent}}',
    resultsRematch: 'Revancha',
    resultsMainMenu: 'Menú principal',
    resultNewBest: '¡Nuevo récord personal!',
    resultGameOver: 'Fin del juego',
    resultYouCrushedIt: '¡Impresionante! Lograste una racha de {{count}}.',
    resultStreakEnded: 'Tu racha terminó en {{count}}.',
    statStreak: 'Racha',
    statBestEver: 'Mejor marca',
    statAnswered: 'Respondidas',

    profileTitle: 'Tu Perfil',
    profileUsername: 'Nombre de usuario',
    profileGamesPlayed: 'Partidas jugadas',
    profileBestStreak: 'Mejor racha',
    profileCorrectAnswers: 'Respuestas correctas',
    profileLevel: 'Nivel {{level}}',
    profileXpProgress: '{{current}} / {{total}} PX',
    profileBadges: 'Insignias',
    profileSettings: 'Ajustes',
    profileSound: 'Efectos de sonido',
    profileNotifications: 'Notificaciones',
    profileClearData: 'Borrar datos locales',
    profileLanguageLabel: 'Idioma',

    dailyRewardTitle: 'Recompensa diaria',
    dailyRewardClaimed: '¡Recompensa reclamada!',
    dailyRewardStreak: 'Racha de inicio de sesión: {{days}} días',

    aiNotReady: 'El servicio de IA no está listo. Vuelve a cargar la página.',
  };

  const ar = {
    appName: 'تريفيا شرارات العقل',
    appSubtitle: 'تحدي تريفيا بالذكاء الاصطناعي',
    homeTagline: 'ما مدى حدة ذهنك؟',

    modeBeatStreak: 'اهزم سلسلة الأسئلة',
    modeBeatStreakDesc: 'أجب بلا توقف — واصل سلسلتك',
    modeGuessYear: 'خمن السنة',
    modeGuessYearDesc: 'اختر السنة التي وقع فيها الحدث',
    modeQuickMatch: 'مباراة سريعة',
    modeQuickMatchDesc: 'تحدَّ صديقًا عبر رابط مشترك',

    btnPlay: 'ابدأ اللعب',
    btnHome: 'الرئيسية',
    btnBack: 'رجوع',
    btnNext: 'التالي',
    btnCancel: 'إلغاء',
    btnRetry: 'حاول مرة أخرى',
    btnPlayAgain: 'العب مرة أخرى',
    btnBackToModes: 'الرجوع إلى الأوضاع',

    loading: 'جارٍ التحميل…',
    loadingQuestion: 'جارٍ توليد سؤال…',
    loadingMode: 'جارٍ تحميل {{mode}}…',
    offlineNotice: 'أنت غير متصل — نستخدم أسئلة محفوظة',

    streakTitle: 'اهزم سلسلة الأسئلة',
    streakCounter: 'السلسلة: {{count}}',
    bestStreak: 'أفضل سلسلة: {{count}}',
    lifelineFifty: '٥٠:٥٠',
    lifelineSkip: 'تجاوز',
    lifelinesTitle: 'المساعدات',

    yearGuessTitle: 'خمن السنة',
    yearGuessHint: 'تلميح',
    yearGuessNextRound: 'الجولة التالية',
    yearGuessFunFactLabel: 'معلومة ممتعة',
    yearGuessFindingMoment: 'جارٍ البحث عن لحظة تاريخية…',
    yearGuessAllHintsRevealed: 'تم إظهار كل التلميحات',
    yearGuessRevealHint: 'أظهر التلميح {{index}} من {{max}}',
    yearGuessLoadFailed: 'تعذر تحميل الجولة. اضغط للمحاولة مرة أخرى.',
    yearGuessLoadFailedShort: 'فشل التحميل — يرجى المحاولة مرة أخرى.',
    yearGuessTitleCorrect: 'إجابة صحيحة! كانت في سنة {{year}}.',
    yearGuessTitleWrong: 'إجابة خاطئة! السنة الصحيحة كانت {{year}}.',
    yearGuessSubtitleWin: '+{{points}} نقاط (استخدمت {{hints}} تلميحات) · {{desc}}',

    quickMatchTitle: 'مباراة سريعة',
    quickMatchCreate: 'إنشاء مباراة جديدة',
    quickMatchJoin: 'الانضمام إلى مباراة',
    quickMatchEnterCode: 'أدخل رمز المباراة',
    quickMatchWaiting: 'جارٍ انتظار اللاعبين…',
    quickMatchYourName: 'اسمك',
    quickMatchShareCode: 'شارك هذا الرمز أو الرابط مع أصدقائك',
    quickMatchCopyCode: 'نسخ الرمز',
    quickMatchCopyLink: 'نسخ الرابط',
    quickMatchOpponentGenerating: 'المنافس يقوم بإنشاء الأسئلة…',
    quickMatchStartingSoon: 'ستبدأ قريبًا…',

    correct: 'إجابة صحيحة!',
    wrong: 'إجابة خاطئة!',
    wrongAnswer: 'إجابة غير صحيحة!',
    streakCorrectAnswerWas: 'الإجابة الصحيحة كانت: "{{answer}}"',
    lifelineFiftyUsed: 'تم استخدام ٥٠:٥٠ — تمت إزالة إجابتين خاطئتين',
    questionSkipped: 'تم تجاوز السؤال',
    loadingNextQuestion: 'جارٍ تحميل السؤال التالي…',
    gainedPoints: '+{{points}} نقطة',
    answerSubmitted: 'تم إرسال الإجابة — بانتظار الآخرين…',

    resultsTitle: 'انتهت المباراة!',
    resultsWin: 'لقد فزت!',
    resultsLose: 'لقد خسرت',
    resultsTie: 'تعادل',
    resultsFinalScore: 'النتيجة النهائية: {{self}} – {{opponent}}',
    resultsRematch: 'مباراة أخرى',
    resultsMainMenu: 'القائمة الرئيسية',
    resultNewBest: 'أفضل رقم شخصي جديد!',
    resultGameOver: 'انتهت اللعبة',
    resultYouCrushedIt: 'رائع! حققت سلسلة من {{count}} إجابات.',
    resultStreakEnded: 'انتهت سلسلتك عند {{count}}.',
    statStreak: 'السلسلة',
    statBestEver: 'أفضل رقم',
    statAnswered: 'إجابات',

    profileTitle: 'ملفك الشخصي',
    profileUsername: 'اسم المستخدم',
    profileGamesPlayed: 'عدد المباريات',
    profileBestStreak: 'أفضل سلسلة',
    profileCorrectAnswers: 'الإجابات الصحيحة',
    profileLevel: 'المستوى {{level}}',
    profileXpProgress: '{{current}} / {{total}} نقطة خبرة',
    profileBadges: 'الشارات',
    profileSettings: 'الإعدادات',
    profileSound: 'المؤثرات الصوتية',
    profileNotifications: 'الإشعارات',
    profileClearData: 'مسح البيانات المحلية',
    profileLanguageLabel: 'اللغة',

    dailyRewardTitle: 'مكافأة يومية',
    dailyRewardClaimed: 'تم استلام المكافأة!',
    dailyRewardStreak: 'سلسلة الدخول: {{days}} أيام',

    aiNotReady: 'خدمة الذكاء الاصطناعي غير جاهزة. يرجى إعادة تحميل الصفحة.',
  };

  const LANG_MAP = { en, es, ar };

  // English-only mode: always use 'en', ignore stored or requested language.
  let _currentCode = 'en';
  let _currentDict = en;

  function setLanguage(_code) {
    // Intentionally a no-op to keep the app locked to English.
    _currentCode = 'en';
    _currentDict = en;
  }

  function t(key, vars = {}) {
    const raw = _currentDict[key] ?? en[key] ?? key;
    if (!raw || typeof raw !== 'string') return String(raw ?? key);
    return raw.replace(/{{\s*([^}]+)\s*}}/g, (_, name) => {
      const v = vars[name];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  function getLanguage() {
    return _currentCode;
  }

  if (typeof window !== 'undefined') {
    window.TriviaApp = window.TriviaApp || {};
    window.TriviaApp.i18n = {
      t,
      setLanguage,
      getLanguage,
      availableLanguages: Object.keys(LANG_MAP),
      get messages() { return _currentDict; },
    };
  }
})();


