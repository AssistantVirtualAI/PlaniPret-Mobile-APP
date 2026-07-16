import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePortal, PortalProvider } from '@/hooks/usePortalAuth';
import { supabase } from '@/integrations/supabase/client';
import { getPostLoginRoute } from '@/lib/postLoginRoute';
import { getSafeRedirect } from '@/lib/routes';
import { recordRedirect } from '@/lib/debug/navDebug';
import { Loader2, AlertTriangle, Globe, Home } from 'lucide-react';
import { motion } from 'framer-motion';
import { AvaStatisticsLogo as AvaLogo } from '@/components/shared/AvaStatisticsLogo';
import { AnimatedFeatures } from '@/components/auth/AnimatedFeatures';
import { useTranslation } from '@/hooks/useTranslation';
import { useLanguage } from '@/context/LanguageContext';

const UniversalLoginContent = () => {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const { loginUniversal } = usePortal();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { language, toggleLanguage } = useLanguage();

  // If a session already exists, route the user to the right dashboard immediately.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid || cancelled) return;
      const redirect = getSafeRedirect(location.search);
      if (redirect) {
        recordRedirect(`${location.pathname}${location.search}`, redirect, 'UniversalLogin.existingSession', 'safe redirect param');
        if (!cancelled) navigate(redirect, { replace: true });
        return;
      }
      const route = await getPostLoginRoute(uid);
      if (!cancelled) navigate(route, { replace: true });
    })();
    return () => { cancelled = true; };
  }, [navigate, location.pathname, location.search]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!loginId.trim() || !password.trim()) {
        setError(t('auth.errors.emptyFields'));
        return;
      }

      const trimmedLoginId = loginId.trim();
      const looksLikeEmail = trimmedLoginId.includes('@');

      // If it looks like an email, try admin auth first (avoids unnecessary 401 from client login)
      let adminAuthError: any = null;
      if (looksLikeEmail) {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: trimmedLoginId,
          password,
        });

        if (!authError && data.user) {
          const route = getSafeRedirect(location.search) ?? await getPostLoginRoute(data.user.id);
          recordRedirect(`${location.pathname}${location.search}`, route, 'UniversalLogin.submit', getSafeRedirect(location.search) ? 'safe redirect param' : 'post-login route');
          navigate(route);
          return;
        }
        adminAuthError = authError;
      }

      // Client / member universal login
      try {
        const portalSession = await loginUniversal(trimmedLoginId, password);
        navigate(`/${portalSession.agentSlug}/dashboard`);
      } catch (portalErr: any) {
        // If admin auth was attempted, surface the clearer "invalid credentials" message
        if (adminAuthError) {
          setError(t('auth.errors.invalidCredentials'));
          return;
        }
        throw portalErr;
      }
    } catch (err: any) {
      setError(err?.message || t('auth.errors.invalidCredentials'));
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-secondary/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-pink-500/5 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Left side - Login form */}
      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        {/* Back to home */}
        <Link to="/">
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-6 left-6 flex items-center gap-2 px-3 py-2 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 hover:border-primary/50 transition-all text-sm font-medium"
          >
            <Home className="h-4 w-4 text-primary" />
            <span>{t('auth.buttons.backToHome')}</span>
          </motion.button>
        </Link>

        {/* Language toggle */}
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={toggleLanguage}
          className="absolute top-6 right-6 flex items-center gap-2 px-3 py-2 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 hover:border-primary/50 transition-all text-sm font-medium"
        >
          <Globe className="h-4 w-4 text-primary" />
          <span>{language === 'fr' ? 'EN' : 'FR'}</span>
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Card className="bg-card/60 backdrop-blur-2xl border-border/30 shadow-2xl shadow-primary/5">
            <CardHeader className="text-center pb-2">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mx-auto mb-4"
              >
                <AvaLogo size="lg" animated showText={false} className="[&_div:first-child]:w-24 [&_div:first-child]:h-24 [&_img]:w-24 [&_img]:h-24" />
              </motion.div>
              <CardTitle className="text-2xl font-bold">
                {t('auth.portalLogin')}
              </CardTitle>
              <p className="text-muted-foreground mt-2">
                {t('auth.enterCredentials')}
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                  >
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="loginId">{t('auth.labels.identifier')}</Label>
                  <Input
                    id="loginId"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder={t('auth.placeholders.identifier')}
                    className="h-12 bg-muted/30 border-border/50 focus:border-primary focus:ring-primary/20"
                    required
                    autoComplete="username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">{t('auth.labels.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 bg-muted/30 border-border/50 focus:border-primary focus:ring-primary/20"
                    required
                    autoComplete="current-password"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="rememberMe"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                    />
                    <Label htmlFor="rememberMe" className="text-sm text-muted-foreground cursor-pointer">
                      {t('auth.rememberMe') || 'Se souvenir de moi (30 jours)'}
                    </Label>
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 bg-gradient-to-r from-primary via-purple-500 to-pink-500 hover:opacity-90 transition-all shadow-lg shadow-primary/30 font-semibold" 
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('auth.buttons.login')}
                </Button>
              </form>

              <div className="mt-6 flex flex-col gap-2 text-center">
                <Link 
                  to="/client/forgot-password" 
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {t('auth.buttons.forgotPassword')}
                </Link>
                <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground pt-2 border-t border-border/30">
                  <Link to="/client/login" className="hover:text-primary transition-colors">
                    {language === 'fr' ? 'Portail client' : 'Client portal'}
                  </Link>
                  <span>·</span>
                  <Link to="/end-user/login" className="hover:text-primary transition-colors">
                    {language === 'fr' ? 'Portail utilisateur' : 'End-user portal'}
                  </Link>
                  <span>·</span>
                  <Link to="/portals" className="hover:text-primary transition-colors">
                    {language === 'fr' ? 'Tous les portails' : 'All portals'}
                  </Link>
                </div>
              </div>

            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Right side - AnimatedFeatures */}
      <div className="hidden lg:flex flex-1 items-center justify-center relative z-10 bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5">
        <AnimatedFeatures />
      </div>
    </div>
  );
};

const UniversalLogin = () => (
  <PortalProvider>
    <UniversalLoginContent />
  </PortalProvider>
);

export default UniversalLogin;
