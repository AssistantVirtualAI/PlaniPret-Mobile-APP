import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { AvaStatisticsLogo as AvaLogo } from '@/components/shared/AvaStatisticsLogo';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Globe, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { useTranslation } from '@/hooks/useTranslation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { language, toggleLanguage } = useLanguage();
  const { t } = useTranslation();

  const navLinks = [
    { label: t('nav.howItWorks'), href: '#how-it-works' },
    { label: t('nav.agentCreation'), href: '#agent-creation' },
    { label: t('nav.features'), href: '#features' },
    { label: t('nav.fullList'), href: '/features' },
    { label: t('nav.portals'), href: '#portals' },
    { label: t('nav.integrations'), href: '#integrations' },
    { label: t('nav.analytics'), href: '#analytics' },
    { label: t('nav.testimonials'), href: '#testimonials' },
    { label: t('nav.pricing'), href: '#pricing' },
    { label: t('nav.contact'), href: '/contact' },
  ];

  // Keep the header clean: show core links + a “More” menu for the rest.
  const primaryLinks = navLinks.filter((l) =>
    ['#how-it-works', '#features', '#pricing'].includes(l.href)
  );
  const moreLinks = navLinks.filter((l) => !primaryLinks.some((p) => p.href === l.href));

  const scrollToSection = (href: string) => {
    setIsMobileMenuOpen(false);
    if (href.startsWith('#')) {
      if (location.pathname === '/') {
        const element = document.querySelector(href);
        element?.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate('/' + href);
      }
      return;
    }
    navigate(href);
  };

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/70 backdrop-blur-xl border-b border-border/50"
    >
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <AvaLogo size="sm" animated={false} showText={false} className="[&_div:first-child]:w-14 [&_div:first-child]:h-14 [&_img]:w-14 [&_img]:h-14" />

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {primaryLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => scrollToSection(link.href)}
                className="px-3 py-1.5 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors font-medium whitespace-nowrap"
              >
                {link.label}
              </button>
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="w-4 h-4" />
                  <span className="ml-2 font-medium whitespace-nowrap">{t('nav.more')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                {moreLinks.map((link) => (
                  <DropdownMenuItem
                    key={link.href}
                    onClick={() => scrollToSection(link.href)}
                    className="cursor-pointer"
                  >
                    {link.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>

          {/* Desktop CTA + Language */}
          <div className="hidden md:flex items-center gap-2">
            {/* Language Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="flex items-center gap-2 rounded-full"
            >
              <Globe className="w-4 h-4" />
              <span className="font-medium">{language.toUpperCase()}</span>
            </Button>

            <Button
              variant="ghost"
              onClick={() => navigate('/login')}
            >
              {t('nav.login')}
            </Button>
             <Button
               variant="outline"
               onClick={() => navigate('/demo-request')}
               className="rounded-full"
             >
               {t('nav.bookDemo')}
             </Button>
            <Button
              className="rounded-full bg-gradient-to-r from-primary to-secondary hover:opacity-90"
              onClick={() => navigate('/login')}
            >
              {t('nav.getStarted')}
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
            >
              <Globe className="w-4 h-4" />
              <span className="ml-1 font-medium">{language.toUpperCase()}</span>
            </Button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border"
        >
          <div className="container mx-auto px-6 py-4 space-y-4">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => scrollToSection(link.href)}
                className="block w-full text-left text-muted-foreground hover:text-foreground transition-colors font-medium py-2"
              >
                {link.label}
              </button>
            ))}
            <div className="flex flex-col gap-2 pt-4 border-t border-border">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate('/login')}
              >
                {t('nav.login')}
              </Button>
               <Button
                 variant="outline"
                 className="w-full"
                 onClick={() => navigate('/demo-request')}
               >
                 {t('nav.bookDemo')}
               </Button>
              <Button
                className="w-full bg-gradient-to-r from-primary to-secondary"
                onClick={() => navigate('/login')}
              >
                {t('nav.getStarted')}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </motion.header>
  );
};
