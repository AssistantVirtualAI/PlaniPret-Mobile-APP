import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

const testimonialColors = [
  'from-blue-500 to-cyan-500',
  'from-purple-500 to-pink-500',
  'from-orange-500 to-amber-500',
];

export const TestimonialsSection = () => {
  const { t } = useTranslation();

  const testimonialKeys = ['testimonial1', 'testimonial2', 'testimonial3'] as const;
  const statKeys = ['stat1', 'stat2', 'stat3'] as const;

  return (
    <section className="py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="flex flex-wrap justify-center gap-8 md:gap-16 mb-20"
        >
          {statKeys.map((stat, index) => (
            <motion.div
              key={stat}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
                {t(`testimonials.${stat}.value`)}
              </div>
              <div className="text-muted-foreground">
                {t(`testimonials.${stat}.label`)}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/10 border border-secondary/20 text-secondary mb-6"
          >
            <Star className="w-4 h-4 fill-current" />
            <span className="text-sm font-medium">{t('testimonials.badge')}</span>
          </motion.div>

          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            {t('testimonials.title')}
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {t('testimonials.subtitle')}
          </p>
        </motion.div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonialKeys.map((key, index) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -8 }}
              className="relative p-8 rounded-3xl bg-card/50 backdrop-blur-xl border border-border/50 hover:border-primary/50 transition-all duration-300"
            >
              {/* Quote icon */}
              <div className={`absolute -top-4 right-8 w-10 h-10 rounded-full bg-gradient-to-br ${testimonialColors[index]} flex items-center justify-center shadow-lg`}>
                <Quote className="w-5 h-5 text-white" />
              </div>

              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>

              {/* Content */}
              <p className="text-lg mb-6 leading-relaxed">
                "{t(`testimonials.${key}.content`)}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${testimonialColors[index]} flex items-center justify-center text-white font-bold`}>
                  {t(`testimonials.${key}.author`).charAt(0)}
                </div>
                <div>
                  <div className="font-semibold">
                    {t(`testimonials.${key}.author`)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t(`testimonials.${key}.role`)}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
