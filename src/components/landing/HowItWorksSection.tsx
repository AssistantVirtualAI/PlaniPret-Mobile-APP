import { motion } from 'framer-motion';
import { UserPlus, Settings, Users, BarChart3 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

const steps = [
  {
    icon: UserPlus,
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
    key: 'step1',
  },
  {
    icon: Settings,
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500/10',
    key: 'step2',
  },
  {
    icon: Users,
    color: 'from-orange-500 to-amber-500',
    bgColor: 'bg-orange-500/10',
    key: 'step3',
  },
  {
    icon: BarChart3,
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10',
    key: 'step4',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
};

export const HowItWorksSection = () => {
  const { t } = useTranslation();

  return (
    <section className="py-32 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/10 border border-secondary/20 text-secondary mb-6"
          >
            <span className="text-sm font-medium">{t('howItWorks.badge')}</span>
          </motion.div>

          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            {t('howItWorks.title')}
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {t('howItWorks.subtitle')}
          </p>
        </motion.div>

        {/* Steps */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative"
        >
          {/* Connection line (desktop only) */}
          <div className="hidden lg:block absolute top-20 left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 opacity-30" />

          {steps.map((step, index) => (
            <motion.div
              key={step.key}
              variants={itemVariants}
              className="relative"
            >
              {/* Step number */}
              <motion.div
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 + 0.3, type: 'spring', stiffness: 200 }}
                className={`absolute -top-3 -left-3 w-8 h-8 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center text-white font-bold text-sm shadow-lg z-10`}
              >
                {index + 1}
              </motion.div>

              <motion.div
                whileHover={{ y: -5, scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className={`${step.bgColor} p-8 rounded-3xl border border-border/50 backdrop-blur-xl h-full`}
              >
                {/* Icon */}
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-6 shadow-lg`}>
                  <step.icon className="w-8 h-8 text-white" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold mb-3">
                  {t(`howItWorks.${step.key}.title`)}
                </h3>
                <p className="text-muted-foreground">
                  {t(`howItWorks.${step.key}.description`)}
                </p>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
