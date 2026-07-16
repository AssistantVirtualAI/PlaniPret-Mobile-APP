import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertTriangle, Globe, Home, Headphones } from 'lucide-react';
import { motion } from 'framer-motion';
import { AvaStatisticsLogo as AvaLogo } from '@/components/shared/AvaStatisticsLogo';
import { AnimatedFeatures } from '@/components/auth/AnimatedFeatures';
import { useTranslation } from '@/hooks/useTranslation';
import { useLanguage } from '@/context/LanguageContext';

export default function EndUserLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { language, toggleLanguage } = useLanguage();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err || !data.user) throw err || new Error('Invalid credentials');
      // Route through PostLoginRedirect so admins/super_admins land on the right portal
      navigate('/post-login', { replace: true });
    } catch (e: any) {
      setError(e?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-secondary/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        <Link to="/">
          <motion.button
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="absolute top-6 left-6 flex items-center gap-2 px-3 py-2 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 hover:border-primary/50 transition-all text-sm font-medium"
          >
            <Home className="h-4 w-4 text-primary" />
            <span>{t('auth.buttons.backToHome')}</span>
          </motion.button>
        </Link>

        <motion.button
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          onClick={toggleLanguage}
          className="absolute top-6 right-6 flex items-center gap-2 px-3 py-2 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 hover:border-primary/50 transition-all text-sm font-medium"
        >
          <Globe className="h-4 w-4 text-primary" />
          <span>{language === 'fr' ? 'EN' : 'FR'}</span>
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }} className="w-full max-w-md"
        >
          <Card className="bg-card/60 backdrop-blur-2xl border-border/30 shadow-2xl shadow-primary/5">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4">
                <AvaLogo size="lg" animated showText={false} className="[&_div:first-child]:w-24 [&_div:first-child]:h-24 [&_img]:w-24 [&_img]:h-24" />
              </div>
              <div className="flex items-center justify-center gap-2 mb-1">
                <Headphones className="h-5 w-5 text-primary" />
                <CardTitle className="text-2xl font-bold">
                  {language === 'fr' ? 'Portail Utilisateur' : 'End-User Portal'}
                </CardTitle>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">
                {language === 'fr'
                  ? 'Accédez à votre poste, vos appels et votre messagerie.'
                  : 'Access your extension, calls and voicemail.'}
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={submit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">{language === 'fr' ? 'Courriel' : 'Email'}</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@company.com" className="h-12 bg-muted/30 border-border/50 focus:border-primary focus:ring-primary/20"
                    required autoComplete="username" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('auth.labels.password')}</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" className="h-12 bg-muted/30 border-border/50 focus:border-primary focus:ring-primary/20"
                    required autoComplete="current-password" />
                </div>
                <Button type="submit" disabled={loading}
                  className="w-full h-12 bg-gradient-to-r from-primary via-purple-500 to-pink-500 hover:opacity-90 transition-all shadow-lg shadow-primary/30 font-semibold">
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('auth.buttons.login')}
                </Button>
              </form>

              <div className="mt-6 flex flex-col gap-2 text-center text-xs text-muted-foreground">
                <div className="flex items-center justify-center gap-3">
                  <Link to="/login" className="hover:text-primary transition-colors">
                    {language === 'fr' ? 'Admin' : 'Admin'}
                  </Link>
                  <span>·</span>
                  <Link to="/client/login" className="hover:text-primary transition-colors">
                    {language === 'fr' ? 'Client' : 'Client'}
                  </Link>
                  <span>·</span>
                  <Link to="/portals" className="hover:text-primary transition-colors">
                    {language === 'fr' ? 'Choisir le portail' : 'Choose portal'}
                  </Link>
                </div>
                <Link to="/download" className="hover:text-primary transition-colors">
                  {language === 'fr' ? 'Télécharger l’application softphone' : 'Download softphone app'}
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center relative z-10 bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5">
        <AnimatedFeatures />
      </div>
    </div>
  );
}
