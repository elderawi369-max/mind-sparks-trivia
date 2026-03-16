// Arabic localisation (AR)
// NOTE: These are RTL strings. When you enable Arabic in the app,
// you should also set dir="rtl" on <html> or the main container.

const ar = {
  // App / meta
  appName: 'تريفيا شرارات العقل',
  appSubtitle: 'تحدي تريفيا بالذكاء الاصطناعي',
  homeTagline: 'ما مدى حدة ذهنك؟',

  // Modes
  modeBeatStreak: 'اهزم سلسلة الأسئلة',
  modeBeatStreakDesc: 'أجب بلا توقف — واصل سلسلتك',
  modeGuessYear: 'خمن السنة',
  modeGuessYearDesc: 'اختر السنة التي وقع فيها الحدث',
  modeQuickMatch: 'مباراة سريعة',
  modeQuickMatchDesc: 'تحدَّ صديقًا عبر رابط مشترك',

  // Generic buttons
  btnPlay: 'ابدأ اللعب',
  btnHome: 'الرئيسية',
  btnBack: 'رجوع',
  btnNext: 'التالي',
  btnCancel: 'إلغاء',
  btnRetry: 'حاول مرة أخرى',

  // Loading / status
  loading: 'جارٍ التحميل…',
  loadingQuestion: 'جارٍ توليد سؤال…',
  loadingMode: 'جارٍ تحميل {{mode}}…',
  offlineNotice: 'أنت غير متصل — نستخدم أسئلة محفوظة',

  // Streak mode
  streakTitle: 'اهزم سلسلة الأسئلة',
  streakCounter: 'السلسلة: {{count}}',
  bestStreak: 'أفضل سلسلة: {{count}}',
  lifelineFifty: '٥٠:٥٠',
  lifelineSkip: 'تجاوز',
  lifelinesTitle: 'المساعدات',

  // Guess the Year
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

  // Quick Match / multiplayer
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

  // Gameplay feedback
  correct: 'إجابة صحيحة!',
  wrong: 'إجابة خاطئة!',
  wrongAnswer: 'إجابة غير صحيحة!',
  streakCorrectAnswerWas: 'الإجابة الصحيحة كانت: "{{answer}}"',
  lifelineFiftyUsed: 'تم استخدام ٥٠:٥٠ — تمت إزالة إجابتين خاطئتين',
  questionSkipped: 'تم تجاوز السؤال',
  loadingNextQuestion: 'جارٍ تحميل السؤال التالي…',
  gainedPoints: '+{{points}} نقطة',
  answerSubmitted: 'تم إرسال الإجابة — بانتظار الآخرين…',

  // Results / rematch
  resultsTitle: 'انتهت المباراة!',
  resultsWin: 'لقد فزت!',
  resultsLose: 'لقد خسرت',
  resultsTie: 'تعادل',
  resultsFinalScore: 'النتيجة النهائية: {{self}} – {{opponent}}',
  resultsRematch: 'مباراة أخرى',
  resultsMainMenu: 'القائمة الرئيسية',

  // Streak results / stats
  resultNewBest: 'أفضل رقم شخصي جديد!',
  resultGameOver: 'انتهت اللعبة',
  resultYouCrushedIt: 'رائع! حققت سلسلة من {{count}} إجابات.',
  resultStreakEnded: 'انتهت سلسلتك عند {{count}}.',
  statStreak: 'السلسلة',
  statBestEver: 'أفضل رقم',
  statAnswered: 'إجابات',

  // Profile
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

  // Buttons / generic actions (extras)
  btnPlayAgain: 'العب مرة أخرى',
  btnBackToModes: 'الرجوع إلى الأوضاع',

  // Daily rewards / meta
  dailyRewardTitle: 'مكافأة يومية',
  dailyRewardClaimed: 'تم استلام المكافأة!',
  dailyRewardStreak: 'سلسلة الدخول: {{days}} أيام',

  // Errors
  aiNotReady: 'خدمة الذكاء الاصطناعي غير جاهزة. يرجى إعادة تحميل الصفحة.',
};

export default ar;

