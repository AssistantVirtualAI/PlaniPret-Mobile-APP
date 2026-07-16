import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useClient } from '@/context/ClientContext';
import { Loader2, AlertTriangle, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
import { AvaLogo } from '@/components/shared/AvaLogo';
import { AnimatedFeatures } from '@/components/auth/AnimatedFeatures';
import { useTranslation } from '@/hooks/useTranslation';
import { useLanguage } from '@/context/LanguageContext';

const ClientLogin = () => {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isLoading } = useClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { language, toggleLanguage } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const session = await login(loginId, password);
      navigate(`/client/${session.clientId}/conversations`);
    } catch (err: any) {
      setError(err?.message || t('auth.errors.invalidCredentials'));
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
                <AvaLogo size="lg" animated />
              </motion.div>
              <CardTitle className="text-2xl font-bold">{t('auth.portalLogin')}</CardTitle>
              <p className="text-muted-foreground mt-2">{t('auth.enterCredentials')}</p>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
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

                <Button
                  type="submit"
                  className="w-full h-12 bg-gradient-to-r from-primary via-purple-500 to-pink-500 hover:opacity-90 transition-all shadow-lg shadow-primary/30 font-semibold"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('auth.buttons.login')}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link to="/client/forgot-password" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t('auth.buttons.forgotPassword')}
                </Link>
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

export default ClientLogin;

