import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { Navbar } from '@/components/landing/Navbar';
import { FooterSection } from '@/components/landing/FooterSection';
import { useTranslation } from '@/hooks/useTranslation';

const Terms = () => {
  const { language } = useTranslation();

  const content = language === 'fr' ? {
    title: 'Conditions d\'utilisation',
    subtitle: 'AVA Softphone — Application mobile et services',
    lastUpdated: 'Dernière mise à jour : juin 2026',
    sections: [
      { h: '1. Acceptation', p: 'En installant ou en utilisant AVA Softphone, vous acceptez ces conditions. Si vous n\'acceptez pas, n\'utilisez pas l\'application.' },
      { h: '2. Compte et accès', p: 'L\'accès à AVA Softphone est fourni par votre organisation (administrateur). Vous êtes responsable de la confidentialité de vos identifiants et de toute activité sur votre compte.' },
      { h: '3. Utilisation acceptable', p: 'Vous vous engagez à ne pas utiliser le service à des fins illégales, à ne pas tenter d\'accéder à des données d\'autres organisations, et à respecter les lois locales en matière de téléphonie et d\'enregistrement d\'appels.' },
      { h: '4. Enregistrement des appels', p: 'L\'enregistrement et la transcription d\'appels sont contrôlés par votre administrateur. Vous êtes responsable d\'obtenir tout consentement requis par la loi de votre juridiction.' },
      { h: '5. Disponibilité', p: 'Le service est fourni « tel quel ». Nous nous efforçons d\'assurer une disponibilité élevée mais ne garantissons pas un service sans interruption.' },
      { h: '6. Suppression de compte', p: 'Vous pouvez supprimer votre compte directement dans l\'app (Plus → Supprimer mon compte). La suppression est définitive et révoque immédiatement votre accès. Les enregistrements et données appartenant à votre organisation sont conservés selon la politique de votre administrateur.' },
      { h: '7. Limitation de responsabilité', p: 'Dans la mesure permise par la loi, notre responsabilité totale est limitée aux frais payés au cours des 12 derniers mois. Nous ne sommes pas responsables des dommages indirects.' },
      { h: '8. Modifications', p: 'Nous pouvons mettre à jour ces conditions. Les changements importants seront notifiés dans l\'app ou par courriel.' },
      { h: '9. Contact', p: 'Pour toute question : help@avastatistic.ca' },
    ],
  } : {
    title: 'Terms of Service',
    subtitle: 'AVA Softphone — Mobile app and services',
    lastUpdated: 'Last updated: June 2026',
    sections: [
      { h: '1. Acceptance', p: 'By installing or using AVA Softphone you agree to these terms. If you do not agree, do not use the app.' },
      { h: '2. Account & access', p: 'Access to AVA Softphone is provisioned by your organization (admin). You are responsible for keeping your credentials confidential and for all activity on your account.' },
      { h: '3. Acceptable use', p: 'You agree not to use the service for unlawful purposes, not to attempt to access other organizations\' data, and to comply with local telephony and call recording laws.' },
      { h: '4. Call recording', p: 'Call recording and transcription are controlled by your administrator. You are responsible for obtaining any consent required by the law of your jurisdiction.' },
      { h: '5. Availability', p: 'The service is provided "as is". We strive for high availability but do not guarantee uninterrupted service.' },
      { h: '6. Account deletion', p: 'You can delete your account directly inside the app (More → Delete my account). Deletion is permanent and immediately revokes access. Recordings and data owned by your organization are retained per your administrator\'s policy.' },
      { h: '7. Liability', p: 'To the maximum extent permitted by law, our aggregate liability is limited to the fees paid in the prior 12 months. We are not liable for indirect damages.' },
      { h: '8. Changes', p: 'We may update these terms. Material changes will be communicated in-app or by email.' },
      { h: '9. Contact', p: 'Questions: help@avastatistic.ca' },
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-3xl px-4 py-12">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold">{content.title}</h1>
          </div>
          <p className="text-muted-foreground">{content.subtitle}</p>
          <p className="text-xs text-muted-foreground mt-1">{content.lastUpdated}</p>
        </header>
        <div className="space-y-4">
          {content.sections.map((s) => (
            <Card key={s.h}>
              <CardHeader><CardTitle className="text-base">{s.h}</CardTitle></CardHeader>
              <CardContent><p className="text-sm leading-relaxed text-muted-foreground">{s.p}</p></CardContent>
            </Card>
          ))}
        </div>
      </main>
      <FooterSection />
    </div>
  );
};

export default Terms;
