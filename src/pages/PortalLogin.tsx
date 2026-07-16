import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePortal, PortalProvider } from '@/hooks/usePortalAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Bot, AlertTriangle, MessageSquare, BarChart3, BookOpen, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { AvaLogo } from '@/components/shared/AvaLogo';
import { AvaStatisticsLogo } from '@/components/shared/AvaStatisticsLogo';

const PortalLoginContent = () => {
  const { agentSlug } = useParams<{ agentSlug: string }>();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [agentInfo, setAgentInfo] = useState<{ name: string; avatar_url?: string } | null>(null);
  const [orgBranding, setOrgBranding] = useState<{ logo_url?: string | null; name?: string | null } | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [checkingSuperAdmin, setCheckingSuperAdmin] = useState(true);
  const { login, isLoading, isAuthenticated, session, isSuperAdmin, isSuperAdminChecked, loginAsSuperAdmin, loginAsOrgAdmin, supabaseUser } = usePortal();
  const navigate = useNavigate();
  const autoLoginAttempted = useRef(false);

  // Guard against placeholder routes like /portal/:agentSlug
  useEffect(() => {
    if (agentSlug === ':agentSlug') {
      navigate('/login', { replace: true });
    }
  }, [agentSlug, navigate]);

  // Check for super admin / org admin auto-login first
  // Wait for isSuperAdminChecked to avoid race condition
  useEffect(() => {
    const checkSuperAdminAccess = async () => {
      if (!agentSlug || agentSlug === ':agentSlug') {
        setCheckingSuperAdmin(false);
        return;
      }

      // Wait for auth to be checked (undefined means still loading)
      if (supabaseUser === undefined) {
        return;
      }

      // If no authenticated main user, they need to login manually
      if (supabaseUser === null) {
        setCheckingSuperAdmin(false);
        return;
      }

      // Wait for super admin check to complete before making decisions
      if (!isSuperAdminChecked) {
        return;
      }

      // Prevent concurrent/duplicate auto-login attempts
      if (autoLoginAttempted.current) {
        return;
      }
      autoLoginAttempted.current = true;

      console.log('[PortalLogin] Admin access check ready', {
        isSuperAdmin: isSuperAdmin(),
        isSuperAdminChecked,
        userId: supabaseUser?.id,
      });

      // 1) Super admin shortcut
      if (isSuperAdmin()) {
        console.log('[PortalLogin] Super admin detected, auto-logging in...');
        const superAdminSession = await loginAsSuperAdmin(agentSlug);

        if (superAdminSession) {
          const isLegacyRoute = window.location.pathname.startsWith('/portal/');
          const canonical = superAdminSession.agentSlug;
          navigate(isLegacyRoute ? `/portal/${canonical}/dashboard` : `/${canonical}/dashboard`);
          return;
        }
        console.warn('[PortalLogin] loginAsSuperAdmin returned null, trying org admin...');
      }

      // 2) Org admin shortcut (logged-in admin in main portal)
      const adminSession = await loginAsOrgAdmin(agentSlug);

      if (adminSession) {
        const isLegacyRoute = window.location.pathname.startsWith('/portal/');
        const canonical = adminSession.agentSlug;
        navigate(isLegacyRoute ? `/portal/${canonical}/dashboard` : `/${canonical}/dashboard`);
        return;
      }

      console.log('[PortalLogin] No admin auto-login possible, showing login form');
      setCheckingSuperAdmin(false);
    };

    checkSuperAdminAccess();
  }, [agentSlug, isSuperAdmin, isSuperAdminChecked, loginAsSuperAdmin, loginAsOrgAdmin, supabaseUser, navigate]);

  useEffect(() => {
    const loadAgent = async () => {
      if (!agentSlug || agentSlug === ':agentSlug') return;
      
       const { data, error } = await supabase
         .from('agents_safe')
         .select('name, avatar_url, organization_id')
         .eq('slug', agentSlug)
         .maybeSingle();

      if (error) {
        console.error('Error loading agent:', error);
        setError('Erreur lors du chargement de l\'agent');
      } else if (!data) {
        navigate('/login', { replace: true });
        return;
      } else {
        setAgentInfo(data);
        if (data.organization_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('name, client_portal_logo_url, logo_login_url, logo_url')
            .eq('id', data.organization_id)
            .maybeSingle();
          if (org) {
            setOrgBranding({
              name: org.name,
              logo_url: org.client_portal_logo_url || org.logo_login_url || org.logo_url || null,
            });
          }
        }
      }
      setLoadingAgent(false);
    };

    loadAgent();
  }, [agentSlug]);

  useEffect(() => {
    if (isAuthenticated && session?.agentSlug === agentSlug) {
      const isLegacyRoute = window.location.pathname.startsWith('/portal/');
      navigate(isLegacyRoute ? `/portal/${agentSlug}/dashboard` : `/${agentSlug}/dashboard`);
    }
  }, [isAuthenticated, session, agentSlug, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!agentSlug) {
      setError('Agent non spécifié');
      return;
    }

    try {
      const portalSession = await login(agentSlug, loginId, password);
      const isLegacyRoute = window.location.pathname.startsWith('/portal/');
      const canonical = portalSession.agentSlug;
      navigate(isLegacyRoute ? `/portal/${canonical}/dashboard` : `/${canonical}/dashboard`);
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    }
  };

  if (loadingAgent || checkingSuperAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="h-8 w-8 text-primary" />
        </motion.div>
        {checkingSuperAdmin && supabaseUser && (
          <p className="text-sm text-muted-foreground animate-pulse">
            Connexion super admin en cours...
          </p>
        )}
      </div>
    );
  }

  const features = [
    { icon: MessageSquare, title: 'Conversations', desc: 'Historique complet des échanges' },
    { icon: BarChart3, title: 'Analytics', desc: 'Métriques et tendances en temps réel' },
    { icon: BookOpen, title: 'Knowledge Base', desc: 'Gérez le contenu de votre agent' },
    { icon: Zap, title: 'Performance', desc: 'Scores et optimisations IA' },
  ];

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
                {agentInfo?.avatar_url ? (
                  <div className="w-24 h-24 rounded-2xl overflow-hidden ring-4 ring-primary/20 shadow-lg">
                    <img 
                      src={agentInfo.avatar_url} 
                      alt={agentInfo.name} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-primary/30">
                    <Bot className="h-12 w-12 text-white" />
                  </div>
                )}
              </motion.div>
              <CardTitle className="text-2xl font-bold">
                {agentInfo?.name || 'Portail Agent'}
              </CardTitle>
              <p className="text-muted-foreground mt-2">
                Connectez-vous pour accéder à votre tableau de bord
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
                  <Label htmlFor="loginId">Identifiant</Label>
                  <Input
                    id="loginId"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="Votre identifiant client"
                    className="h-12 bg-muted/30 border-border/50 focus:border-primary focus:ring-primary/20"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 bg-muted/30 border-border/50 focus:border-primary focus:ring-primary/20"
                    required
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-gradient-to-r from-primary via-purple-500 to-pink-500 hover:opacity-90 transition-all shadow-lg shadow-primary/30 font-semibold" 
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Se connecter
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link 
                  to="/client/forgot-password" 
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Right side - Features */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-lg space-y-8"
        >
          {/* Logo - white-labeled per organization */}
          <div className="flex items-center gap-4 mb-10">
            {orgBranding?.logo_url ? (
              <img
                src={orgBranding.logo_url}
                alt={orgBranding.name || 'Organization'}
                className="w-16 h-16 rounded-2xl object-cover ring-2 ring-primary/20"
              />
            ) : (
              <AvaStatisticsLogo size="lg" animated showText={false} />
            )}
            <div>
              <h2 className="text-4xl font-black bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">
                {orgBranding?.name || 'AVA Statistics'}
              </h2>
              <p className="text-muted-foreground mt-1">Votre portail d'analytics intelligent</p>
            </div>
          </div>

          {/* Features grid */}
          <div className="grid grid-cols-2 gap-4">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 + i * 0.1 }}
                className="p-5 rounded-2xl bg-card/40 backdrop-blur-sm border border-border/30 hover:border-primary/30 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="flex items-center gap-6 pt-6"
          >
            {[
              { value: '99.9%', label: 'Uptime' },
              { value: '<100ms', label: 'Latence' },
              { value: '24/7', label: 'Support' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

const PortalLogin = () => (
  <PortalProvider>
    <PortalLoginContent />
  </PortalProvider>
);

export default PortalLogin;
