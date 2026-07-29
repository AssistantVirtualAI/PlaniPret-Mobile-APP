// Screen dictionary group: insights (MStats, MPipeline, MSearch, MVoicemail extra strings)
export const insightsFr = {
  stats: {
    onDatePrefix: "le",
  },
  pipeline: {},
  search: {
    unknownError: "Erreur inconnue",
    loadError: "Erreur de chargement",
    searchImpossible: "Recherche impossible",
    queryFilter: "Requête : « {q} » · Filtre : {scope}",
    retry: "Réessayer",
    retrying: "Réessai…",
  },
  voicemail: {
    playAria: "Lecture",
    pauseAria: "Pause",
    positionAria: "Position lecture",
    elevenLabsConnected: "Connecté",
    elevenLabsDescription: "Voix IA, aperçu audio et activation NetSapiens synchronisés au profil du courtier.",
    transcriptionLabel: "Transcription",
    emptyInboxHint: "Les nouveaux messages apparaîtront ici",
    emptySavedHint: "Sauvegardez vos messages importants",
  },
} as Record<string, any>;

export const insightsEn = {
  stats: {
    onDatePrefix: "on",
  },
  pipeline: {},
  search: {
    unknownError: "Unknown error",
    loadError: "Loading error",
    searchImpossible: "Search unavailable",
    queryFilter: "Query: « {q} » · Filter: {scope}",
    retry: "Retry",
    retrying: "Retrying…",
  },
  voicemail: {
    playAria: "Play",
    pauseAria: "Pause",
    positionAria: "Playback position",
    elevenLabsConnected: "Connected",
    elevenLabsDescription: "AI voice, audio preview and NetSapiens activation synced to the broker's profile.",
    transcriptionLabel: "Transcript",
    emptyInboxHint: "New messages will appear here",
    emptySavedHint: "Save your important messages",
  },
} as Record<string, any>;
