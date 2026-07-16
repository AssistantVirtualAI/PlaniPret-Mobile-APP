import { useEffect, useState } from 'react';
import { useClient } from '@/context/ClientContext';
import { useClientAssignedAgents } from '@/hooks/useClientAgentAccess';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  LogOut, 
  MessageSquare, 
  BarChart3, 
  Bot,
  Crown,
  Eye,
  User,
  ChevronUp,
  Globe,
  Loader2
} from 'lucide-react';
import { Link, useLocation, useNavigate, Outlet, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AvaLogo } from '@/components/shared/AvaLogo';
import { AvaFooter } from '@/components/shared/AvaFooter';
import { GlowBadge } from '@/components/portal/GlowBadge';
import { useTranslation } from '@/hooks/useTranslation';
import { useLanguage } from '@/context/LanguageContext';
import { useApplyBranding } from '@/hooks/useApplyBranding';

export const ClientLayout = () => {
  const { session, logout, isLoading: authLoading, isAuthenticated, loginAsAdmin } = useClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  useApplyBranding(session?.organizationId, 'client');
  const { language, setLanguage } = useLanguage();
  const [adminLoginAttempted, setAdminLoginAttempted] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  const { clientId } = useParams();

  const { data: assignedAgents, isLoading: agentsLoading } = useClientAssignedAgents(session?.clientId);

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

  // Auto-redirect to agent portal if client has exactly one agent
  useEffect(() => {
    if (!session || !isAuthenticated || agentsLoading || !assignedAgents) return;
    
    if (assignedAgents.length === 1 && assignedAgents[0].agent?.id) {
      const agentId = assignedAgents[0].agent.id;
      const currentPath = location.pathname;
      // Only redirect if we're on the main portal pages (not already in agent portal)
      if (!currentPath.includes('/agent/')) {
        navigate(`/client/${session.clientId}/agent/${agentId}/dashboard`, { replace: true });
      }
    }
  }, [session, isAuthenticated, agentsLoading, assignedAgents, navigate, location.pathname]);

  // Show loading while checking admin or client auth
  if (authLoading || checkingAdmin) {
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

  if (!session || !isAuthenticated) return null;

  const navItems = [
    { icon: MessageSquare, label: t('clientPortal.sidebar.conversations') || 'Conversations', href: `/client/${session.clientId}/conversations`, color: 'text-cyan-400' },
    { icon: BarChart3, label: t('clientPortal.sidebar.analytics') || 'Analytics', href: `/client/${session.clientId}/analytics`, color: 'text-purple-400' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/client/login');
  };

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
          
          {/* Client info */}
          <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
            <p className="font-medium truncate text-sm">{session.clientName}</p>
            <div className="mt-2 flex items-center gap-2">
              <GlowBadge variant="viewer" className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Client
              </GlowBadge>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 p-4">
          <nav className="space-y-1.5 mb-6">
            {navItems.map((item, index) => {
              const isActive = location.pathname === item.href;
              return (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link to={item.href}>
                    <Button
                      variant="ghost"
                      className={`w-full justify-start gap-3 h-11 transition-all duration-200 ${
                        isActive 
                          ? 'bg-primary/10 text-primary border-l-2 border-primary shadow-[0_0_15px_rgba(var(--primary),0.2)]' 
                          : 'hover:bg-muted/50 hover:translate-x-1'
                      }`}
                    >
                      <item.icon className={`h-4 w-4 ${isActive ? 'text-primary' : item.color}`} />
                      <span className={isActive ? 'font-medium' : ''}>{item.label}</span>
                    </Button>
                  </Link>
                </motion.div>
              );
            })}
          </nav>

          {/* Agents Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              {t('clientPortal.myAgents') || 'Mes Agents'}
            </h3>
            {agentsLoading ? (
              <div className="space-y-2">
                <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
                <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
              </div>
            ) : !assignedAgents || assignedAgents.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-4 text-center text-muted-foreground">
                  <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('clientPortal.noAgents') || 'Aucun agent assigné'}</p>
                </CardContent>
              </Card>
            ) : (
              assignedAgents.map(({ assignmentId, role, agent }) => (
                <motion.div
                  key={assignmentId}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Link to={`/client/${session.clientId}/agent/${agent?.id}/dashboard`}>
                    <Card className="cursor-pointer transition-all hover:border-primary/50 hover:bg-muted/30">
                      <CardContent className="p-3 flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={agent?.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/10">
                            <Bot className="h-5 w-5 text-primary" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">{agent?.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{agent?.platform}</p>
                        </div>
                        <Badge 
                          variant={role === 'admin' ? 'default' : 'secondary'}
                          className="flex items-center gap-1 text-xs"
                        >
                          {role === 'admin' ? (
                            <>
                              <Crown className="h-3 w-3" />
                              Admin
                            </>
                          ) : (
                            <>
                              <Eye className="h-3 w-3" />
                              Viewer
                            </>
                          )}
                        </Badge>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer with User Menu */}
        <div className="p-4 border-t border-border/50">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer group">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">
                    {session.clientName?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm truncate flex-1 text-left">{session.clientName}</span>
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
      <main className="flex-1 overflow-auto relative z-10 flex flex-col">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="container mx-auto p-6 max-w-7xl flex-1"
        >
          <Outlet />
        </motion.div>
        <AvaFooter />
      </main>
    </div>
  );
};

export default ClientLayout;
