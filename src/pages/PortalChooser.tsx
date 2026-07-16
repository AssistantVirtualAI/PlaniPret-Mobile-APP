import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Building2, Headphones, ArrowRight, Home, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
import { AvaStatisticsLogo as AvaLogo } from '@/components/shared/AvaStatisticsLogo';
import { useLanguage } from '@/context/LanguageContext';

const portals = (lang: 'fr' | 'en') => [
  {
    to: '/login',
    icon: Shield,
    title: lang === 'fr' ? 'Admin Lemtel' : 'Lemtel Admin',
    desc: lang === 'fr'
      ? 'Console plateforme, supervision, facturation, impersonation.'
      : 'Platform console, supervision, billing, impersonation.',
    cta: lang === 'fr' ? 'Connexion admin' : 'Admin sign-in',
    accent: 'from-primary to-purple-500',
  },
  {
    to: '/client/login',
    icon: Building2,
    title: lang === 'fr' ? 'Client / Entreprise' : 'Client / Business',
    desc: lang === 'fr'
      ? 'Gérez votre organisation, vos extensions, vos files et vos numéros.'
      : 'Manage your organization, extensions, queues and DIDs.',
    cta: lang === 'fr' ? 'Connexion client' : 'Client sign-in',
    accent: 'from-blue-500 to-cyan-500',
  },
  {
    to: '/end-user/login',
    icon: Headphones,
    title: lang === 'fr' ? 'Utilisateur / Poste' : 'End-user / Extension',
    desc: lang === 'fr'
      ? 'Accédez à votre poste, appels, messagerie vocale et SMS.'
      : 'Access your extension, calls, voicemail and SMS.',
    cta: lang === 'fr' ? 'Connexion utilisateur' : 'End-user sign-in',
    accent: 'from-pink-500 to-rose-500',
  },
];

export default function PortalChooser() {
  const { language, toggleLanguage } = useLanguage();
  const items = portals(language as 'fr' | 'en');

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-pink-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <Link to="/" className="absolute top-6 left-6 z-10">
        <button className="flex items-center gap-2 px-3 py-2 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 hover:border-primary/50 transition-all text-sm font-medium">
          <Home className="h-4 w-4 text-primary" />
          <span>{language === 'fr' ? 'Accueil' : 'Home'}</span>
        </button>
      </Link>

      <button
        onClick={toggleLanguage}
        className="absolute top-6 right-6 z-10 flex items-center gap-2 px-3 py-2 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 hover:border-primary/50 transition-all text-sm font-medium"
      >
        <Globe className="h-4 w-4 text-primary" />
        <span>{language === 'fr' ? 'EN' : 'FR'}</span>
      </button>

      <div className="relative z-10 container mx-auto px-6 py-20 max-w-6xl">
        <div className="text-center mb-12">
          <div className="mx-auto mb-6 flex justify-center">
            <AvaLogo size="lg" animated showText={false} className="[&_div:first-child]:w-20 [&_div:first-child]:h-20 [&_img]:w-20 [&_img]:h-20" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold mb-3">
            {language === 'fr' ? 'Choisissez votre portail' : 'Choose your portal'}
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {language === 'fr'
              ? 'Chaque type d’utilisateur a son propre accès. Sélectionnez celui qui correspond à votre rôle.'
              : 'Each user type has its own dedicated entry. Pick the one that matches your role.'}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {items.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.to}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
              >
                <Link to={p.to}>
                  <Card className="h-full bg-card/60 backdrop-blur-2xl border-border/30 hover:border-primary/50 transition-all shadow-xl shadow-primary/5 hover:shadow-primary/20 group">
                    <CardContent className="p-8 flex flex-col h-full">
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${p.accent} flex items-center justify-center mb-5 shadow-lg`}>
                        <Icon className="h-7 w-7 text-white" />
                      </div>
                      <h2 className="text-xl font-bold mb-2">{p.title}</h2>
                      <p className="text-sm text-muted-foreground flex-1">{p.desc}</p>
                      <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-primary group-hover:gap-3 transition-all">
                        <span>{p.cta}</span>
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-10">
          {language === 'fr'
            ? 'Les administrateurs Lemtel peuvent impersonifier n’importe quelle organisation cliente ou utilisateur final depuis la console plateforme.'
            : 'Lemtel administrators can impersonate any client organization or end-user from the platform console.'}
        </p>
      </div>
    </div>
  );
}
