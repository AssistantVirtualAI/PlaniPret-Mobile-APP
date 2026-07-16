import { useEffect } from 'react';
import { useNavigate, Outlet, useParams, Link, useLocation } from 'react-router-dom';
import { usePortal, PortalProvider } from '@/hooks/usePortalAuth';
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
  FileCode,
  Loader2,
  ArrowLeft,
  Crown,
  Sparkles,
  User,
  ChevronUp,
  Globe,
  Sun,
  Moon
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { motion } from 'framer-motion';
import { AvaLogo } from '@/components/shared/AvaLogo';
import { AvaFooter } from '@/components/shared/AvaFooter';
import { GlowBadge } from '@/components/portal/GlowBadge';
import { useTranslation } from '@/hooks/useTranslation';
import { useLanguage } from '@/context/LanguageContext';

const PortalLayoutContent = () => {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, isLoading, session, logout, hasEditAccess, isSuperAdmin } = usePortal();
  const { agentSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Detect if using legacy /portal/ route or new root route
  const isLegacyRoute = location.pathname.startsWith('/portal/');
  const baseRoute = isLegacyRoute ? `/portal/${agentSlug}` : `/${agentSlug}`;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate(baseRoute);
    }
  }, [isAuthenticated, isLoading, navigate, baseRoute]);

  useEffect(() => {
    if (!isLoading && session && session.agentSlug !== agentSlug) {
      logout();
      navigate(baseRoute);
    }
  }, [session, agentSlug, isLoading, logout, navigate, baseRoute]);

  if (isLoading) {
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

  if (!isAuthenticated || !session) {
    return null;
  }

  const isSuperAdminSession = session.role === 'super_admin' || session.isSuperAdmin;

  // Navigation items - show Configuration only to admins
  const navItems = [
    { icon: LayoutDashboard, labelKey: 'clientPortal.sidebar.dashboard', href: `${baseRoute}/dashboard`, color: 'text-blue-400' },
    { icon: MessageSquare, labelKey: 'clientPortal.sidebar.conversations', href: `${baseRoute}/conversations`, color: 'text-cyan-400' },
    { icon: BarChart3, labelKey: 'clientPortal.sidebar.analytics', href: `${baseRoute}/analytics`, color: 'text-purple-400' },
    { icon: BookOpen, labelKey: 'clientPortal.sidebar.knowledge', href: `${baseRoute}/knowledge`, color: 'text-green-400' },
    { icon: FileCode, labelKey: 'clientPortal.sidebar.prompt', href: `${baseRoute}/prompt`, color: 'text-orange-400' },
  ];

  // Add settings for admins and super admins only
  if (hasEditAccess() || isSuperAdminSession) {
    navItems.push({ icon: Settings, labelKey: 'clientPortal.sidebar.settings', href: `${baseRoute}/settings`, color: 'text-pink-400' });
  }

  const handleLogout = () => {
    logout();
    navigate(baseRoute);
  };

  const handleBackToAdmin = () => {
    // Use full page reload to properly reset all contexts
    window.location.href = '/agents';
  };

  const handleProfileClick = () => {
    navigate(`${baseRoute}/profile`);
  };

  const getRoleBadge = () => {
    if (isSuperAdminSession) {
      return { variant: 'warning' as const, label: t('clientPortal.roles.superAdmin'), icon: Crown };
    }
    if (session.role === 'admin') {
      return { variant: 'admin' as const, label: t('clientPortal.roles.admin'), icon: null };
    }
    return { variant: 'viewer' as const, label: t('clientPortal.roles.viewer'), icon: null };
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
                  {isSuperAdminSession ? t('clientPortal.roles.superAdmin') : t('clientPortal.title')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Theme Toggle */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8" 
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Moon className="w-4 h-4 text-muted-foreground" />
                )}
              </Button>
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
          </div>
          
          {/* Agent info */}
          <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
            <p className="font-medium truncate text-sm">{session.agentName}</p>
            <div className="mt-2 flex items-center gap-2">
              <GlowBadge variant={roleBadge.variant} className="flex items-center gap-1">
                {roleBadge.icon && <roleBadge.icon className="h-3 w-3" />}
                {roleBadge.label}
              </GlowBadge>
            </div>
          </div>

          {/* Super Admin: Back to Admin Dashboard */}
          {isSuperAdminSession && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3 gap-2 border-primary/30 text-primary hover:bg-primary/10"
              onClick={handleBackToAdmin}
            >
              <ArrowLeft className="h-4 w-4" />
              {t('clientPortal.actions.backToAdmin')}
            </Button>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 p-4">
          <nav className="space-y-1.5">
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
                      <span className={isActive ? 'font-medium' : ''}>{t(item.labelKey)}</span>
                    </Button>
                  </Link>
                </motion.div>
              );
            })}
          </nav>

          {/* Super Admin Indicator */}
          {isSuperAdminSession && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-6 p-4 rounded-xl bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20"
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <span className="font-medium text-yellow-500 text-sm">{t('clientPortal.superAdminMode')}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('clientPortal.superAdminAccess')}
              </p>
            </motion.div>
          )}
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
              <DropdownMenuItem onClick={handleProfileClick}>
                <User className="h-4 w-4 mr-2" />
                {t('clientPortal.actions.myProfile')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleLogout}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="h-4 w-4 mr-2" />
                {t('clientPortal.actions.logout')}
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

const PortalLayout = () => (
  <PortalProvider>
    <PortalLayoutContent />
  </PortalProvider>
);

export default PortalLayout;