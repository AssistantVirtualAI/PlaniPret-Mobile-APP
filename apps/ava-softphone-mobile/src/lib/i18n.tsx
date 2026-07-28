import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

export type Lang = 'en' | 'fr';

const DICT = {
  en: {
    'common.signOut': 'Sign out',
    'common.on': 'On',
    'common.off': 'Off',
    'common.none': 'None',
    'common.copy': 'Copy',
    'common.clear': 'Clear',
    'common.openSettings': 'Open device settings',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.retry': 'Retry',
    'common.refresh': 'Refresh',
    'common.search': 'Search',
    'common.loading': 'Loading…',
    'common.today': 'Today',
    'common.range7d': '7 days',
    'common.range30d': '30 days',

    'header.callHistory': 'Call history',
    'header.toggleTheme': 'Toggle theme',
    'header.toggleLang': 'Switch language',

    'tabs.home': 'Home',
    'tabs.calls': 'Calls',
    'tabs.messages': 'Messages',
    'tabs.settings': 'Settings',
    'tabs.ava': 'AVA assistant',
    'tabs.contacts': 'Contacts',
    'tabs.chats': 'Chats',
    'tabs.keypad': 'Keypad',
    'tabs.speeddial': 'Speed dial',

    'dashboard.domain': 'Domain',
    'dashboard.myActivity': 'My activity',
    'dashboard.myExtension': 'My extension',
    'dashboard.breakdown': 'Breakdown',
    'dashboard.domainMetrics': 'Domain metrics',
    'dashboard.myMetrics': 'My metrics',
    'dashboard.callsPerDay': 'Calls per day',
    'dashboard.topExtensions': 'Top extensions',
    'dashboard.insights': 'Insights',
    'dashboard.avaAssistant': 'AVA assistant',
    'dashboard.avaSummary': 'AVA summary',
    'dashboard.openChat': 'Open chat',
    'dashboard.noActivity': 'No activity in this range.',
    'dashboard.greeting': 'Hi,',
    'dashboard.callsLine': '{total} calls · {answered} answered · {missed} missed.',

    'm.totalCalls': 'Total calls',
    'm.answered': 'Answered',
    'm.missed': 'Missed',
    'm.voicemails': 'Voicemails',
    'm.answerRate': 'Answer rate',
    'm.avgDuration': 'Avg duration',
    'm.totalTalk': 'Total talk',
    'm.peakHour': 'Peak hour',
    'm.outbound': 'Outbound',
    'm.failedDials': 'Failed dials',
    'm.dialSuccess': 'Dial success',
    'm.activeExt': 'Active ext.',
    'm.myCalls': 'My calls',
    'm.myAnswered': 'My answered',
    'm.myMissed': 'My missed',
    'm.myVoicemails': 'My voicemails',
    'm.myRecordings': 'My recordings',
    'm.myAvgDuration': 'My avg duration',
    'm.answerRateLabel': 'Answer rate',
    'm.direction': 'Direction',
    'm.inbound': 'Inbound',
    'm.outboundLong': 'Outbound',
    'm.talkTime': 'Talk time',
    'm.avg': 'avg',
    'm.target': 'target',

    'settings.profile': 'Profile',
    'settings.admin': 'Domain admin',
    'settings.user': 'User',
    'settings.calling': 'Calling',
    'settings.availability': 'Availability',
    'settings.dnd': 'Do not disturb',
    'settings.callForwarding': 'Call forwarding',
    'settings.voicemailGreeting': 'Voicemail greeting',
    'settings.account': 'Account',
    'settings.extDevices': 'Extension & devices',
    'settings.extension': 'Extension',
    'settings.sipDomain': 'SIP domain',
    'settings.client': 'Client',
    'settings.dataScope': 'Data scope',
    'settings.role': 'Role',
    'settings.devices': 'Devices',
    'settings.notifications': 'Notifications',
    'settings.appearance': 'Appearance',
    'settings.theme': 'Theme',
    'settings.language': 'Language',
    'settings.themeDark': 'Dark',
    'settings.themeLight': 'Light',
    'settings.diagnostics': 'Diagnostics',
    'settings.about': 'About',
    'settings.privacy': 'Privacy',
    'settings.permissions': 'Permissions',
    'settings.security': 'Security & data',
    'settings.adminTitle': 'Workspace controls',
    'settings.workspace': 'Admin',
    'settings.usersExt': 'Users & extensions',
    'settings.phoneNumbers': 'Phone numbers',
    'settings.ivrs': 'IVRs, queues & routing',
    'settings.voiceAgents': 'Voice agents',
    'settings.syncStatus': 'Sync status',
    'settings.openPortal': 'Open portal',
    'settings.audioOutput': 'Audio output',
    'settings.ringtone': 'Ringtone',
    'settings.haptics': 'Haptics',
    'settings.autoAnswer': 'Auto-answer',
    'settings.clearCache': 'Clear app cache',
    'settings.signOut': 'Sign out',
    'settings.helpSupport': 'Help & support',
    'settings.privacyPolicy': 'Privacy policy',
    'settings.termsOfService': 'Terms of service',
    'settings.dataSafety': 'Data safety',
    'settings.deleteAccount': 'Delete account',
    'settings.version': 'Version',
    'settings.scopeDomain': 'Domain-wide PBX',
    'settings.scopeOwn': 'Own extension only',
    'settings.pushEnabled': 'Push enabled',
    'settings.pushDisabled': 'Push disabled',
    'settings.defaultGreeting': 'Default · Lemtel AVA',
    'settings.audioQuality': 'Audio quality',
    'settings.noiseCancel': 'Noise cancellation',
    'settings.noiseCancelSub': 'Removes background noise on your mic',
    'settings.ncStandard': 'Standard',
    'settings.ncOffice': 'Office',
    'settings.ncPhone': 'Phone',
    'settings.ncStandardDesc': 'Balanced default',
    'settings.ncOfficeDesc': 'Filters keyboard & AC',
    'settings.ncPhoneDesc': 'Tuned for weak cellular',
    'settings.network': 'Network',
    'settings.autoHandover': 'Auto Wi-Fi / LTE handover',
    'settings.autoHandoverSub': 'Auto-detects best signal and re-registers',
    'settings.preferWifi': 'Prefer Wi-Fi when available',
    'settings.backgroundCalls': 'Background calls',
    'settings.currentNetwork': 'Current network',
    'settings.netWifi': 'Wi-Fi',
    'settings.netCellular': 'Cellular',
    'settings.netOffline': 'Offline',

    'more.eyebrowComms': 'Communications',
    'more.moreFeatures': 'More features',
    'more.callingFeatures': 'Calling features',
    'more.callingFeaturesHint': 'Hold, transfer, record, DND…',
    'more.voicemail': 'Voicemail',
    'more.voicemailHint': 'Inbox & greetings',
    'more.messages': 'Messages',
    'more.messagesHint': 'SMS conversations',
    'more.queues': 'Queues',
    'more.queuesHint': 'Live queues & agents',
    'more.contacts': 'Contacts',
    'more.contactsHint': 'Directory',
    'more.eyebrowAccount': 'Account',
    'more.settingsPrivacy': 'Settings & privacy',
    'more.settings': 'Settings',
    'more.permissions': 'Permissions',
    'more.permissionsHint': 'Mic, notifications, contacts',
    'more.privacy': 'Privacy',
    'more.privacyHint': 'How we use your data',
    'more.dataSafety': 'Data safety',
    'more.dataSafetyHint': 'Store disclosures',
    'more.aiAudit': 'AI requests audit',
    'more.aiAuditHint': 'Transcription & analysis log',
    'more.terms': 'Terms of service',
    'more.support': 'Support',
    'more.eyebrowDanger': 'Danger zone',
    'more.accountControl': 'Account control',
    'more.signOut': 'Sign out',
    'more.deleteAccount': 'Delete my account',
    'more.back': 'Back',

    'calls.history': 'History',
    'calls.recordings': 'Recordings',
    'calls.voicemail': 'Voicemail',
    'calls.keypad': 'Keypad',
    'calls.all': 'All',
    'calls.missed': 'Missed',
    'calls.extension': 'Extension',
    'calls.allExtensions': 'All extensions (domain)',
    'calls.mine': 'Mine ({ext})',
    'calls.showingMine': 'Showing your extension {ext} only.',
    'calls.searchPlaceholder': 'Search name, number, extension…',
    'calls.enterNumber': 'Enter number',
    'calls.dialing': 'Dialing…',
    'calls.call': 'Call',
    'calls.live': 'SIP · Live',
    'calls.offline': 'Offline',
    'calls.noCalls': 'No calls yet',
    'calls.noCallsHint': 'Your call history will appear here. Tap the keypad to start one.',
    'calls.openDialer': 'Open dialer',
    'calls.keypadError': 'Keypad error',
    'calls.sipNotReg': 'SIP not registered',
    'calls.sipConnecting': 'The SIP client is still connecting. Tap retry to reconnect now.',
    'calls.retryConnect': 'Retry connection',

    'messages.team': 'Team Chat',
    'messages.sms': 'SMS',
    'messages.contacts': 'Contacts',

    'voicemail.search': 'Search voicemails',
    'voicemail.countLine': '{shown} of {total}',
    'voicemail.elevenlabsGreeting': 'ElevenLabs greeting',
    'voicemail.greetingPlaceholder': 'Type your voicemail greeting…',
    'voicemail.saved': 'Greeting updated with ElevenLabs voice.',
    'voicemail.noMatch': 'No matching voicemails',
    'voicemail.noMatchHint': 'Try a different search term.',
    'voicemail.empty': 'No voicemails',
    'voicemail.emptyHint': 'When callers leave a message, AVA will transcribe and summarize it here.',
    'voicemail.new': 'NEW',
    'voicemail.high': 'HIGH',
    'voicemail.audioUnavailable': 'Audio not available — recording may have been deleted from PBX.',

    'queues.title': 'Call queues',
    'queues.livePbx': 'Live PBX',
    'queues.searchPlaceholder': 'Search queues…',
    'queues.active': 'active',
    'queues.joined': 'joined',
    'queues.notSignedIn': 'Not signed in',
    'queues.joinedToast': 'Joined {name}',
    'queues.leftToast': 'Left {name}',
    'queues.joinFailed': 'Join failed',
    'queues.leaveFailed': 'Leave failed',
    'queues.updateFailed': 'Update failed',
    'queues.couldntLoad': "Couldn't load queues",
    'queues.empty': 'No queues configured',
    'queues.emptyHint': 'Queues synced from your SIP domain will appear here.',
    'queues.waiting': '{n} waiting',
    'queues.agentsOnline': '{n} agents online',
    'queues.callsToday': '{n} calls today',
    'queues.wait': 'Wait {n}s',
    'queues.slaToday': 'SLA TODAY',
    'queues.join': 'Join',
    'queues.leave': 'Leave',
    'queues.pause': 'Pause',
    'queues.resume': 'Resume',
    'queues.paused': 'PAUSED',
    'queues.activeBadge': 'ACTIVE',

    'auth.welcome': 'Welcome back',
    'auth.signIn': 'Sign in',
    'auth.signUp': 'Sign up',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.forgot': 'Forgot password?',
    'auth.continue': 'Continue',
    'auth.or': 'or',
    'auth.signInGoogle': 'Continue with Google',

    'contacts.search': 'Search contacts',
    'contacts.empty': 'No contacts yet',
    'contacts.emptyHint': 'Contacts synced from your device or organization will appear here.',
    'contacts.call': 'Call',
    'contacts.message': 'Message',

    'dialer.title': 'Dialer',

    'profile.title': 'Profile',
    'profile.editPhoto': 'Edit photo',
    'profile.copyEmail': 'Copy email',
    'profile.copyExt': 'Copy extension',

    'permissions.mic': 'Microphone',
    'permissions.notif': 'Notifications',
    'permissions.contacts': 'Contacts',
    'permissions.granted': 'Granted',
    'permissions.denied': 'Denied',
    'permissions.prompt': 'Not requested',

    'data.error': 'Something went wrong',
    'data.errorHint': 'Pull to refresh or try again.',
    'data.empty': 'Nothing to show',

    'sync.loading': 'Syncing…',
    'sync.success': 'Up to date',
    'sync.error': 'Sync failed',
  },

  fr: {
    'common.signOut': 'Déconnexion',
    'common.on': 'Activé',
    'common.off': 'Désactivé',
    'common.none': 'Aucun',
    'common.copy': 'Copier',
    'common.clear': 'Effacer',
    'common.openSettings': "Ouvrir les paramètres de l'appareil",
    'common.cancel': 'Annuler',
    'common.save': 'Enregistrer',
    'common.retry': 'Réessayer',
    'common.refresh': 'Actualiser',
    'common.search': 'Rechercher',
    'common.loading': 'Chargement…',
    'common.today': "Aujourd'hui",
    'common.range7d': '7 jours',
    'common.range30d': '30 jours',

    'header.callHistory': 'Historique des appels',
    'header.toggleTheme': 'Changer de thème',
    'header.toggleLang': 'Changer de langue',

    'tabs.home': 'Accueil',
    'tabs.calls': 'Appels',
    'tabs.messages': 'Messages',
    'tabs.settings': 'Réglages',
    'tabs.ava': 'Assistant AVA',
    'tabs.contacts': 'Contacts',
    'tabs.chats': 'Discussions',
    'tabs.keypad': 'Clavier',
    'tabs.speeddial': 'Appel rapide',

    'dashboard.domain': 'Domaine',
    'dashboard.myActivity': 'Mon activité',
    'dashboard.myExtension': 'Mon extension',
    'dashboard.breakdown': 'Détails',
    'dashboard.domainMetrics': 'Statistiques du domaine',
    'dashboard.myMetrics': 'Mes statistiques',
    'dashboard.callsPerDay': 'Appels par jour',
    'dashboard.topExtensions': 'Meilleures extensions',
    'dashboard.insights': 'Aperçus',
    'dashboard.avaAssistant': 'Assistant AVA',
    'dashboard.avaSummary': 'Résumé AVA',
    'dashboard.openChat': 'Ouvrir le chat',
    'dashboard.noActivity': 'Aucune activité dans cette période.',
    'dashboard.greeting': 'Bonjour,',
    'dashboard.callsLine': '{total} appels · {answered} répondus · {missed} manqués.',

    'm.totalCalls': 'Appels totaux',
    'm.answered': 'Répondus',
    'm.missed': 'Manqués',
    'm.voicemails': 'Messageries',
    'm.answerRate': 'Taux de réponse',
    'm.avgDuration': 'Durée moy.',
    'm.totalTalk': 'Temps total',
    'm.peakHour': 'Heure de pointe',
    'm.outbound': 'Sortants',
    'm.failedDials': "Échecs d'appel",
    'm.dialSuccess': "Succès d'appel",
    'm.activeExt': 'Ext. actives',
    'm.myCalls': 'Mes appels',
    'm.myAnswered': 'Mes répondus',
    'm.myMissed': 'Mes manqués',
    'm.myVoicemails': 'Mes messageries',
    'm.myRecordings': 'Mes enregistrements',
    'm.myAvgDuration': 'Ma durée moy.',
    'm.answerRateLabel': 'Taux de réponse',
    'm.direction': 'Direction',
    'm.inbound': 'Entrants',
    'm.outboundLong': 'Sortants',
    'm.talkTime': 'Temps de parole',
    'm.avg': 'moy.',
    'm.target': 'cible',

    'settings.profile': 'Profil',
    'settings.admin': 'Admin du domaine',
    'settings.user': 'Utilisateur',
    'settings.calling': 'Appels',
    'settings.availability': 'Disponibilité',
    'settings.dnd': 'Ne pas déranger',
    'settings.callForwarding': "Transfert d'appel",
    'settings.voicemailGreeting': 'Message de messagerie',
    'settings.account': 'Compte',
    'settings.extDevices': 'Extension et appareils',
    'settings.extension': 'Extension',
    'settings.sipDomain': 'Domaine SIP',
    'settings.client': 'Client',
    'settings.dataScope': 'Portée des données',
    'settings.role': 'Rôle',
    'settings.devices': 'Appareils',
    'settings.notifications': 'Notifications',
    'settings.appearance': 'Apparence',
    'settings.theme': 'Thème',
    'settings.language': 'Langue',
    'settings.themeDark': 'Sombre',
    'settings.themeLight': 'Clair',
    'settings.diagnostics': 'Diagnostics',
    'settings.about': 'À propos',
    'settings.privacy': 'Confidentialité',
    'settings.permissions': 'Permissions',
    'settings.security': 'Sécurité et données',
    'settings.adminTitle': 'Contrôles administrateur',
    'settings.workspace': 'Admin',
    'settings.usersExt': 'Utilisateurs et extensions',
    'settings.phoneNumbers': 'Numéros de téléphone',
    'settings.ivrs': 'SVI, files et routage',
    'settings.voiceAgents': 'Agents vocaux',
    'settings.syncStatus': 'État de synchronisation',
    'settings.openPortal': 'Ouvrir le portail',
    'settings.audioOutput': 'Sortie audio',
    'settings.ringtone': 'Sonnerie',
    'settings.haptics': 'Vibrations',
    'settings.autoAnswer': 'Réponse automatique',
    'settings.clearCache': "Vider le cache de l'application",
    'settings.signOut': 'Déconnexion',
    'settings.helpSupport': 'Aide et support',
    'settings.privacyPolicy': 'Politique de confidentialité',
    'settings.termsOfService': "Conditions d'utilisation",
    'settings.dataSafety': 'Sécurité des données',
    'settings.deleteAccount': 'Supprimer le compte',
    'settings.version': 'Version',
    'settings.scopeDomain': 'PBX complet du domaine',
    'settings.scopeOwn': 'Mon extension uniquement',
    'settings.pushEnabled': 'Notifications activées',
    'settings.pushDisabled': 'Notifications désactivées',
    'settings.defaultGreeting': 'Par défaut · Lemtel AVA',
    'settings.audioQuality': 'Qualité audio',
    'settings.noiseCancel': 'Réduction de bruit',
    'settings.noiseCancelSub': 'Supprime le bruit ambiant du micro',
    'settings.ncStandard': 'Standard',
    'settings.ncOffice': 'Bureau',
    'settings.ncPhone': 'Téléphone',
    'settings.ncStandardDesc': 'Équilibré par défaut',
    'settings.ncOfficeDesc': 'Filtre clavier et climatisation',
    'settings.ncPhoneDesc': 'Optimisé cellulaire faible',
    'settings.network': 'Réseau',
    'settings.autoHandover': 'Bascule automatique Wi-Fi / LTE',
    'settings.autoHandoverSub': 'Détecte le meilleur signal et se ré-enregistre',
    'settings.preferWifi': 'Préférer Wi-Fi quand disponible',
    'settings.backgroundCalls': 'Appels en arrière-plan',
    'settings.currentNetwork': 'Réseau actuel',
    'settings.netWifi': 'Wi-Fi',
    'settings.netCellular': 'Cellulaire',
    'settings.netOffline': 'Hors ligne',

    'more.eyebrowComms': 'Communications',
    'more.moreFeatures': 'Plus de fonctionnalités',
    'more.callingFeatures': "Fonctions d'appel",
    'more.callingFeaturesHint': "Mise en attente, transfert, enregistrement, NPD…",
    'more.voicemail': 'Messagerie vocale',
    'more.voicemailHint': "Boîte de réception et messages d'accueil",
    'more.messages': 'Messages',
    'more.messagesHint': 'Conversations SMS',
    'more.queues': "Files d'attente",
    'more.queuesHint': "Files et agents en direct",
    'more.contacts': 'Contacts',
    'more.contactsHint': 'Répertoire',
    'more.eyebrowAccount': 'Compte',
    'more.settingsPrivacy': 'Réglages et confidentialité',
    'more.settings': 'Réglages',
    'more.permissions': 'Permissions',
    'more.permissionsHint': 'Micro, notifications, contacts',
    'more.privacy': 'Confidentialité',
    'more.privacyHint': 'Utilisation de vos données',
    'more.dataSafety': 'Sécurité des données',
    'more.dataSafetyHint': 'Divulgations',
    'more.aiAudit': 'Audit des requêtes IA',
    'more.aiAuditHint': "Journal de transcription et d'analyse",
    'more.terms': "Conditions d'utilisation",
    'more.support': 'Support',
    'more.eyebrowDanger': 'Zone sensible',
    'more.accountControl': 'Contrôle du compte',
    'more.signOut': 'Déconnexion',
    'more.deleteAccount': 'Supprimer mon compte',
    'more.back': 'Retour',

    'calls.history': 'Historique',
    'calls.recordings': 'Enregistrements',
    'calls.voicemail': 'Messagerie',
    'calls.keypad': 'Clavier',
    'calls.all': 'Tous',
    'calls.missed': 'Manqués',
    'calls.extension': 'Extension',
    'calls.allExtensions': 'Toutes les extensions (domaine)',
    'calls.mine': 'La mienne ({ext})',
    'calls.showingMine': 'Affichage uniquement de votre extension {ext}.',
    'calls.searchPlaceholder': 'Rechercher nom, numéro, extension…',
    'calls.enterNumber': 'Entrer un numéro',
    'calls.dialing': 'Composition…',
    'calls.call': 'Appeler',
    'calls.live': 'SIP · En ligne',
    'calls.offline': 'Hors ligne',
    'calls.noCalls': 'Aucun appel',
    'calls.noCallsHint': "Votre historique d'appels apparaîtra ici. Touchez le clavier pour commencer.",
    'calls.openDialer': 'Ouvrir le clavier',
    'calls.keypadError': 'Erreur du clavier',
    'calls.sipNotReg': 'SIP non enregistré',
    'calls.sipConnecting': 'Le client SIP se connecte encore. Touchez Réessayer pour vous reconnecter.',
    'calls.retryConnect': 'Reconnecter',

    'messages.team': "Chat d'équipe",
    'messages.sms': 'SMS',
    'messages.contacts': 'Contacts',

    'voicemail.search': 'Rechercher dans la messagerie',
    'voicemail.countLine': '{shown} sur {total}',
    'voicemail.elevenlabsGreeting': 'Message ElevenLabs',
    'voicemail.greetingPlaceholder': "Saisissez votre message d'accueil…",
    'voicemail.saved': "Message mis à jour avec une voix ElevenLabs.",
    'voicemail.noMatch': 'Aucun message correspondant',
    'voicemail.noMatchHint': 'Essayez un autre terme.',
    'voicemail.empty': 'Aucun message vocal',
    'voicemail.emptyHint': 'Lorsque les appelants laissent un message, AVA le transcrit et le résume ici.',
    'voicemail.new': 'NOUVEAU',
    'voicemail.high': 'PRIORITAIRE',
    'voicemail.audioUnavailable': "Audio indisponible — l'enregistrement a peut-être été supprimé du PBX.",

    'queues.title': "Files d'attente",
    'queues.livePbx': 'PBX en direct',
    'queues.searchPlaceholder': 'Rechercher des files…',
    'queues.active': 'actives',
    'queues.joined': 'rejointes',
    'queues.notSignedIn': 'Non connecté',
    'queues.joinedToast': 'Rejoint {name}',
    'queues.leftToast': 'Quitté {name}',
    'queues.joinFailed': 'Échec de la jonction',
    'queues.leaveFailed': 'Échec du départ',
    'queues.updateFailed': 'Échec de la mise à jour',
    'queues.couldntLoad': 'Impossible de charger les files',
    'queues.empty': 'Aucune file configurée',
    'queues.emptyHint': "Les files synchronisées depuis votre domaine SIP apparaîtront ici.",
    'queues.waiting': '{n} en attente',
    'queues.agentsOnline': '{n} agents en ligne',
    'queues.callsToday': "{n} appels aujourd'hui",
    'queues.wait': 'Attente {n}s',
    'queues.slaToday': "SLA AUJOURD'HUI",
    'queues.join': 'Rejoindre',
    'queues.leave': 'Quitter',
    'queues.pause': 'Pause',
    'queues.resume': 'Reprendre',
    'queues.paused': 'EN PAUSE',
    'queues.activeBadge': 'ACTIF',

    'auth.welcome': 'Bon retour',
    'auth.signIn': 'Connexion',
    'auth.signUp': "S'inscrire",
    'auth.email': 'Courriel',
    'auth.password': 'Mot de passe',
    'auth.forgot': 'Mot de passe oublié ?',
    'auth.continue': 'Continuer',
    'auth.or': 'ou',
    'auth.signInGoogle': 'Continuer avec Google',

    'contacts.search': 'Rechercher des contacts',
    'contacts.empty': 'Aucun contact',
    'contacts.emptyHint': 'Les contacts synchronisés depuis votre appareil ou organisation apparaîtront ici.',
    'contacts.call': 'Appeler',
    'contacts.message': 'Message',

    'dialer.title': 'Clavier',

    'profile.title': 'Profil',
    'profile.editPhoto': 'Modifier la photo',
    'profile.copyEmail': 'Copier le courriel',
    'profile.copyExt': "Copier l'extension",

    'permissions.mic': 'Micro',
    'permissions.notif': 'Notifications',
    'permissions.contacts': 'Contacts',
    'permissions.granted': 'Accordé',
    'permissions.denied': 'Refusé',
    'permissions.prompt': 'Non demandé',

    'data.error': 'Une erreur est survenue',
    'data.errorHint': 'Tirez pour actualiser ou réessayez.',
    'data.empty': 'Rien à afficher',

    'sync.loading': 'Synchronisation…',
    'sync.success': 'À jour',
    'sync.error': 'Échec de la synchro',
  },

} as const;

