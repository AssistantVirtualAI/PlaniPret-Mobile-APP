import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AvaStatisticsLogo as AvaLogo } from "@/components/shared/AvaStatisticsLogo";
import { useTranslation } from "@/hooks/useTranslation";

export const FooterSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const scrollToSection = (id: string) => {
    if (location.pathname === '/') {
      const element = document.getElementById(id);
      element?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/#' + id);
    }
  };

  return (
    <footer className="relative pt-24 pb-12 bg-gradient-to-b from-background to-card/50 border-t border-border/50">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-16">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-6"
            >
              <AvaLogo size="sm" animated={false} showText={false} className="[&_div:first-child]:w-20 [&_div:first-child]:h-20 [&_img]:w-20 [&_img]:h-20" />
            </motion.div>
            <p className="text-muted-foreground mb-6">
              {t('footer.description')}
            </p>
            <a
              href="mailto:contact@avastatistics.com"
              className="w-10 h-10 rounded-xl bg-muted/50 hover:bg-primary/10 hover:text-primary flex items-center justify-center transition-colors"
              aria-label="Email"
            >
              <Mail className="w-5 h-5" />
            </a>
          </div>

          {/* Product column */}
          <div>
            <h4 className="font-semibold mb-4">{t('footer.product')}</h4>
            <ul className="space-y-3">
              <li>
                <button onClick={() => scrollToSection('features')} className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('footer.features')}
                </button>
              </li>
              <li>
                <button onClick={() => scrollToSection('pricing')} className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('footer.pricing')}
                </button>
              </li>
              <li>
                <button onClick={() => scrollToSection('integrations')} className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('footer.integrations')}
                </button>
              </li>
            </ul>
          </div>

          {/* Company column */}
          <div>
            <h4 className="font-semibold mb-4">{t('footer.company')}</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/contact" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('footer.contact')}
                </Link>
              </li>
              <li>
                <Link to="/demo-request" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('footer.bookDemo')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <h4 className="font-semibold mb-4">{t('footer.legal')}</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('footer.privacy')}
                </Link>
              </li>
              <li>
                <Link to="/legal" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('footer.terms')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4"
        >
          <p className="text-sm text-muted-foreground">
            {t('footer.copyright')}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {t('footer.systemStatus')}
            </span>
          </div>
        </motion.div>
      </div>
    </footer>
  );
};
