import { useEffect, useState } from 'react';
import { useNavigate, Outlet, useParams, Link, useLocation } from 'react-router-dom';
import { ClientProvider, useClient } from '@/context/ClientContext';
import { useClientAgentAccess } from '@/hooks/useClientAgentAccess';
import { supabase } from '@/integrations/supabase/client';
import { AgentSelector } from '@/components/client-portal/AgentSelector';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  LogOut, 
  LayoutDashboard, 
  MessageSquare, 
  BarChart3, 
  BookOpen, 
  Settings,
  Bot,
  Crown,
  Eye,
  ChevronLeft,
  Code,
  Loader2,
  User,
  ChevronUp,
  Globe,
  Wrench,
  Webhook,
  Palette
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AvaLogo } from '@/components/shared/AvaLogo';
import { GlowBadge } from '@/components/portal/GlowBadge';
import { useTranslation } from '@/hooks/useTranslation';
import { useLanguage } from '@/context/LanguageContext';
import { useApplyBranding } from '@/hooks/useApplyBranding';

const ClientAgentPortalContent = () => {
  const { isAuthenticated, isLoading: authLoading, session, logout, loginAsAdmin } = useClient();
  const { clientId, agentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  useApplyBranding(session?.organizationId, 'client');
  const [adminLoginAttempted, setAdminLoginAttempted] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  
  const { hasAccess, role, agentName, platform, isLoading: accessLoading } = useClientAgentAccess(clientId, agentId);

  useEffect(() => {
    // Already authenticated as client, no need to try admin login
    if (isAuthenticated) {
      setCheckingAdmin(false);
      return;
    }

    // Still loading client auth, wait
    if (authLoading) return;

    // No clientId in URL, redirect to login
    if (!clientId) {
      setCheckingAdmin(false);
      navigate('/client/login');
      return;
    }

    // Already attempted admin login, don't retry
    if (adminLoginAttempted) {
      setCheckingAdmin(false);
      return;
    }

    setAdminLoginAttempted(true);

    let cancelled = false;

    const attemptAdminLogin = async () => {
      try {
        // First try getting the session directly
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (!cancelled && authSession?.user) {
          const adminSession = await loginAsAdmin(clientId);
          if (!cancelled && adminSession) {
            setCheckingAdmin(false);
            return;
          }
        }
      } catch (err) {
        console.log('Admin auto-login failed (getSession):', err);
      }

      // If getSession didn't work, listen for auth state changes (token refresh, etc.)
      if (cancelled) return;

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (cancelled) {
          subscription.unsubscribe();
          return;
        }

        if (session?.user) {
          try {
            const adminSession = await loginAsAdmin(clientId);
            if (!cancelled && adminSession) {
              setCheckingAdmin(false);
              subscription.unsubscribe();
              return;
            }
          } catch (err) {
            console.log('Admin auto-login failed (onAuthStateChange):', err);
          }
        }

        // Only redirect on definitive events (not intermediate states)
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
          if (!cancelled) {
            setCheckingAdmin(false);
            navigate('/client/login');
          }
          subscription.unsubscribe();
        }
      });

      // Safety timeout - if nothing happens within 5 seconds, redirect
      setTimeout(() => {
        if (!cancelled) {
          setCheckingAdmin(false);
          navigate('/client/login');
          subscription.unsubscribe();
        }
      }, 5000);
    };

    attemptAdminLogin();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, clientId, loginAsAdmin, navigate, adminLoginAttempted]);

  useEffect(() => {
    if (!accessLoading && !hasAccess && clientId && agentId && !checkingAdmin && isAuthenticated) {
      navigate(`/client/${clientId}/conversations`);
    }
  }, [hasAccess, accessLoading, clientId, agentId, navigate, checkingAdmin, isAuthenticated]);

  // Show loading while checking admin or client auth
  if (authLoading || accessLoading || checkingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="h-8 w-8 text-primary" />
        </motion.div>
      </div>
    );
  }

  if (!isAuthenticated || !hasAccess) {
    return null;
  }

  const navSections = [
    {
      title: null,
      items: [
        { icon: LayoutDashboard, label: t('clientPortal.sidebar.dashboard') || 'Dashboard', href: `/client/${clientId}/agent/${agentId}/dashboard`, color: 'text-blue-400' },
        { icon: MessageSquare, label: t('clientPortal.sidebar.conversations') || 'Conversations', href: `/client/${clientId}/agent/${agentId}/conversations`, color: 'text-cyan-400' },
        { icon: BarChart3, label: t('clientPortal.sidebar.analytics') || 'Analytics', href: `/client/${clientId}/agent/${agentId}/analytics`, color: 'text-purple-400' },
      ],
    },
    {
      title: 'Configuration',
      items: [
        { icon: Settings, label: t('clientPortal.sidebar.settings') || 'Configuration', href: `/client/${clientId}/agent/${agentId}/settings`, color: 'text-pink-400' },
        { icon: BookOpen, label: t('clientPortal.sidebar.knowledge') || 'Base de connaissances', href: `/client/${clientId}/agent/${agentId}/knowledge`, color: 'text-green-400' },
        { icon: Wrench, label: 'MCP', href: `/client/${clientId}/agent/${agentId}/mcp`, color: 'text-amber-400' },
        { icon: Webhook, label: 'Webhooks', href: `/client/${clientId}/agent/${agentId}/webhooks`, color: 'text-red-400' },
      ],
    },
    {
      title: 'Intégration',
      items: [
        { icon: Code, label: 'Endpoints', href: `/client/${clientId}/agent/${agentId}/endpoints`, color: 'text-orange-400' },
        { icon: Palette, label: 'Widget', href: `/client/${clientId}/agent/${agentId}/widget`, color: 'text-teal-400' },
      ],
    },
  ];

  const navItems = navSections.flatMap(s => s.items);

  const handleLogout = () => {
    logout();
    navigate('/client/login');
  };

  const getRoleBadge = () => {
    if (role === 'admin') {
      return { variant: 'admin' as const, label: t('clientPortal.roles.admin') || 'Administrateur', icon: Crown };
    }
    return { variant: 'viewer' as const, label: t('clientPortal.roles.viewer') || 'Lecture seule', icon: Eye };
  };

  const roleBadge = getRoleBadge();

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" />
      </div>

      {/* Sidebar */}
      <motion.aside 
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="relative w-72 border-r border-border/50 bg-card/80 backdrop-blur-xl flex flex-col z-10"
      >
        {/* Header with AVA Logo */}
        <div className="p-5 border-b border-border/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <AvaLogo size="sm" />
              <div className="flex-1 min-w-0">
                <span className="font-bold text-lg bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  AVA Statistics
                </span>
                <span className="text-xs text-muted-foreground block mt-0.5">
                  {t('clientPortal.title') || 'Client Portal'}
                </span>
              </div>
            </div>
            {/* Language Toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => setLanguage('en')}
                  className={language === 'en' ? 'bg-primary/10' : ''}
                >
                  🇬🇧 English
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setLanguage('fr')}
                  className={language === 'fr' ? 'bg-primary/10' : ''}
                >
                  🇫🇷 Français
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* Agent info */}
          <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="h-4 w-4 text-primary" />
              <p className="font-medium truncate text-sm">{agentName || 'Agent'}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-2 capitalize">{platform || 'Platform'}</p>
            <div className="flex items-center gap-2">
              <GlowBadge variant={roleBadge.variant} className="flex items-center gap-1">
                <roleBadge.icon className="h-3 w-3" />
                {roleBadge.label}
              </GlowBadge>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 p-4">
          <nav className="space-y-4 mb-6">
            {navSections.map((section, sIdx) => (
              <div key={sIdx}>
                {section.title && (
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5 px-3">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item, index) => {
                    const isActive = location.pathname === item.href;
                    return (
                      <motion.div
                        key={item.href}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: (sIdx * 3 + index) * 0.03 }}
                      >
                        <Link to={item.href}>
                          <Button
                            variant="ghost"
                            className={`w-full justify-start gap-3 h-10 transition-all duration-150 ${
                              isActive 
                                ? 'bg-primary/10 text-primary border-l-2 border-primary shadow-[0_0_15px_rgba(var(--primary),0.2)]' 
                                : 'hover:bg-muted/50 hover:translate-x-1'
                            }`}
                          >
                            <item.icon className={`h-4 w-4 ${isActive ? 'text-primary' : item.color}`} />
                            <span className={`text-sm ${isActive ? 'font-medium' : ''}`}>{item.label}</span>
                          </Button>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Agent Selector */}
          <AgentSelector />
        </ScrollArea>

        {/* Footer with User Menu */}
        <div className="p-4 border-t border-border/50 space-y-2">
          <Link to={`/client/${clientId}/conversations`}>
            <Button variant="ghost" className="w-full justify-start gap-2">
              <ChevronLeft className="h-4 w-4" />
              {t('clientPortal.actions.backToPortal') || 'Retour au portail'}
            </Button>
          </Link>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer group">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">
                    {session?.clientName?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm truncate flex-1 text-left">{session?.clientName}</span>
                <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleLogout}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="h-4 w-4 mr-2" />
                {t('clientPortal.actions.logout') || 'Déconnexion'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto relative z-10">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="container mx-auto p-6 max-w-7xl"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
};

const ClientAgentPortal = () => {
  return (
    <ClientProvider>
      <ClientAgentPortalContent />
    </ClientProvider>
  );
};

export default ClientAgentPortal;
