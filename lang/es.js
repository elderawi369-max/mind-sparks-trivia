// Spanish localisation (ES)
// NOTE: UI remains LTR; strings only.

const es = {
  // App / meta
  appName: 'Mind Sparks Trivia',
  appSubtitle: 'Desafío de Trivia IA',
  homeTagline: '¿Qué tan aguda es tu mente?',

  // Modes
  modeBeatStreak: 'Racha Imparable',
  modeBeatStreakDesc: 'Responde sin parar — mantén viva tu racha',
  modeGuessYear: 'Adivina el Año',
  modeGuessYearDesc: 'Elige el año en que ocurrió el evento',
  modeQuickMatch: 'Partida Rápida',
  modeQuickMatchDesc: 'Reta a un amigo con un enlace',

  // Generic buttons
  btnPlay: 'Jugar',
  btnHome: 'Inicio',
  btnBack: 'Atrás',
  btnNext: 'Siguiente',
  btnCancel: 'Cancelar',
  btnRetry: 'Intentar de nuevo',

  // Loading / status
  loading: 'Cargando…',
  loadingQuestion: 'Generando pregunta…',
  loadingMode: 'Cargando {{mode}}…',
  offlineNotice: 'Estás sin conexión — usando preguntas guardadas',

  // Streak mode
  streakTitle: 'Racha Imparable',
  streakCounter: 'Racha: {{count}}',
  bestStreak: 'Mejor racha: {{count}}',
  lifelineFifty: '50:50',
  lifelineSkip: 'Saltar',
  lifelinesTitle: 'Comodines',

  // Guess the Year
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

  // Quick Match / multiplayer
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

  // Gameplay feedback
  correct: '¡Correcto!',
  wrong: '¡Incorrecto!',
  wrongAnswer: '¡Respuesta incorrecta!',
  streakCorrectAnswerWas: 'La respuesta correcta era: "{{answer}}"',
  lifelineFiftyUsed: '50:50 usado — se eliminaron dos respuestas erróneas',
  questionSkipped: 'Pregunta omitida',
  loadingNextQuestion: 'Cargando la siguiente pregunta…',
  gainedPoints: '+{{points}} pts',
  answerSubmitted: 'Respuesta enviada — esperando a los demás…',

  // Results / rematch
  resultsTitle: '¡Fin de la partida!',
  resultsWin: '¡Has ganado!',
  resultsLose: 'Has perdido',
  resultsTie: 'Empate',
  resultsFinalScore: 'Puntuación final: {{self}} – {{opponent}}',
  resultsRematch: 'Revancha',
  resultsMainMenu: 'Menú principal',

  // Streak results / stats
  resultNewBest: '¡Nuevo récord personal!',
  resultGameOver: 'Fin del juego',
  resultYouCrushedIt: '¡Impresionante! Lograste una racha de {{count}}.',
  resultStreakEnded: 'Tu racha terminó en {{count}}.',
  statStreak: 'Racha',
  statBestEver: 'Mejor marca',
  statAnswered: 'Respondidas',

  // Profile
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

  // Buttons / generic actions (extras)
  btnPlayAgain: 'Jugar de nuevo',
  btnBackToModes: 'Volver a los modos',

  // Daily rewards / meta
  dailyRewardTitle: 'Recompensa diaria',
  dailyRewardClaimed: '¡Recompensa reclamada!',
  dailyRewardStreak: 'Racha de inicio de sesión: {{days}} días',

  // Errors
  aiNotReady: 'El servicio de IA no está listo. Vuelve a cargar la página.',
};

export default es;