type Key = keyof typeof DICT['en'];

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
}

const I18nCtx = createContext<Ctx | null>(null);
const STORAGE = 'ava.mobile.lang';

export function MobileI18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem(STORAGE);
      if (stored === 'en' || stored === 'fr') return stored;
      return (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
    } catch { return 'en'; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE, lang); } catch {}
    try { document.documentElement.lang = lang; } catch {}
  }, [lang]);

  const t: Ctx['t'] = (key, vars) => {
    let v = (DICT[lang] as any)[key] ?? (DICT.en as any)[key] ?? key;
    if (vars) for (const [k, val] of Object.entries(vars)) v = v.replace(`{${k}}`, String(val));
    return v;
  };

  return (
    <I18nCtx.Provider value={{ lang, setLang: setLangState, toggle: () => setLangState((l) => (l === 'fr' ? 'en' : 'fr')), t }}>
      {children}
    </I18nCtx.Provider>
  );
}

export function useT() {
  const c = useContext(I18nCtx);
  if (!c) {
    return {
      lang: 'en' as Lang,
      setLang: () => {},
      toggle: () => {},
      t: ((k: Key) => (DICT.en as any)[k] ?? k) as Ctx['t'],
      tx: (_fr: string, en: string) => en,
    };
  }
  return { ...c, tx: (fr: string, en: string) => (c.lang === 'fr' ? fr : en) };
}

/** Module-level helper for non-React code paths (toasts, hooks). Reads the
 *  persisted language from localStorage so messages match the active locale. */
export function txStatic(fr: string, en: string): string {
  try {
    const v = localStorage.getItem(STORAGE);
    return v === 'en' ? en : fr;
  } catch {
    return fr;
  }
}

/**
 * Convenience hook that returns a deeply-typed translation tree
 * so screens can do `tr.queues.joined` instead of stringly-typed keys.
 * Falls back to the key itself when missing.
 */
export function useTr() {
  const { t, lang, setLang, toggle } = useT();
  const tr = useMemo(() => buildTree(t), [t, lang]);
  return { tr, t, lang, setLang, toggle };
}

function buildTree(t: (k: Key, v?: any) => string) {
  // Map dotted keys → nested object.
  const root: any = {};
  for (const k of Object.keys(DICT.en) as Key[]) {
    const parts = (k as string).split('.');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    Object.defineProperty(cur, leaf, { enumerable: true, get: () => t(k) });
  }
  return root as TrTree;
}

type TrTree = any;
