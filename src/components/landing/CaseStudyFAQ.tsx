import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MessageCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export type FAQItem = {
  qFr: string;
  aFr: string;
  qEn: string;
  aEn: string;
};

type Props = {
  items: FAQItem[];
  accent: string;
  contactHref?: string;
};

export const CaseStudyFAQ = ({ items, accent, contactHref = "/#contact" }: Props) => {
  const { language } = useLanguage();
  const isEn = language === "en";
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="relative py-24">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="text-center mb-12">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
            style={{ background: `${accent}22`, border: `1px solid ${accent}55` }}
          >
            <span className="text-xs font-semibold" style={{ color: accent }}>
              FAQ
            </span>
          </div>
          <h3 className="text-3xl md:text-5xl font-bold text-white">
            {isEn ? "Frequently asked questions" : "Questions fréquentes"}
          </h3>
        </div>

        <div className="space-y-3">
          {items.map((it, i) => {
            const open = openIdx === i;
            return (
              <div
                key={i}
                className="rounded-2xl backdrop-blur-xl overflow-hidden"
                style={{
                  background: "rgba(13,31,53,0.5)",
                  border: `1px solid ${accent}22`,
                }}
              >
                <button
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-left"
                  aria-expanded={open}
                >
                  <span className="text-white font-semibold text-base md:text-lg">
                    {isEn ? it.qEn : it.qFr}
                  </span>
                  <ChevronDown
                    className="w-5 h-5 flex-none transition-transform text-white/70"
                    style={{
                      color: accent,
                      transform: open ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 text-white/70 leading-relaxed text-sm md:text-base">
                        {isEn ? it.aEn : it.aFr}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3">
          <p className="text-white/60 text-sm">
            {isEn ? "Still have questions?" : "D'autres questions ?"}
          </p>
          <a
            href={contactHref}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-white transition-transform hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}CC)`,
              boxShadow: `0 15px 40px -15px ${accent}`,
            }}
          >
            <MessageCircle className="w-4 h-4" />
            {isEn ? "Contact our team" : "Contacter notre équipe"}
          </a>
        </div>
      </div>
    </section>
  );
};
