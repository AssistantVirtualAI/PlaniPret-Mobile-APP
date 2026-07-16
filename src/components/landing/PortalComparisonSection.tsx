import { motion } from "framer-motion";
import {
  Building2,
  Users,
  Check,
  X,
  Shield,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/locales";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};

const FeatureValue = ({ value }: { value: boolean | string }) => {
  if (value === true) return <Check className="w-5 h-5 text-success" />;
  if (value === false) return <X className="w-5 h-5 text-muted-foreground/40" />;
  return <span className="text-sm text-muted-foreground">{value}</span>;
};

export const PortalComparisonSection = () => {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const navigate = useNavigate();

  const agencyFeatures = translations[language].portalComparison.agency.features as unknown as string[];
  const clientFeatures = translations[language].portalComparison.client.features as unknown as string[];

  const tableKeys = [
    "multiClient",
    "createAgents",
    "globalAnalytics",
    "billing",
    "whiteLabel",
    "apiAccess",
    "conversations",
    "editPrompt",
    "knowledgeBase",
    "customTheme",
  ] as const;

  type TableRow = { key: string; agency: boolean | string; client: boolean | string };
  const tableData: TableRow[] = [
    { key: "multiClient", agency: true, client: false },
    { key: "createAgents", agency: true, client: false },
    { key: "globalAnalytics", agency: true, client: false },
    { key: "billing", agency: true, client: false },
    { key: "whiteLabel", agency: true, client: false },
    { key: "apiAccess", agency: true, client: false },
    { key: "conversations", agency: true, client: true },
    { key: "editPrompt", agency: true, client: true },
    { key: "knowledgeBase", agency: true, client: true },
    { key: "customTheme", agency: true, client: true },
  ];

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-accent mb-6"
          >
            <Shield className="w-4 h-4" />
            <span className="text-sm font-medium">{t("portalComparison.badge")}</span>
          </motion.div>

          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6">
            {t("portalComparison.title")}
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {t("portalComparison.subtitle")}
          </p>
        </motion.div>

        {/* Split Portal Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Agency Portal */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative group"
          >
            <div className="absolute -inset-1 bg-gradient-to-br from-primary/20 to-secondary/10 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative p-8 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/25">
                  <Building2 className="w-7 h-7 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{t("portalComparison.agency.title")}</h3>
                  <p className="text-sm text-muted-foreground">{t("portalComparison.agency.subtitle")}</p>
                </div>
              </div>
              <p className="text-muted-foreground mb-5">{t("portalComparison.agency.description")}</p>
              <ul className="space-y-2.5">
                {agencyFeatures.map((f: string, i: number) => (
                  <li key={i} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-primary shrink-0" />
                    <span className="text-sm">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          {/* Client Portal */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative group"
          >
            <div className="absolute -inset-1 bg-gradient-to-br from-secondary/20 to-accent/10 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative p-8 rounded-3xl bg-gradient-to-br from-secondary/10 to-secondary/5 border border-secondary/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center shadow-lg shadow-secondary/25">
                  <Users className="w-7 h-7 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{t("portalComparison.client.title")}</h3>
                  <p className="text-sm text-muted-foreground">{t("portalComparison.client.subtitle")}</p>
                </div>
              </div>
              <p className="text-muted-foreground mb-5">{t("portalComparison.client.description")}</p>
              <ul className="space-y-2.5">
                {clientFeatures.map((f: string, i: number) => (
                  <li key={i} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-secondary shrink-0" />
                    <span className="text-sm">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>

        {/* Comparison Table */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="bg-card/50 backdrop-blur-xl rounded-3xl border border-border overflow-hidden mb-12"
        >
          <div className="grid grid-cols-3 gap-4 p-6 bg-muted/50 border-b border-border">
            <div className="font-semibold">{t("portalComparison.table.feature")}</div>
            <div className="font-semibold text-center">{t("portalComparison.agency.title")}</div>
            <div className="font-semibold text-center">{t("portalComparison.client.title")}</div>
          </div>
          <div className="divide-y divide-border">
            {tableData.map((item) => (
              <motion.div
                key={item.key}
                variants={itemVariants}
                className="grid grid-cols-3 gap-4 p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center">
                  <span className="text-sm">{t(`portalComparison.table.${item.key}`)}</span>
                </div>
                <div className="flex justify-center items-center">
                  <FeatureValue value={item.agency} />
                </div>
                <div className="flex justify-center items-center">
                  <FeatureValue value={item.client} />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Bottom statement */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <p className="text-2xl md:text-3xl font-bold mb-6">
            {t("portalComparison.bottomStatement")}
          </p>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              size="lg"
              className="h-14 px-8 bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-xl shadow-primary/25"
              onClick={() => navigate("/demo-request")}
            >
              {t("cta.cta2")}
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};
