import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Mail, Globe, Calendar, Phone, Mic, MessageSquare, User, Clock, Download, Trash2 } from 'lucide-react';
import { Navbar } from '@/components/landing/Navbar';
import { FooterSection } from '@/components/landing/FooterSection';
import { useTranslation } from '@/hooks/useTranslation';

const PrivacyPolicy = () => {
  const { t, language } = useTranslation();

  const content = language === 'fr' ? {
    title: 'Politique de Confidentialité',
    subtitle: 'Lemtel Telecom – Application Téléphonique IA',
    lastUpdated: 'Dernière mise à jour : juin 2026',
    sections: [
      {
        title: '1. Données collectées',
        body: 'Lemtel Telecom collecte les catégories de données suivantes pour fournir ses services de téléphonie intelligente :',
        items: [
          'Informations de compte : nom, adresse courriel, numéro de téléphone professionnel',
          'Communications vocales : métadonnées des appels (durée, numéros, horodatage)',
          'SMS : contenu des messages texte envoyés et reçus via la plateforme',
          'Enregistrements d\'appels : conversations téléphoniques enregistrées avec consentement',
          'Transcriptions IA : textes générés automatiquement à partir des appels',
          'Contacts téléphoniques : liste de contacts synchronisée (avec autorisation explicite)',
          'Données techniques : identifiant d\'appareil, journaux de connexion, statut de présence',
        ],
      },
      {
        title: '2. Utilisation des données',
        body: 'Vos données sont utilisées exclusivement dans les finalités suivantes :',
        items: [
          'Fournir les services de téléphonie VoIP et de messagerie SMS',
          'Permettre l\'analyse IA des conversations (sentiment, sujets, qualité)',
          'Générer des rapports d\'appels et des statistiques pour votre organisation',
          'Activer le routage intelligent des appels et la messagerie vocale',
          'Assurer la conformité réglementaire (enregistrements légaux, conservation)',
          'Envoyer des notifications push pour les appels entrants et messages',
        ],
      },
      {
        title: '3. Conservation des données',
        body: 'Lemtel Telecom applique une politique de rétention stricte :',
        items: [
          'Enregistrements d\'appels : conservés 90 jours, sauf obligation légale contraire',
          'Transcriptions IA : conservées 90 jours, puis pseudonymisées ou supprimées',
          'Métadonnées d\'appels (CDR) : conservées 12 mois pour facturation et conformité',
          'Messages SMS : conservés 24 mois, sauf suppression anticipée par l\'utilisateur',
          'Messages vocaux : conservés jusqu\'à suppression manuelle ou expiration de 30 jours',
          'Données de compte : conservées tant que le compte est actif, puis 30 jours après résiliation',
        ],
      },
      {
        title: '4. Vos droits',
        body: 'Conformément au RGPD et aux lois applicables, vous disposez des droits suivants :',
        items: [
          'Droit d\'accès : consulter l\'ensemble des données vous concernant',
          'Droit de rectification : corriger vos informations inexactes',
          'Droit à l\'effacement : demander la suppression de votre compte et de vos données',
          'Droit à la portabilité : exporter vos données (CDR, contacts, enregistrements)',
          'Droit d\'opposition : refuser l\'analyse IA de vos conversations',
          'Droit de limitation : restreindre temporairement le traitement de vos données',
        ],
        footer: 'Pour exercer vos droits, envoyez une demande à privacy@lemtel.ca ou utilisez les paramètres de l\'application.',
      },
      {
        title: '5. Sécurité',
        body: 'Nous mettons en œuvre des mesures de sécurité rigoureuses :',
        items: [
          'Chiffrement des appels et des données en transit (TLS 1.3 / SRTP)',
          'Chiffrement des données au repos (AES-256)',
          'Authentification sécurisée avec JWT et 2FA disponible',
          'Journaux d\'audit complets pour traçabilité',
          'Hébergement dans des centres de données certifiés ISO 27001',
        ],
      },
      {
        title: '6. Extension Chrome Lemtel Telecom',
        body: 'L\'extension Chrome Lemtel Telecom aide les utilisateurs à détecter les numéros de téléphone sur les pages web et à initier des actions de click-to-dial via les services télécom Lemtel/AVA autorisés.',
        items: [
          'L\'extension ne vend aucune donnée d\'utilisateur',
          'L\'extension ne collecte pas l\'historique de navigation',
          'L\'extension n\'utilise aucun code distant — tout le code exécutable est intégré dans l\'extension',
          'L\'extension peut traiter localement le texte visible des pages web dans le navigateur afin de détecter les numéros de téléphone et d\'activer la fonctionnalité de click-to-dial',
          'L\'extension peut stocker des paramètres limités dans le navigateur (préférences utilisateur, configuration de numérotation, paramètres de session nécessaires au fonctionnement)',
          'Lorsqu\'un utilisateur lance un appel, l\'extension peut communiquer avec les services télécom Lemtel/AVA autorisés afin d\'initier l\'action d\'appel demandée. Les données transmises sont limitées à ce qui est nécessaire pour fournir le service télécom',
        ],
        footer: 'Pour toute question relative à l\'extension, contactez privacy@lemtel.ca.',
      },
      {
        title: '7. Contact',
        body: 'Pour toute question relative à cette politique ou à vos données personnelles :',
      },
    ],
  } : {
    title: 'Privacy Policy',
    subtitle: 'Lemtel Telecom – AI Phone Application',
    lastUpdated: 'Last updated: June 2026',
    sections: [
      {
        title: '1. Data Collected',
        body: 'Lemtel Telecom collects the following categories of data to provide its intelligent telephony services:',
        items: [
          'Account information: name, email address, business phone number',
          'Voice communications: call metadata (duration, numbers, timestamps)',
          'SMS: content of text messages sent and received via the platform',
          'Call recordings: telephone conversations recorded with consent',
          'AI transcripts: text automatically generated from calls',
          'Phone contacts: synchronized contact list (with explicit permission)',
          'Technical data: device identifier, connection logs, presence status',
        ],
      },
      {
        title: '2. How Data Is Used',
        body: 'Your data is used exclusively for the following purposes:',
        items: [
          'Provide VoIP telephony and SMS messaging services',
          'Enable AI analysis of conversations (sentiment, topics, quality)',
          'Generate call reports and statistics for your organization',
          'Enable intelligent call routing and voicemail',
          'Ensure regulatory compliance (legal recordings, retention)',
          'Send push notifications for incoming calls and messages',
        ],
      },
      {
        title: '3. Data Retention',
        body: 'Lemtel Telecom applies a strict retention policy:',
        items: [
          'Call recordings: retained for 90 days, unless a longer legal obligation applies',
          'AI transcripts: retained for 90 days, then pseudonymized or deleted',
          'Call detail records (CDR): retained for 12 months for billing and compliance',
          'SMS messages: retained for 24 months, unless earlier deleted by the user',
          'Voicemail messages: retained until manual deletion or 30-day expiration',
          'Account data: retained while the account is active, then 30 days after termination',
        ],
      },
      {
        title: '4. User Rights',
        body: 'In accordance with GDPR and applicable laws, you have the following rights:',
        items: [
          'Right of access: view all data concerning you',
          'Right to rectification: correct your inaccurate information',
          'Right to erasure: request deletion of your account and data',
          'Right to portability: export your data (CDR, contacts, recordings)',
          'Right to object: refuse AI analysis of your conversations',
          'Right to restriction: temporarily restrict processing of your data',
        ],
        footer: 'To exercise your rights, send a request to privacy@lemtel.ca or use the application settings.',
      },
      {
        title: '5. Security',
        body: 'We implement rigorous security measures:',
        items: [
          'Encryption of calls and data in transit (TLS 1.3 / SRTP)',
          'Encryption of data at rest (AES-256)',
          'Secure authentication with JWT and 2FA available',
          'Complete audit logs for traceability',
          'Hosting in ISO 27001 certified data centers',
        ],
      },
      {
        title: '6. Lemtel Telecom Chrome Extension',
        body: 'The Lemtel Telecom Chrome Extension helps users detect phone numbers on webpages and initiate click-to-dial actions through authorized Lemtel/AVA telecom services.',
        items: [
          'The extension does not sell user data',
          'The extension does not collect browsing history',
          'The extension does not use remote code — all executable code is packaged inside the extension',
          'The extension may process visible webpage text locally in the browser to detect phone numbers and enable click-to-dial functionality',
          'The extension may store limited settings in the browser, such as user preferences, dialing configuration, and session-related settings required to operate the extension',
          'When a user starts a call, the extension may communicate with authorized Lemtel/AVA telecom services to initiate the requested calling action. Data transmitted is limited to what is necessary to provide the telecom service',
        ],
        footer: 'For questions about the extension, contact privacy@lemtel.ca.',
      },
      {
        title: '7. Contact',
        body: 'For any questions regarding this policy or your personal data:',
      },
    ],
  };

  const iconMap: Record<string, React.ReactNode> = {
    '1. Données collectées': <Phone className="w-6 h-6 text-primary" />,
    '1. Data Collected': <Phone className="w-6 h-6 text-primary" />,
    '2. Utilisation des données': <Mic className="w-6 h-6 text-primary" />,
    '2. How Data Is Used': <Mic className="w-6 h-6 text-primary" />,
    '3. Conservation des données': <Clock className="w-6 h-6 text-primary" />,
    '3. Data Retention': <Clock className="w-6 h-6 text-primary" />,
    '4. Vos droits': <User className="w-6 h-6 text-primary" />,
    '4. User Rights': <User className="w-6 h-6 text-primary" />,
    '5. Sécurité': <Shield className="w-6 h-6 text-primary" />,
    '5. Security': <Shield className="w-6 h-6 text-primary" />,
    '6. Extension Chrome Lemtel Telecom': <Globe className="w-6 h-6 text-primary" />,
    '6. Lemtel Telecom Chrome Extension': <Globe className="w-6 h-6 text-primary" />,
    '6. Contact': <Mail className="w-6 h-6 text-primary" />,
    '7. Contact': <Mail className="w-6 h-6 text-primary" />,
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <Navbar />
      <main className="pt-24 pb-12 px-4">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-2">{content.title}</h1>
            <p className="text-muted-foreground text-lg mb-2">{content.subtitle}</p>
            <p className="text-muted-foreground flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4" />
              {content.lastUpdated}
            </p>
          </div>

          {content.sections.map((section, idx) => (
            <Card key={idx}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  {iconMap[section.title] || <Shield className="w-6 h-6 text-primary" />}
                  <CardTitle>{section.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>{section.body}</p>
                {section.items && (
                  <ul>
                    {section.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
                {'footer' in section && section.footer && <p>{section.footer}</p>}
                {idx === content.sections.length - 1 && (
                  <div className="flex flex-col gap-3 mt-4">
                    <a href="mailto:privacy@lemtel.ca" className="flex items-center gap-2 text-primary hover:underline">
                      <Mail className="w-4 h-4" />
                      privacy@lemtel.ca
                    </a>
                    <a href="https://lemtel.ca" className="flex items-center gap-2 text-primary hover:underline">
                      <Globe className="w-4 h-4" />
                      www.lemtel.ca
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <FooterSection />
    </div>
  );
};

export default PrivacyPolicy;
