import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, FileText, Shield, Scale } from "lucide-react";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/landing/Navbar";
import { FooterSection } from "@/components/landing/FooterSection";
import { useTranslation } from "@/hooks/useTranslation";

const Legal = () => {
  const { language } = useTranslation();

  const content = language === 'fr' ? {
    title: 'Mentions Légales',
    subtitle: "Informations légales et conditions d'utilisation",
    disclaimer: {
      title: 'Disclaimer',
      p1: "Cette application est une recréation fonctionnelle développée à des fins d'apprentissage et de démonstration. Elle s'inspire de concepts existants dans l'industrie des plateformes SaaS de gestion d'agents IA conversationnels.",
      p2: "Ce projet ne copie pas le code source d'autres applications et implémente toutes les fonctionnalités de manière indépendante et originale.",
      p3: 'Les logos, marques et éléments visuels utilisés sont soit originaux, soit proviennent de sources libres de droits.',
    },
    legal: {
      title: 'Informations Légales',
      editor: 'Éditeur',
      editorValue: 'AVA Statistics - Plateforme SaaS White-Label',
      hosting: 'Hébergement',
      hostingValue: 'Application hébergée sur Lovable Cloud',
      hostingRegion: "Données hébergées dans l'Union Européenne",
      contact: 'Contact',
      contactEmail: 'Email : support@avastatistics.com',
    },
    terms: {
      title: "Conditions Générales d'Utilisation",
      s1: { title: '1. Objet', body: "Les présentes conditions générales régissent l'utilisation de la plateforme AVA Statistics, destinée à la gestion d'agents IA conversationnels." },
      s2: { title: '2. Accès au service', body: "L'accès à la plateforme nécessite la création d'un compte utilisateur. L'utilisateur s'engage à fournir des informations exactes et à maintenir la confidentialité de ses identifiants." },
      s3: { title: '3. Propriété intellectuelle', body: "L'ensemble des éléments de la plateforme (code, design, contenu) sont protégés par le droit d'auteur. Toute reproduction non autorisée est interdite." },
      s4: { title: '4. Responsabilités', body: "L'utilisateur est responsable de l'utilisation qu'il fait de la plateforme et des contenus qu'il génère via les agents IA." },
      s5: { title: '5. Données personnelles', body: 'Le traitement des données personnelles est conforme au RGPD. Consultez notre', link: 'Politique de Confidentialité', suffix: "pour plus d'informations." },
    },
    dataProtection: {
      title: 'Protection des Données',
      intro: 'Nous prenons la protection de vos données très au sérieux. Notre plateforme est conforme aux réglementations RGPD et peut être configurée pour la conformité HIPAA (add-on).',
      items: [
        { title: 'Chiffrement au repos', value: 'AES-256' },
        { title: 'Chiffrement en transit', value: 'TLS 1.3 via HTTPS' },
        { title: "Logs d'audit", value: 'Traçabilité complète (HIPAA)' },
        { title: "Droit à l'oubli", value: 'Suppression sur demande' },
      ],
      footer: 'Pour exercer vos droits (accès, rectification, suppression), contactez-nous à',
    },
  } : {
    title: 'Legal Notice',
    subtitle: 'Legal information and terms of use',
    disclaimer: {
      title: 'Disclaimer',
      p1: 'This application is a functional recreation developed for learning and demonstration purposes. It draws inspiration from existing concepts in the SaaS industry for AI conversational agent management platforms.',
      p2: 'This project does not copy the source code of other applications and implements all features independently and originally.',
      p3: 'Logos, brands and visual elements used are either original or come from royalty-free sources.',
    },
    legal: {
      title: 'Legal Information',
      editor: 'Publisher',
      editorValue: 'AVA Statistics - White-Label SaaS Platform',
      hosting: 'Hosting',
      hostingValue: 'Application hosted on Lovable Cloud',
      hostingRegion: 'Data hosted in the European Union',
      contact: 'Contact',
      contactEmail: 'Email: support@avastatistics.com',
    },
    terms: {
      title: 'Terms of Service',
      s1: { title: '1. Purpose', body: 'These general terms govern the use of the AVA Statistics platform, intended for managing AI conversational agents.' },
      s2: { title: '2. Access to service', body: 'Access to the platform requires creating a user account. The user agrees to provide accurate information and maintain the confidentiality of their credentials.' },
      s3: { title: '3. Intellectual property', body: 'All platform elements (code, design, content) are protected by copyright. Any unauthorized reproduction is prohibited.' },
      s4: { title: '4. Responsibilities', body: 'The user is responsible for how they use the platform and the content generated through AI agents.' },
      s5: { title: '5. Personal data', body: 'Personal data processing complies with GDPR. See our', link: 'Privacy Policy', suffix: 'for more information.' },
    },
    dataProtection: {
      title: 'Data Protection',
      intro: 'We take the protection of your data very seriously. Our platform is GDPR compliant and can be configured for HIPAA compliance (add-on).',
      items: [
        { title: 'Encryption at rest', value: 'AES-256' },
        { title: 'Encryption in transit', value: 'TLS 1.3 via HTTPS' },
        { title: 'Audit logs', value: 'Complete traceability (HIPAA)' },
        { title: 'Right to be forgotten', value: 'Deletion on request' },
      ],
      footer: 'To exercise your rights (access, rectification, deletion), contact us at',
    },
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <Navbar />
      <main className="pt-24">
        <div className="container mx-auto px-6 py-8 max-w-4xl space-y-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-3">{content.title}</h1>
            <p className="text-muted-foreground text-lg">{content.subtitle}</p>
          </div>

          {/* Disclaimer */}
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
                <CardTitle className="text-amber-500">{content.disclaimer.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <p><strong>{content.disclaimer.p1}</strong></p>
              <p><strong>{content.disclaimer.p2}</strong></p>
              <p>{content.disclaimer.p3}</p>
            </CardContent>
          </Card>

          {/* Legal Info */}
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-primary" />
                <CardTitle>{content.legal.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <div>
                <h4 className="font-semibold text-foreground mb-2">{content.legal.editor}</h4>
                <p>{content.legal.editorValue}</p>
                <p>{content.legal.hostingValue}</p>
              </div>
              <Separator />
              <div>
                <h4 className="font-semibold text-foreground mb-2">{content.legal.hosting}</h4>
                <p>Lovable Cloud</p>
                <p>{content.legal.hostingRegion}</p>
              </div>
              <Separator />
              <div>
                <h4 className="font-semibold text-foreground mb-2">{content.legal.contact}</h4>
                <p>{content.legal.contactEmail}</p>
              </div>
            </CardContent>
          </Card>

          {/* Terms */}
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Scale className="w-6 h-6 text-primary" />
                <CardTitle>{content.terms.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              {([content.terms.s1, content.terms.s2, content.terms.s3, content.terms.s4] as Array<{title: string; body: string}>).map((s) => (
                <div key={s.title}>
                  <h4 className="font-semibold text-foreground mb-2">{s.title}</h4>
                  <p>{s.body}</p>
                </div>
              ))}
              <div>
                <h4 className="font-semibold text-foreground mb-2">{content.terms.s5.title}</h4>
                <p>
                  {content.terms.s5.body}{" "}
                  <Link to="/privacy" className="text-primary hover:underline">
                    {content.terms.s5.link}
                  </Link>{" "}
                  {content.terms.s5.suffix}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Protection */}
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-primary" />
                <CardTitle>{content.dataProtection.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <p>{content.dataProtection.intro}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {content.dataProtection.items.map((item) => (
                  <div key={item.title} className="p-4 rounded-lg bg-muted/50 border border-border/50">
                    <h5 className="font-semibold text-foreground mb-1">{item.title}</h5>
                    <p className="text-sm">{item.value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4">
                {content.dataProtection.footer}{" "}
                <span className="text-primary">privacy@avastatistics.com</span>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
      <FooterSection />
    </div>
  );
};

export default Legal;
