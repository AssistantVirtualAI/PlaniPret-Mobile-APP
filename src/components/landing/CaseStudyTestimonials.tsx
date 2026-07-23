import { motion } from "framer-motion";
import { Quote, Star } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export type Testimonial = {
  quoteFr: string;
  quoteEn: string;
  author: string;
  role: string;
  company: string;
};

type Props = {
  accent: string; // hex
  glow?: string;
  testimonials: Testimonial[];
  logos: { name: string; label?: string }[];
  titleFr?: string;
  titleEn?: string;
  logosTitleFr?: string;
  logosTitleEn?: string;
};

export const CaseStudyTestimonials = ({
  accent,
  glow,
  testimonials,
  logos,
  titleFr = "Ce que nos clients disent",
  titleEn = "What our clients say",
  logosTitleFr = "Ils nous font confiance",
  logosTitleEn = "Trusted by teams like",
}: Props) => {
  const { language } = useLanguage();
  const isEn = language === "en";
  const g = glow ?? accent;

  return (
    <section className="relative py-24 overflow-hidden">
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{ background: `radial-gradient(600px 400px at 50% 0%, ${g}22, transparent 70%)` }}
      />
      <div className="container mx-auto px-6 relative z-10">
        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-3xl md:text-5xl font-bold text-white text-center mb-14"
        >
          {isEn ? titleEn : titleFr}
        </motion.h3>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {testimonials.map((t, i) => (
            <motion.figure
              key={t.author}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              whileHover={{ y: -4 }}
              className="p-7 rounded-2xl backdrop-blur-xl flex flex-col"
              style={{
                background: "rgba(13,31,53,0.55)",
                border: `1px solid ${accent}33`,
                boxShadow: `0 20px 60px -30px ${accent}66`,
              }}
            >
              <Quote className="w-8 h-8 mb-4" style={{ color: accent }} />
              <blockquote className="text-white/85 text-base leading-relaxed flex-1">
                “{isEn ? t.quoteEn : t.quoteFr}”
              </blockquote>
              <div className="flex items-center gap-1 mt-5 mb-4">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} className="w-4 h-4 fill-current" style={{ color: accent }} />
                ))}
              </div>
              <figcaption>
                <div className="text-white font-semibold text-sm">{t.author}</div>
                <div className="text-white/60 text-xs">
                  {t.role} · {t.company}
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>

        <div className="text-center">
          <div className="text-white/50 text-xs uppercase tracking-[0.2em] mb-6">
            {isEn ? logosTitleEn : logosTitleFr}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
            {logos.map((l) => (
              <div
                key={l.name}
                className="px-5 py-3 rounded-xl backdrop-blur-xl text-white/80 text-sm font-semibold tracking-wide"
                style={{
                  background: "rgba(13,31,53,0.5)",
                  border: `1px solid ${accent}22`,
                }}
                title={l.label ?? l.name}
              >
                {l.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
