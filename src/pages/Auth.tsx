import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Mail, Lock, User, ArrowLeft, Chrome, Globe, Home } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
// Heavy pieces are lazy-loaded so the critical login bundle stays small.
const AnimatedFeatures = lazy(() => import('@/components/auth/AnimatedFeatures').then((m) => ({ default: m.AnimatedFeatures })));
const Dialog = lazy(() => import('@/components/ui/dialog').then((m) => ({ default: m.Dialog })));
const DialogContent = lazy(() => import('@/components/ui/dialog').then((m) => ({ default: m.DialogContent })));
const DialogHeader = lazy(() => import('@/components/ui/dialog').then((m) => ({ default: m.DialogHeader })));
const DialogTitle = lazy(() => import('@/components/ui/dialog').then((m) => ({ default: m.DialogTitle })));
const DialogDescription = lazy(() => import('@/components/ui/dialog').then((m) => ({ default: m.DialogDescription })));
import { useTranslation } from '@/hooks/useTranslation';
import { useLanguage } from '@/context/LanguageContext';
import { checkProviderEnabled, type ProviderStatus } from '@/lib/authProviders';

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

const AuthPage = () => {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotDialog, setShowForgotDialog] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [msStatus, setMsStatus] = useState<ProviderStatus>("unknown");
  const [googleStatus, setGoogleStatus] = useState<ProviderStatus>("unknown");

  // Probe OAuth providers so we only render buttons that will actually work.
  useEffect(() => {
    let cancelled = false;
    checkProviderEnabled("azure").then((s) => { if (!cancelled) setMsStatus(s); });
    checkProviderEnabled("google").then((s) => { if (!cancelled) setGoogleStatus(s); });
    return () => { cancelled = true; };
  }, []);
  
  const { signIn, signUp, signInWithGoogle, signInWithMicrosoft, signInWithApple, resetPassword, updatePassword, user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { language, toggleLanguage } = useLanguage();

  useEffect(() => {
    if (user && mode !== 'reset') {
      navigate('/post-login');
    }
  }, [user, navigate, mode]);

  useEffect(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'reset') {
      setMode('reset');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (!error) {
          navigate('/post-login');
        }
      } else if (mode === 'signup') {
        const { error } = await signUp(email, password, fullName);
        if (!error) {
          setMode('login');
        }
      } else if (mode === 'reset') {
        if (password !== confirmPassword) {
          return;
        }
        const { error } = await updatePassword(password);
        if (!error) {
          navigate('/post-login');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await resetPassword(forgotEmail);
      if (!error) {
        setShowForgotDialog(false);
        setForgotEmail('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setLoading(true);
    try {
      await signInWithMicrosoft();
    } finally {
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setLoading(true);
    try {
      await signInWithApple();
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'login': return t('auth.login');
      case 'signup': return t('auth.signup');
      case 'reset': return t('auth.resetPassword');
      default: return 'AVA Statistics';
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'login': return t('auth.description.login');
      case 'signup': return t('auth.description.signup');
      case 'reset': return t('auth.description.reset');
      default: return '';
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <motion.div 
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full lg:w-[45%] flex items-center justify-center p-8 bg-background relative"
      >
        {/* Language toggle */}
        <motion.button
          onClick={toggleLanguage}
          className="absolute top-6 right-6 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-sm font-medium text-muted-foreground hover:text-foreground"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Globe className="w-4 h-4" />
          <span>{language === 'fr' ? 'EN' : 'FR'}</span>
        </motion.button>

        {/* Back to landing */}
        <Link to="/">
          <motion.button
            className="absolute top-6 left-6 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-sm font-medium text-muted-foreground hover:text-foreground"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Home className="w-4 h-4" />
            <span>{t('auth.buttons.backToHome') || 'Accueil'}</span>
          </motion.button>
        </Link>

        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-3 mb-8">
              <motion.div
                whileHover={{ rotate: 6, scale: 1.06 }}
                className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl shadow-primary/30 ring-1 ring-white/20"
              >
                <img src="/ava-logo.png" alt="AVA Statistics" className="w-full h-full object-cover" />
              </motion.div>
              <div className="flex flex-col items-start leading-tight">
                <span className="text-2xl font-bold">AVA Statistics</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Powered by AVA AI</span>
              </div>
            </div>
            <h1 className="text-3xl font-bold mb-2">{getTitle()}</h1>
            <p className="text-muted-foreground">{getDescription()}</p>
          </motion.div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            {/* Google OAuth Button */}
            {(mode === 'login' || mode === 'signup') && (
              <>
                {googleStatus !== "disabled" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-12 gap-3 bg-card hover:bg-muted border-border"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                  >
                    <Chrome className="w-5 h-5" />
                    {t('auth.buttons.continueWithGoogle')}
                  </Button>
                )}

                {msStatus === "enabled" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-12 gap-3 bg-card hover:bg-muted border-border"
                    onClick={handleMicrosoftLogin}
                    disabled={loading}
                  >
                    <svg width="20" height="20" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                      <rect x="12" y="1" width="10" height="10" fill="#7FBA00"/>
                      <rect x="1" y="12" width="10" height="10" fill="#00A4EF"/>
                      <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
                    </svg>
                    {t('auth.buttons.continueWithMicrosoft') || 'Continuer avec Microsoft 365 (SSO)'}
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 gap-3 bg-card hover:bg-muted border-border"
                  onClick={handleAppleLogin}
                  disabled={loading}
                >
                  <svg width="20" height="20" viewBox="0 0 170 170" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.197-2.12-9.973-3.17-14.34-3.17-4.58 0-9.492 1.05-14.746 3.17-5.262 2.13-9.501 3.24-12.742 3.35-4.929.21-9.842-1.96-14.746-6.52-3.13-2.73-7.045-7.41-11.735-14.04-5.032-7.08-9.169-15.29-12.41-24.63-3.471-10.11-5.211-19.9-5.211-29.378 0-10.857 2.346-20.221 7.045-28.1 4.693-7.88 10.987-13.547 18.874-17.003 5.986-2.714 12.517-4.1 19.594-4.17 3.518 0 8.131.994 13.85 2.978 5.736 1.979 9.468 2.979 11.197 2.979 1.324 0 5.738-.925 13.235-2.775 7.09-1.715 13.1-2.468 18.035-2.27 15.694.633 26.907 9.369 33.62 9.369-9.57 5.82-14.337 13.86-14.301 24.102 0 8.208 3.006 15.012 9.024 20.4 2.693 2.55 5.705 4.526 9.043 5.928-2.24 6.538-4.688 12.803-7.333 18.79zm-38.598-110.24c0 8.102-2.968 15.672-8.898 22.692-7.188 9.1-15.893 14.366-25.355 13.518-.12-1.002-.188-2.06-.188-3.177 0-7.77 3.379-16.048 9.393-23.833 3.004-3.476 6.82-6.35 11.45-8.62 4.619-2.243 8.985-3.414 13.095-3.517.13 1.078.169 2.152.169 3.244 0 .59-.01 1.186-.029 1.785l.363-.088z" fill="currentColor"/>
                  </svg>
                  Continue with Apple
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">{t('common.or')}</span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-2"
                >
                  <Label htmlFor="fullName" className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    {t('auth.labels.fullName')}
                  </Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder={t('auth.placeholders.fullName')}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="h-12 bg-card border-border focus:border-primary focus:ring-primary"
                  />
                </motion.div>
              )}

              {mode !== 'reset' && (
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    {t('auth.labels.email')}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('auth.placeholders.email')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 bg-card border-border focus:border-primary focus:ring-primary"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  {mode === 'reset' ? t('auth.labels.newPassword') : t('auth.labels.password')}
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t('auth.placeholders.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-12 bg-card border-border focus:border-primary focus:ring-primary"
                />
              </div>

              {mode === 'reset' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-2"
                >
                  <Label htmlFor="confirmPassword" className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    {t('auth.labels.confirmPassword')}
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder={t('auth.placeholders.password')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-12 bg-card border-border focus:border-primary focus:ring-primary"
                  />
                  {password !== confirmPassword && confirmPassword && (
                    <p className="text-sm text-destructive">{t('auth.errors.passwordMismatch')}</p>
                  )}
                </motion.div>
              )}

              {mode === 'login' && (
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
                  <Button
                    type="button"
                    variant="link"
                    className="text-sm text-muted-foreground hover:text-primary p-0 h-auto"
                    onClick={() => setShowForgotDialog(true)}
                  >
                    {t('auth.buttons.forgotPassword')}
                  </Button>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white shadow-lg shadow-primary/25"
                disabled={loading || (mode === 'reset' && password !== confirmPassword)}
              >
                {loading ? t('auth.buttons.loading') : 
                  mode === 'login' ? t('auth.buttons.login') : 
                  mode === 'signup' ? t('auth.buttons.signup') :
                  t('auth.buttons.updatePassword')}
              </Button>

              {mode !== 'reset' && (
                <div className="text-center">
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                    className="text-primary hover:text-primary/80"
                  >
                    {mode === 'login' ? t('auth.buttons.noAccount') : t('auth.buttons.hasAccount')}
                  </Button>
                </div>
              )}

              {mode === 'reset' && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setMode('login');
                    navigate('/auth');
                  }}
                  className="w-full gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('auth.buttons.backToLogin')}
                </Button>
              )}
            </form>
          </motion.div>

          {/* Footer links */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center text-sm text-muted-foreground"
          >
            <p>
              {t('auth.legal.prefix')}{' '}
              <a href="/legal" className="text-primary hover:underline">{t('auth.legal.terms')}</a>
              {' '}{t('auth.legal.and')}{' '}
              <a href="/privacy" className="text-primary hover:underline">{t('auth.legal.privacy')}</a>
            </p>
          </motion.div>
        </div>
      </motion.div>

      {/* Right side - Animated Features (lazy) */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="hidden lg:block w-[55%] bg-gradient-to-br from-primary/90 via-secondary/90 to-accent/90 relative overflow-hidden"
      >
        <Suspense fallback={<div className="w-full h-full" />}>
          <AnimatedFeatures />
        </Suspense>
      </motion.div>

      {/* Forgot Password Dialog — lazy so it doesn't ship in the initial auth bundle */}
      {showForgotDialog && (
        <Suspense fallback={null}>
          <Dialog open={showForgotDialog} onOpenChange={setShowForgotDialog}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t('auth.forgotDialog.title')}</DialogTitle>
                <DialogDescription>
                  {t('auth.forgotDialog.description')}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgotEmail">{t('auth.labels.email')}</Label>
                  <Input
                    id="forgotEmail"
                    type="email"
                    placeholder={t('auth.placeholders.email')}
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    className="bg-card"
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForgotDialog(false)}
                  >
                    {t('auth.buttons.cancel')}
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? t('auth.buttons.sending') : t('auth.buttons.sendLink')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </Suspense>
      )}
    </div>
  );
};

export default AuthPage;
